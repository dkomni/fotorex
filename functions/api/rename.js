// POST /api/rename
// Headers: X-Upload-Password
// Body: { from: "<current album name>", to: "<new album name>" }
//
// R2 has no native rename/move, so this copies every object from
// original/<from>/ and thumb/<from>/ to original/<to>/ and thumb/<to>/
// (preserving content type), then deletes the old objects only after every
// copy has succeeded.
//
// Response: 200 { from, to, moved }

import { requirePassword, jsonResponse } from '../_shared/auth.js';
import { sanitizeAlbumName } from '../_shared/sanitize.js';

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

  const from = sanitizeAlbumName(body?.from || '');
  const to = sanitizeAlbumName(body?.to || '');
  if (!from || !to) {
    return jsonResponse({ error: 'from and to album names are required' }, 400);
  }
  if (from === to) {
    return jsonResponse({ error: 'Το νέο όνομα είναι ίδιο με το τρέχον.' }, 400);
  }

  // Refuse to silently merge into an existing album.
  const collision = await bucket.list({ prefix: `original/${to}/`, limit: 1 });
  if (collision.objects.length > 0) {
    return jsonResponse({ error: 'Υπάρχει ήδη συλλογή με αυτό το όνομα.' }, 409);
  }

  let moved = 0;
  for (const kind of ['original', 'thumb']) {
    const fromPrefix = `${kind}/${from}/`;
    const toPrefix = `${kind}/${to}/`;
    let cursor;
    do {
      const result = await bucket.list({ prefix: fromPrefix, cursor, limit: 1000 });
      for (const obj of result.objects) {
        const rest = obj.key.slice(fromPrefix.length);
        if (!rest) continue;
        const source = await bucket.get(obj.key);
        if (!source) continue;
        await bucket.put(`${toPrefix}${rest}`, source.body, {
          httpMetadata: source.httpMetadata,
          customMetadata: source.customMetadata,
        });
        moved += 1;
      }
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
  }

  if (moved === 0) {
    return jsonResponse({ error: 'Η συλλογή δεν βρέθηκε.' }, 404);
  }

  // Only delete the old keys after every object has been copied successfully.
  for (const kind of ['original', 'thumb']) {
    const prefix = `${kind}/${from}/`;
    const toDelete = [];
    let cursor;
    do {
      const result = await bucket.list({ prefix, cursor, limit: 1000 });
      for (const obj of result.objects) toDelete.push(obj.key);
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
    for (let i = 0; i < toDelete.length; i += 1000) {
      await bucket.delete(toDelete.slice(i, i + 1000));
    }
  }

  return jsonResponse({ from, to, moved });
}