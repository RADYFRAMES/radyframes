import 'server-only';
import { createHash } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';

export const MAX_THUMBNAIL_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_THUMBNAIL_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 8192;
const MIN_SHORT_DIMENSION = 180;
const MIN_LONG_DIMENSION = 320;

export type SupportedThumbnailMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ThumbnailValidationCode =
  | 'empty'
  | 'too_large'
  | 'unsupported_type'
  | 'mime_mismatch'
  | 'extension_mismatch'
  | 'invalid_image'
  | 'invalid_dimensions'
  | 'optimized_too_large';

export class ThumbnailValidationError extends Error {
  constructor(readonly code: ThumbnailValidationCode) {
    super(code);
    this.name = 'ThumbnailValidationError';
  }
}

export function detectThumbnailMime(bytes: Buffer): SupportedThumbnailMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (
    bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export async function optimizeThumbnail(bytes: Buffer, declaredMime: string, fileName?: string) {
  if (!bytes.length) throw new ThumbnailValidationError('empty');
  if (bytes.length > MAX_THUMBNAIL_UPLOAD_BYTES) throw new ThumbnailValidationError('too_large');

  const detectedMime = detectThumbnailMime(bytes);
  if (!detectedMime) throw new ThumbnailValidationError('unsupported_type');
  if (declaredMime && declaredMime !== detectedMime) throw new ThumbnailValidationError('mime_mismatch');
  if (fileName) {
    const fileNameOnly = fileName.split(/[\\/]/).pop() ?? '';
    const extensionIndex = fileNameOnly.lastIndexOf('.');
    const extension = extensionIndex > 0 ? fileNameOnly.slice(extensionIndex + 1).toLowerCase() : '';
    const allowedExtensions: Record<SupportedThumbnailMime, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
    };
    if (!extension || !allowedExtensions[detectedMime].includes(extension)) {
      throw new ThumbnailValidationError('extension_mismatch');
    }
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new ThumbnailValidationError('invalid_image');
  }

  const { width, height, pages } = metadata;
  if (
    metadata.format !== detectedMime.slice('image/'.length)
    || !width
    || !height
    || width > MAX_IMAGE_DIMENSION
    || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_IMAGE_PIXELS
    || Math.min(width, height) < MIN_SHORT_DIMENSION
    || Math.max(width, height) < MIN_LONG_DIMENSION
    || (pages !== undefined && pages > 1)
  ) {
    throw new ThumbnailValidationError('invalid_dimensions');
  }

  let optimized: Buffer;
  try {
    optimized = await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch {
    throw new ThumbnailValidationError('invalid_image');
  }
  if (optimized.length > MAX_THUMBNAIL_OUTPUT_BYTES) {
    throw new ThumbnailValidationError('optimized_too_large');
  }

  return {
    bytes: optimized,
    width,
    height,
    contentHash: createHash('sha256').update(optimized).digest('hex'),
  };
}
