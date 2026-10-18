import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Client } from 'typesense';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { config } from '../../config';
import { ProductsRepository } from './products.repository';

export interface SearchPage {
  ids: string[];
  /** All matches, not just this page. */
  found: number;
}

interface ProductSearchDoc {
  id: string;
  businessId: string;
  name: string;
  sku: string;
  status: string;
}

/** When Postgres must filter or sort the matches, it gets at most this many, best first. */
const MAX_HITS = 1000;
const PAGE = 250; // Typesense's per_page ceiling
const REINDEX_BATCH = 1000;
/** Bump when the fields below change: a new collection is built from Postgres on the next boot. */
const SCHEMA_VERSION = 1;

/**
 * Product search over Typesense: name and SKU, prefix and typo tolerant, in milliseconds at any catalogue size.
 * The index holds only what is searched; prices and stock are always read fresh from Postgres by id.
 * Typesense is never the source of truth: a failed sync is logged and repaired by the reindex on boot,
 * and when Typesense is down or not configured, callers fall back to Postgres (`ids()` returns null).
 */
@Injectable()
export class ProductSearch implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductSearch.name);
  private readonly client: Client | null;
  private readonly collection: string;
  /** The boot-time check; a manual rebuild waits for it so the two never race. */
  private preparing: Promise<void> = Promise.resolve();

  constructor(private readonly products: ProductsRepository) {
    const search = config().search;
    this.collection = `${search?.collection ?? 'products'}_v${SCHEMA_VERSION}`;
    this.client = search
      ? new Client({ nodes: [{ url: search.url }], apiKey: search.apiKey, connectionTimeoutSeconds: 2, numRetries: 1 })
      : null;
  }

  onApplicationBootstrap(): void {
    // In the background: the API serves requests (with the Postgres fallback) while the index catches up.
    if (this.client) this.preparing = this.prepare();
  }

  /**
   * One page of matches for one business, best first, plus how many match in total.
   * Null when search is unavailable (callers fall back to Postgres).
   */
  async page(businessId: string, q: string, opts: { status?: string; page: number; perPage: number }): Promise<SearchPage | null> {
    if (!this.client) return null;
    try {
      const res = await this.search(businessId, q, opts.status, opts.page, opts.perPage);
      return { ids: (res.hits ?? []).map((h) => h.document.id), found: res.found };
    } catch (error) {
      this.logger.warn({ err: error }, 'Product search unavailable; falling back to Postgres');
      return null;
    }
  }

  /**
   * Up to MAX_HITS matching ids, best first, for lists that Postgres must still filter or sort
   * (by category, missing cost, price…). Null when search is unavailable.
   */
  async ids(businessId: string, q: string, opts: { status?: string } = {}): Promise<string[] | null> {
    if (!this.client) return null;
    try {
      const ids: string[] = [];
      for (let page = 1; ids.length < MAX_HITS; page++) {
        const res = await this.search(businessId, q, opts.status, page, PAGE);
        const hits = res.hits ?? [];
        ids.push(...hits.map((h) => h.document.id));
        if (hits.length < PAGE || ids.length >= res.found) break;
      }
      return ids;
    } catch (error) {
      this.logger.warn({ err: error }, 'Product search unavailable; falling back to Postgres');
      return null;
    }
  }

  /** Re-reads these products from Postgres and upserts them into the index. Never throws. */
  async index(productIds: string[]): Promise<void> {
    if (!this.client || productIds.length === 0) return;
    try {
      await this.upsert(await this.products.searchDocs({ ids: productIds }));
    } catch (error) {
      this.logger.warn({ err: error, productIds }, 'Could not index products; the next reindex will catch up');
    }
  }

  /**
   * Drops the index and builds it again from Postgres, in batches. Searches use the Postgres
   * fallback while it runs. Used on boot when the index has drifted, and by `npm run search:rebuild`.
   */
  async rebuild(): Promise<number> {
    await this.preparing;
    return this.rebuildIndex();
  }

  private async rebuildIndex(): Promise<number> {
    if (!this.client) return 0;
    if (await this.client.collections(this.collection).exists()) await this.client.collections(this.collection).delete();
    await this.ensureCollection();
    let afterId: string | undefined;
    let total = 0;
    for (;;) {
      const batch = await this.products.searchDocs({ afterId, limit: REINDEX_BATCH });
      if (batch.length === 0) break;
      await this.upsert(batch);
      total += batch.length;
      afterId = batch[batch.length - 1].id;
    }
    return total;
  }

  private search(businessId: string, q: string, status: string | undefined, page: number, perPage: number) {
    const filters = [`businessId:=\`${businessId}\``, ...(status ? [`status:=\`${status}\``] : [])];
    return this.client!.collections<ProductSearchDoc>(this.collection)
      .documents()
      .search({
        q,
        query_by: 'name,sku',
        filter_by: filters.join(' && '),
        prefix: true,
        infix: 'off,always', // "0042" finds PRD-0042
        num_typos: '2,0', // typos forgiven in names, never in SKUs
        sort_by: '_text_match:desc,name:asc',
        include_fields: 'id',
        page,
        per_page: Math.min(perPage, PAGE),
      });
  }

  private async prepare(): Promise<void> {
    try {
      const indexed = await this.ensureCollection();
      const stored = await this.products.countAll();
      if (indexed !== stored) {
        const count = await this.rebuildIndex();
        this.logger.log(`Reindexed ${count} products (index had ${indexed}, database has ${stored})`);
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'Product search index not ready; searches use Postgres until it is');
    }
  }

  /** Creates the collection if missing; returns how many documents it holds. */
  private async ensureCollection(): Promise<number> {
    const client = this.client!;
    if (await client.collections(this.collection).exists()) {
      return (await client.collections(this.collection).retrieve()).num_documents;
    }
    const schema: CollectionCreateSchema = {
      name: this.collection,
      fields: [
        { name: 'businessId', type: 'string', facet: false },
        { name: 'name', type: 'string', sort: true },
        { name: 'sku', type: 'string', infix: true },
        { name: 'status', type: 'string' },
      ],
    };
    await client.collections().create(schema);
    return 0;
  }

  private async upsert(docs: ProductSearchDoc[]): Promise<void> {
    if (docs.length === 0) return;
    const results = await this.client!.collections<ProductSearchDoc>(this.collection).documents().import(docs, { action: 'upsert' });
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) throw new Error(`Typesense rejected ${failed.length} of ${docs.length} documents: ${failed[0].error}`);
  }
}
