import { HttpException, HttpStatus } from '@nestjs/common';
import { RESUME_PHOTO_ERROR_CODES, RESUME_PHOTO_MAX_BYTES } from '@pypr/validation';
import sharp from 'sharp';

/** Longest side of a stored photo. Templates show it at about 1 inch, so this is print-sharp. */
export const PHOTO_MAX_SIDE = 800;
/** Smaller images can't look good at print size. */
export const PHOTO_MIN_SIDE = 64;
/** Refuse decompression bombs: no more than 40 megapixels are ever decoded. */
const MAX_INPUT_PIXELS = 40_000_000;

export interface UploadedImage {
  size: number;
  buffer: Buffer;
}

export interface ProcessedPhoto {
  contentType: 'image/jpeg';
  data: Buffer;
  width: number;
  height: number;
}

type InputFormat = 'jpeg' | 'png' | 'webp';

export function photoError(status: HttpStatus, message: string): HttpException {
  return new HttpException(
    { statusCode: status, code: RESUME_PHOTO_ERROR_CODES.unsupportedImage, message },
    status,
  );
}

const unsupported = () =>
  photoError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'Upload a JPEG, PNG or WebP image.');

/**
 * The image type from its first bytes, ignoring the file name and the browser's MIME type.
 * Checked before decoding, so formats we don't accept (SVG, GIF, HEIC…) never reach the decoder.
 */
export function detectImageFormat(buffer: Buffer): InputFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/**
 * Decodes the upload and re-encodes it as a JPEG of at most 800 px: turned upright from its
 * EXIF orientation, transparency on white, and no metadata (EXIF, GPS, ICC comments) kept.
 * Anything that isn't a readable JPEG, PNG or WebP image is refused.
 */
export async function processPhoto(file: UploadedImage | undefined): Promise<ProcessedPhoto> {
  if (!file || file.size === 0) throw unsupported();
  if (file.size > RESUME_PHOTO_MAX_BYTES) {
    throw photoError(HttpStatus.PAYLOAD_TOO_LARGE, 'The image is larger than 5 MB.');
  }
  const format = detectImageFormat(file.buffer);
  if (!format) throw unsupported();

  const input = () =>
    sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', pages: 1 });
  try {
    const meta = await input().metadata();
    if (meta.format !== format) throw unsupported();
    const { data, info } = await input()
      .rotate()
      .resize({
        width: PHOTO_MAX_SIDE,
        height: PHOTO_MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (info.width < PHOTO_MIN_SIDE || info.height < PHOTO_MIN_SIDE) {
      throw photoError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        `The image is too small. Use one at least ${String(PHOTO_MIN_SIDE)} pixels on each side.`,
      );
    }
    return { contentType: 'image/jpeg', data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    // Corrupt, truncated or over the pixel limit. The decoder's message stays out of the reply.
    throw photoError(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      "We couldn't read that image. Upload a JPEG, PNG or WebP image.",
    );
  }
}
