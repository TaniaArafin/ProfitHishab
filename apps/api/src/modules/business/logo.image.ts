import sharp from 'sharp';
import { BusinessError } from './business.errors';

/** FR-BIZ-01. `maxInputPixels` stops a small file that decodes to a huge image (a decompression bomb). */
export const LOGO = { maxBytes: 2 * 1024 * 1024, size: 256, maxInputPixels: 25_000_000, formats: ['png', 'jpeg', 'webp'] } as const;

const isAllowed = (format: string | undefined): boolean => (LOGO.formats as readonly string[]).includes(format ?? '');

/**
 * The logo as a WebP at most 256 px on its longer side. The format is read from the file's content,
 * never its name or MIME type; anything else, or anything sharp cannot read, is `logo_unsupported`.
 */
export async function toLogoWebp(input: Buffer): Promise<Buffer> {
  try {
    const image = sharp(input, { limitInputPixels: LOGO.maxInputPixels });
    const { format, width = 0, height = 0 } = await image.metadata();
    if (!isAllowed(format) || width * height > LOGO.maxInputPixels) throw BusinessError.logoUnsupported();
    return await image.rotate().resize(LOGO.size, LOGO.size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw BusinessError.logoUnsupported();
  }
}
