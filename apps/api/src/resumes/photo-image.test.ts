import { HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectImageFormat, processPhoto } from './photo-image.js';

function image(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 40, b: 90, alpha: 0.5 } },
  });
}
const upload = (buffer: Buffer) => ({ size: buffer.length, buffer });

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe('detectImageFormat', () => {
  it('recognises JPEG, PNG and WebP by their bytes', async () => {
    expect(detectImageFormat(await image(10, 10).jpeg().toBuffer())).toBe('jpeg');
    expect(detectImageFormat(await image(10, 10).png().toBuffer())).toBe('png');
    expect(detectImageFormat(await image(10, 10).webp().toBuffer())).toBe('webp');
  });

  it('refuses everything else', async () => {
    expect(detectImageFormat(await image(10, 10).gif().toBuffer())).toBeNull();
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageFormat(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(detectImageFormat(Buffer.alloc(0))).toBeNull();
  });
});

describe('processPhoto', () => {
  it('re-encodes to a JPEG of at most 800 px, keeping the aspect ratio', async () => {
    const photo = await processPhoto(upload(await image(1600, 1000).png().toBuffer()));
    expect(photo).toMatchObject({ contentType: 'image/jpeg', width: 800, height: 500 });
    const meta = await sharp(photo.data).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 800, height: 500 });
  });

  it("doesn't enlarge small photos", async () => {
    const photo = await processPhoto(upload(await image(300, 400).webp().toBuffer()));
    expect(photo).toMatchObject({ width: 300, height: 400 });
  });

  it('turns the photo upright and drops EXIF data', async () => {
    // 200x100 stored sideways (orientation 6 = rotate 90° to display), with GPS-like EXIF.
    const sideways = await image(200, 100)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'secret location' } })
      .toBuffer();
    expect((await sharp(sideways).metadata()).exif).toBeDefined();

    const photo = await processPhoto(upload(sideways));
    expect(photo).toMatchObject({ width: 100, height: 200 });
    const meta = await sharp(photo.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(photo.data.includes('secret location')).toBe(false);
  });

  it('refuses non-images, other formats, broken files and tiny images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"/>');
    const truncated = (await image(400, 400).jpeg().toBuffer()).subarray(0, 200);
    expect(await statusOf(processPhoto(upload(svg)))).toBe(415);
    expect(await statusOf(processPhoto(upload(await image(200, 200).gif().toBuffer())))).toBe(415);
    expect(await statusOf(processPhoto(upload(truncated)))).toBe(415);
    expect(await statusOf(processPhoto(undefined))).toBe(415);
    expect(await statusOf(processPhoto(upload(await image(40, 400).png().toBuffer())))).toBe(422);
  });

  it('refuses files over 5 MB without decoding them', async () => {
    const big = { size: 5 * 1024 * 1024 + 1, buffer: Buffer.alloc(16) };
    expect(await statusOf(processPhoto(big))).toBe(413);
  });
});
