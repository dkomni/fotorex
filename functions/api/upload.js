// POST /api/upload?album=NAME&filename=FILE&kind=original|thumb
// Body: raw file bytes; Content-Type header = file's MIME type.
// Headers: X-Upload-Password
//
// Use this for files up to ~95 MB. Files above that limit must use
// /api/upload-url (presigned PUT to R2 directly).

import { requirePassword, jsonResponse } from '../_shared/auth.js';

const MAX_VIA_FUNCTION = 95 * 1024 * 1024;
const ALLOWED_PREFIXES = ['image/', 'video/'];

export async function onRequestPost({ request, env }) {
  const authFail = await requirePassword(request, env);
  if (authFail) return authFail;

  const url = new URL(request.url);
  const album = sanitizeSegment(url.searchParams.get('album') || '');
  const filename = sanitizeFilename(url.searchParams.get('filename') || '');
  const kind = url.searchParams.get('kind') === 'thumb' ? 'thumb' : 'original';
  if (!album || !filename) {
    return jsonResponse({ error: 'album and filename query params required' }, 400);
  }

  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  if (!ALLOWED_PREFIXES.some((p) => contentType.startsWith(p))) {
    return jsonResponse({ error: 'Only image/* and video/* allowed' }, 400);
  }

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (!contentLength) {
    return jsonResponse({ error: 'Content-Length required' }, 411);
  }
  if (contentLength > MAX_VIA_FUNCTION) {
    return jsonResponse(
      { error: `File too large for direct upload (>${MAX_VIA_FUNCTION} bytes). Use /api/upload-url.` },
      413
    );
  }

  const bucket = env.MEDIA_BUCKET;
  if (!bucket) return jsonResponse({ error: 'MEDIA_BUCKET binding missing' }, 500);

  const key = `${kind}/${album}/${filename}`;
  await bucket.put(key, request.body, {
    httpMetadata: { contentType },
  });

  return jsonResponse({ key });
}

function sanitizeSegment(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
}

function sanitizeFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 200);
}
