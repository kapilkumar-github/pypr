import { RESUME_PHOTO_ACCEPT, RESUME_PHOTO_MAX_BYTES } from '@pypr/validation';
import { apiDownload } from './api';

/** For the file picker. The API still checks the bytes; this only gives quick feedback. */
export const PHOTO_ACCEPT = RESUME_PHOTO_ACCEPT.join(',');

/** A message when the chosen file can't be a photo upload, else null. */
export function checkPhotoFile(file: { type: string; size: number }): string | null {
  if (!(RESUME_PHOTO_ACCEPT as readonly string[]).includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP image.';
  }
  if (file.size > RESUME_PHOTO_MAX_BYTES) return 'The image is larger than 5 MB.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/**
 * The preview and the PDF only show inline images (no network), so the photo travels as a
 * data: URI.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the image.'));
    };
    reader.onerror = () => {
      reject(new Error('Could not read the image.'));
    };
    reader.readAsDataURL(blob);
  });
}

/** The resume's stored photo as a data: URI. */
export async function fetchResumePhoto(resumeId: string): Promise<string> {
  const { blob } = await apiDownload(`/api/resumes/${resumeId}/photo`);
  return blobToDataUrl(blob);
}
