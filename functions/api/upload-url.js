// POST /api/upload-url
// Body: { album, filename, contentType, kind: "original" | "thumb" }
// Headers: X-Upload-Password
//
// Returns a short-lived presigned S3 PUT URL the browser uses to upload
// directly to R2, bypassing the Pages Functions request-body limit.
// The browser MUST set Content-Type to exactly the value returned here.

import { requirePassword, jsonResponse } from '../_shared/auth.js';
import { presignR2PutUrl } from '../_shared/r2-presign.js';

const BUCKET_NAME = 'fotorex-media';
const EXPIRES_SECONDS = 600;

export async function onRequestPost({ request, env }) {
  const authFail = await requirePassword(request, env);
  if (authFail) return authFail;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { album, filename, contentType, kind } = body || {};
  if (!album || !filename || !contentType) {
    return jsonResponse({ error: 'album, filename and contentType are required' }, 400);
  }
  if (!/^(image|video)\//.test(contentType)) {
    return jsonResponse({ error: 'Only image/* and video/* allowed' }, 400);
  }

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    return jsonResponse(
      { error: 'Presigned uploads not configured (missing R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)' },
      501
    );
  }

  const safeAlbum = sanitizeSegment(album);
  const safeFile = sanitizeFilename(filename);
  const safeKind = kind === 'thumb' ? 'thumb' : 'original';
  if (!safeAlbum || !safeFile) {
    return jsonResponse({ error: 'invalid album or filename' }, 400);
  }
  const key = `${safeKind}/${safeAlbum}/${safeFile}`;

  const url = await presignR2PutUrl({
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: BUCKET_NAME,
    key,
    contentType,
    expiresIn: EXPIRES_SECONDS,
  });

  return jsonResponse({ url, key, contentType, expiresIn: EXPIRES_SECONDS });
}

function sanitizeSegment(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
}
function sanitizeFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 200);
}
