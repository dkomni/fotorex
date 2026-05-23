// AWS SigV4 presigned PUT URL generator for Cloudflare R2's S3-compatible API.
// Implemented with Web Crypto so it runs inside Pages Functions with no deps.
//
// R2 S3 endpoint: https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>
//
// Signed headers: host, content-type. The browser MUST send the same
// Content-Type when uploading or R2 will reject the signature.

const encoder = new TextEncoder();

export async function presignR2PutUrl({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
  contentType,
  expiresIn = 600,
}) {
  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;
  // Path: do not encode "/" between path segments, but encode each segment.
  const encodedKey = key.split('/').map((s) => uriEncode(s, false)).join('/');
  const path = `/${bucket}/${encodedKey}`;

  const now = new Date();
  const iso = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const date = iso.slice(0, 8);
  const credentialScope = `${date}/${region}/${service}/aws4_request`;

  // Canonical query string (must be sorted, RFC 3986 encoded).
  const queryParams = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', iso],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'content-type;host'],
  ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQs = queryParams
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join('&');

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n`;
  const signedHeaders = 'content-type;host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    path,
    canonicalQs,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    iso,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = await hmac(encoder.encode('AWS4' + secretAccessKey), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = toHex(await hmac(kSigning, stringToSign));

  return `https://${host}${path}?${canonicalQs}&X-Amz-Signature=${signature}`;
}

function uriEncode(str, encodeSlash = true) {
  let out = encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
  if (!encodeSlash) out = out.replace(/%2F/g, '/');
  return out;
}

async function sha256Hex(data) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    typeof data === 'string' ? encoder.encode(data) : data
  );
  return toHex(new Uint8Array(buf));
}

async function hmac(key, data) {
  const keyBuf = key instanceof Uint8Array ? key : encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    typeof data === 'string' ? encoder.encode(data) : data
  );
  return new Uint8Array(sig);
}

function toHex(buf) {
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}
