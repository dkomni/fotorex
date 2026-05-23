// POST /api/delete
// Headers: X-Upload-Password
// Body (one of):
//   { keys: ["original/<album>/<file>", ...] }   // delete specific files;
//                                                // the paired thumb/original is auto-removed.
//   { album: "<album>" }                         // delete every object under
//                                                // original/<album>/ and thumb/<album>/
//
// Also used as a cheap auth probe by admin.js: POST { keys: [] } returns 200.

import { requirePassword, jsonResponse } from '../_shared/auth.js';

const KEY_RE = /^(original|thumb)\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

export async function onRequestPost({ request, env }) {
  const authFail = await requirePassword(request, env);
  if (authFail) return authFail;

  const bucket = env.MEDIA_BUCKET;
  if (!bucket) return jsonResponse({ error: 'MEDIA_BUCKET binding missing' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const toDelete = new Set();

  if (typeof body?.album === 'string' && body.album) {
    const safe = body.album.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safe) return jsonResponse({ error: 'invalid album' }, 400);
    for (const prefix of [`original/${safe}/`, `thumb/${safe}/`]) {
      let cursor;
      do {
        const r = await bucket.list({ prefix, cursor, limit: 1000 });
        for (const o of r.objects) toDelete.add(o.key);
        cursor = r.truncated ? r.cursor : undefined;
      } while (cursor);
    }
  }

  if (Array.isArray(body?.keys)) {
    for (const k of body.keys) {
      if (typeof k !== 'string' || !KEY_RE.test(k)) continue;
      toDelete.add(k);
      // Always pair-delete the matching original<->thumb file.
      if (k.startsWith('original/')) {
        const rest = k.slice('original/'.length);
        const base = rest.replace(/\.[^.]+$/, '');
        toDelete.add(`thumb/${base}.jpg`);
      } else if (k.startsWith('thumb/')) {
        const rest = k.slice('thumb/'.length);
        // Original could have any extension; best-effort: list and add matches.
        const base = rest.replace(/\.[^.]+$/, '');
        const [album, name] = base.split('/');
        if (album && name) {
          const matches = await bucket.list({ prefix: `original/${album}/${name}.`, limit: 10 });
          for (const o of matches.objects) toDelete.add(o.key);
        }
      }
    }
  }

  const keys = [...toDelete];
  if (keys.length > 0) {
    for (let i = 0; i < keys.length; i += 1000) {
      await bucket.delete(keys.slice(i, i + 1000));
    }
  }

  return jsonResponse({ deleted: keys.length });
}
