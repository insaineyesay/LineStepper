import { apiRequest } from './api-request';
import { db } from './backend';
import { fail, ok, type DataResult } from './result';

/**
 * Event flyers and profile photos. The API picks where each file goes and
 * hands out one-time upload links; we upload the (already shrunk) JPEGs to
 * them, then ask the API to attach them. See apps/api/src/routes/images.ts.
 */

const BUCKET = 'images';

export type ImageTarget = { target: 'event'; eventId: string } | { target: 'profile' };

export interface ImageFiles {
  full: ArrayBuffer;
  /** Event flyers also get a small copy for lists. */
  thumb?: ArrayBuffer;
}

interface UploadLinks {
  imageId: string;
  uploads: { variant: 'full' | 'thumb'; path: string; token: string }[];
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

/** Uploads and attaches an image; returns its public URLs. */
export async function uploadImage(
  to: ImageTarget,
  files: ImageFiles,
): Promise<DataResult<{ url: string; thumbUrl: string | null }>> {
  const links = await apiRequest<UploadLinks>('/images/uploads', { method: 'POST', ...json(to) });
  if (links.error) return links;

  for (const upload of links.data.uploads) {
    const bytes = upload.variant === 'thumb' ? files.thumb : files.full;
    if (!bytes) return fail(null, 'Missing image to upload.');
    const { error } = await db.storage
      .from(BUCKET)
      .uploadToSignedUrl(upload.path, upload.token, bytes, { contentType: 'image/jpeg' });
    if (error) return fail({ message: error.message, code: 'upload_failed' });
  }

  const attached = await apiRequest<{ url: string; thumbUrl: string | null }>('/images/attach', {
    method: 'POST',
    ...json({ ...to, imageId: links.data.imageId }),
  });
  return attached.error ? attached : ok(attached.data);
}

/** Removes an event's flyer or your profile photo. */
export function removeImage(from: ImageTarget): Promise<DataResult<{ removed: true }>> {
  return apiRequest('/images', { method: 'DELETE', ...json(from) });
}
