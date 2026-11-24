import sharp from 'sharp';
import { toLogoWebp } from './logo.image';

const image = (width: number, height: number, format: 'png' | 'jpeg' | 'gif') =>
  sharp({ create: { width, height, channels: 3, background: { r: 80, g: 120, b: 90 } } })
    .toFormat(format)
    .toBuffer();

describe('toLogoWebp', () => {
  it('turns a wide PNG into a WebP at most 256 px on its longer side', async () => {
    const out = await toLogoWebp(await image(1000, 500, 'png'));
    expect(await sharp(out).metadata()).toMatchObject({ format: 'webp', width: 256, height: 128 });
  });

  it('never enlarges a small JPEG', async () => {
    const out = await toLogoWebp(await image(100, 100, 'jpeg'));
    expect(await sharp(out).metadata()).toMatchObject({ format: 'webp', width: 100, height: 100 });
  });

  it('rejects a text file named .png', async () => {
    await expect(toLogoWebp(Buffer.from('hello'))).rejects.toMatchObject({ status: 415, code: 'logo_unsupported' });
  });

  it('rejects an image over the pixel limit', async () => {
    const huge = await image(6000, 6000, 'png'); // a flat colour: a small file, 36 million pixels
    expect(huge.length).toBeLessThan(2 * 1024 * 1024);
    await expect(toLogoWebp(huge)).rejects.toMatchObject({ status: 415, code: 'logo_unsupported' });
  });

  it('rejects a GIF', async () => {
    await expect(toLogoWebp(await image(50, 50, 'gif'))).rejects.toMatchObject({ code: 'logo_unsupported' });
  });
});
