import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../../config';

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** Business logos on disk under STORAGE_DIR/logos, named by business id (never by anything the user sent). */
@Injectable()
export class LogoStore {
  private path(businessId: string): string {
    return join(config().storageDir, 'logos', `${businessId}.webp`);
  }

  /** Written to a temporary file first, then renamed, so a reader never sees half a file. */
  async save(businessId: string, webp: Buffer): Promise<void> {
    const path = this.path(businessId);
    await mkdir(join(config().storageDir, 'logos'), { recursive: true });
    await writeFile(`${path}.tmp`, webp);
    await rename(`${path}.tmp`, path);
  }

  async read(businessId: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(businessId));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async remove(businessId: string): Promise<void> {
    await rm(this.path(businessId), { force: true });
  }
}
