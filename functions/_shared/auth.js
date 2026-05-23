// Shared password auth for admin-only endpoints.
// Uses a constant-time comparison via SHA-256 to avoid timing attacks.

export async function requirePassword(request, env) {
  const provided = request.headers.get('X-Upload-Password') || '';
  const expected = env.UPLOAD_PASSWORD || '';
  if (!expected) {
    return jsonResponse({ error: 'Server not configured (UPLOAD_PASSWORD missing)' }, 500);
  }
  const ok = await constantTimeEqual(provided, expected);
  if (!ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return null;
}

async function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const ha = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(a)));
  const hb = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b)));
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

export function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
