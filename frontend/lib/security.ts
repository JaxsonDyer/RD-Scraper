export function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return '/';
  return value;
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  // Next's Node server may use localhost internally. Compare the browser's
  // origin to the actual Host header, including its port, instead.
  const host = request.headers.get('host') ?? url.host;
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const protocol = forwardedProtocol === 'https' ? 'https:' : forwardedProtocol === 'http' ? 'http:' : url.protocol;
  return new URL(`${protocol}//${host}`).origin;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return origin === requestOrigin(request); } catch { return false; }
}
