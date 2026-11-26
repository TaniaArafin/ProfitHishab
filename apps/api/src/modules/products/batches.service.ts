import { Injectable } from '@nestjs/common';
import {
  addDays,
  EXPIRY_SOON_DAYS,
  isExpired,
  lineAmount,
  roundQuantity,
  todayIn,
  variantLabel,
  type BatchDto,
  type ClearStockResultDto,
  type ExpirySummaryDto,
  type ReceiveStockInput,
} from '@ph/shared';
import type { AuthContext } from '../../common/auth';
import { ExpensesService } from '../expenses/expenses.service';
import { BatchesRepository, type BatchRow } from './batches.repository';
import { ProductPricesRepository } from './product-prices.repository';
import { ProductError } from './products.errors';
import { productOptions } from './products.presenter';
import { ProductsRepository } from './products.repository';
import { VariantsRepository } from './variants.repository';

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/**
 * Batches and expiry (spec §5.4, owner decision 2), behind `ProductsService`. Variant stock stays the one
 * stock count; batches say which lot it is in. Expired stock can't be sold and is cleared as a loss.
 */
@Injectable()
export class BatchesService {
  constructor(
    private readonly repo: BatchesRepository,
    private readonly products: ProductsRepository,
    private readonly variants: VariantsRepository,
    private readonly prices: ProductPricesRepository,
    private readonly expenses: ExpensesService,
  ) {}

  /**
   * Receive stock into a new batch: adds to the variant's stock. A cost different from the variant's
   * becomes its cost from today (with a price-history row), so stock sold beyond the batches is costed right.
   */
  async receive(auth: AuthContext, productId: string, input: ReceiveStockInput): Promise<BatchDto> {
    const { businessId } = auth;
    const product = await this.products.findRow(businessId, productId);
    if (!product) throw ProductError.notFound();
    if (!product.tracksBatches) throw ProductError.batchesNotTracked(product.name);
    const variants = (await this.variants.forProducts(businessId, [productId])).filter((v) => v.status === 'active');
    const variant = input.variantId ? variants.find((v) => v.id === input.variantId) : variants.length === 1 ? variants[0] : undefined;
    if (input.variantId && !variant) throw ProductError.variantNotFound();
    if (!variant) throw ProductError.variantRequired(product.name, 'variantId');
    const today = todayIn(auth.timezone);

    const id = await this.products.transaction(async (tx) => {
      const batchId = await this.repo.create(
        businessId,
        {
          productId,
          variantId: variant.id,
          batchNo: input.batchNo,
          expiresOn: input.expiresOn,
          quantity: input.quantity,
          unitCost: input.unitCost,
          receivedOn: today,
        },
        tx,
      );
      await this.variants.adjustStock(new Map([[variant.id, input.quantity]]), tx);
      if (input.unitCost !== variant.costPrice) {
        await this.variants.update(variant.id, { costPrice: input.unitCost }, tx);
        const point = { sellingPrice: variant.sellingPrice, costPrice: input.unitCost };
        await this.prices.record(businessId, productId, variant.id, point, today, auth.userId, tx);
      }
      await this.variants.refreshProductSummary([productId], tx);
      return batchId;
    });
    const [row] = await this.repo.forProduct(businessId, productId, [id]);
    return this.toDto(row, productOptions(product), today);
  }

  /** Batches with stock left, earliest expiry first. */
  async list(businessId: string, productId: string, today: string): Promise<BatchDto[]> {
    const product = await this.products.findRow(businessId, productId);
    if (!product) throw ProductError.notFound();
    const options = productOptions(product);
    return (await this.repo.forProduct(businessId, productId)).map((b) => this.toDto(b, options, today));
  }

  /**
   * Clear stock (owner decision 2): zeroes the product's expired batches, takes their quantity off stock,
   * records a write-off per batch and one "Expired stock" expense dated today. The batches are locked, so
   * a second click or tab finds nothing left to clear.
   */
  async clearExpired(auth: AuthContext, productId: string): Promise<ClearStockResultDto> {
    const { businessId } = auth;
    const product = await this.products.findRow(businessId, productId);
    if (!product) throw ProductError.notFound();
    const today = todayIn(auth.timezone);

    return this.products.transaction(async (tx) => {
      const batches = await this.repo.lockExpired(businessId, productId, today, tx);
      if (batches.length === 0) return { quantity: 0, cost: 0 };
      const lines = batches.map((b) => ({ b, cost: lineAmount(b.quantity, b.unitCost) }));
      const quantity = roundQuantity(lines.reduce((s, l) => s + l.b.quantity, 0));
      const cost = lines.reduce((s, l) => s + l.cost, 0);

      const batchNos = batches.map((b) => b.batchNo ?? b.expiresOn).join(', ');
      const expenseId = await this.expenses.recordStockWriteOff(
        businessId,
        { date: today, amount: cost, note: `${product.name}: ${quantity} ${product.unit} expired (${batchNos})`, createdById: auth.userId },
        tx,
      );
      await this.repo.writeOffs(
        businessId,
        lines.map(({ b, cost: lineCost }) => ({
          productId,
          variantId: b.variantId,
          batchId: b.id,
          batchNo: b.batchNo,
          expiresOn: b.expiresOn,
          quantity: b.quantity,
          unitCost: b.unitCost,
          cost: lineCost,
          writtenOffOn: today,
          expenseId,
          createdById: auth.userId,
        })),
        tx,
      );
      await this.repo.adjust(new Map(batches.map((b) => [b.id, -b.quantity])), tx);
      const byVariant = new Map<string, number>();
      for (const b of batches) byVariant.set(b.variantId, (byVariant.get(b.variantId) ?? 0) - b.quantity);
      await this.variants.adjustStock(byVariant, tx);
      await this.variants.refreshProductSummary([productId], tx);
      return { quantity, cost };
    });
  }

  async summary(businessId: string, today: string): Promise<ExpirySummaryDto> {
    const s = await this.repo.summary(businessId, today, addDays(today, EXPIRY_SOON_DAYS));
    return {
      expired: { batches: s.expiredBatches, products: s.expiredProducts, cost: s.expiredCost },
      soon: { batches: s.soonBatches, cost: s.soonCost },
    };
  }

  private toDto(b: BatchRow, options: Array<{ name: string }>, today: string): BatchDto {
    return {
      id: b.id,
      variantId: b.variantId,
      variantLabel: variantLabel(b.optionValues, options),
      batchNo: b.batchNo,
      expiresOn: b.expiresOn,
      receivedOn: b.receivedOn,
      quantity: b.quantity,
      unitCost: b.unitCost,
      expired: isExpired(b.expiresOn, today),
      expiresInDays: daysBetween(today, b.expiresOn),
    };
  }
}
