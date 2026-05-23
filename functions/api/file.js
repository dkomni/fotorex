// GET /api/file?key=KEY
// Streams an object from R2. Supports HTTP Range requests (required for
// in-browser video scrubbing) and conditional requests (ETag/Last-Modified).
//
// Cache: long-lived + immutable because object keys are timestamp-prefixed
// and therefore stable.

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) return new Response('Missing key', { status: 400 });
  if (!/^(original|thumb)\//.test(key)) {
    return new Response('Forbidden key', { status: 400 });
  }

  const bucket = env.MEDIA_BUCKET;
  if (!bucket) return new Response('Bucket not bound', { status: 500 });

  // Parse Range header (single range only).
  const rangeHeader = request.headers.get('range');
  let range;
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (m) {
      const offset = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : undefined;
      range = end !== undefined
        ? { offset, length: end - offset + 1 }
        : { offset };
    }
  }

  const obj = await bucket.get(key, {
    range,
    onlyIf: request.headers, // honors If-None-Match / If-Modified-Since (returns null when 304)
  });

  // R2 returns null body for conditional misses (304) and for not-found.
  if (!obj) {
    // Distinguish 304 vs 404 with a HEAD-style probe.
    const head = await bucket.head(key);
    if (head) {
      const headers = new Headers();
      head.writeHttpMetadata(headers);
      headers.set('etag', head.httpEtag);
      return new Response(null, { status: 304, headers });
    }
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');

  if (range && obj.range) {
    const total = obj.size;
    const start = obj.range.offset ?? 0;
    const len = obj.range.length ?? (total - start);
    headers.set('Content-Range', `bytes ${start}-${start + len - 1}/${total}`);
    headers.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
}
