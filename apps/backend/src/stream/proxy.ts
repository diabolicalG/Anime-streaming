import { env } from '../config/env';

export const MANIFEST_TIMEOUT_MS = 10000;
export const SEGMENT_TIMEOUT_MS = 30000;
export const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;
export const MAGIC_PEEK_BYTES = 1024;

const PROXY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MANIFEST_MIME_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
]);

const SEGMENT_MIME_TYPES = new Set([
  'video/mp2t',
  'video/mp4',
  'video/webm',
  'video/x-matroska',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/ogg',
  'application/octet-stream',
]);

export const STREAM_PROXY_BAD_TOKEN = 'STREAM_PROXY_BAD_TOKEN';
export const STREAM_PROXY_TOO_LARGE = 'STREAM_PROXY_TOO_LARGE';
export const STREAM_PROXY_BAD_URL = 'STREAM_PROXY_BAD_URL';
export const STREAM_PROXY_HOST_NOT_ALLOWED = 'STREAM_PROXY_HOST_NOT_ALLOWED';

export class StreamProxyError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'StreamProxyError';
    this.code = code;
  }
}

export function encodeToken(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function decodeToken(token: string): string {
  if (!token) {
    throw new StreamProxyError(STREAM_PROXY_BAD_TOKEN);
  }
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    throw new StreamProxyError(STREAM_PROXY_BAD_TOKEN);
  }
  if (!decoded) {
    throw new StreamProxyError(STREAM_PROXY_BAD_TOKEN);
  }
  if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
    throw new StreamProxyError(STREAM_PROXY_BAD_TOKEN);
  }
  return decoded;
}

function splitHosts(raw: string): string[] {
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

const ALLOWED_MEDIA_HOSTS = splitHosts(env.STREAM_PROXY_ALLOWED_HOSTS);

export function isHostAllowed(host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  return ALLOWED_MEDIA_HOSTS.includes(host.trim().toLowerCase());
}

const ALLOWED_REFERER_HOSTS = ['krussdomi.com'];

export function isRefAllowed(ref: string | undefined): boolean {
  if (!ref) {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(ref);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  return ALLOWED_REFERER_HOSTS.includes(parsed.hostname.toLowerCase());
}

export function combineSignals(
  ...signals: (AbortSignal | undefined)[]
): AbortSignal {
  const provided = signals.filter((s): s is AbortSignal => s !== undefined);
  const controller = new AbortController();

  if (provided.length === 0) {
    return controller.signal;
  }

  const alreadyAborted = provided.find((s) => s.aborted);
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason);
    return controller.signal;
  }

  const handlers: Array<[AbortSignal, () => void]> = [];
  for (const signal of provided) {
    const onAbort = () => {
      controller.abort(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    handlers.push([signal, onAbort]);
  }

  controller.signal.addEventListener(
    'abort',
    () => {
      for (const [signal, onAbort] of handlers) {
        signal.removeEventListener('abort', onAbort);
      }
    },
    { once: true },
  );

  return controller.signal;
}

export async function fetchUpstream(
  url: string,
  referrer: string | undefined,
  init?: { range?: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? SEGMENT_TIMEOUT_MS;
  const signal = combineSignals(init?.signal, AbortSignal.timeout(timeoutMs));

  const headers: Record<string, string> = {
    'User-Agent': PROXY_USER_AGENT,
    Accept: '*/*',
  };
  if (referrer) {
    headers.Referer = referrer;
    try {
      const refUrl = new URL(referrer);
      headers.Origin = `${refUrl.protocol}//${refUrl.host}`;
    } catch {
      // referrer is not a valid absolute URL — skip Origin
    }
  }
  if (init?.range) {
    headers.Range = init.range;
  }

  return globalThis.fetch(url, {
    method: 'GET',
    headers,
    signal,
    redirect: 'manual',
  });
}

export async function peekResponseIsManifest(res: Response): Promise<boolean> {
  if (!res.body) {
    return false;
  }
  const reader = res.clone().body?.getReader();
  if (!reader) {
    return false;
  }
  try {
    const { value } = await reader.read();
    if (!value) {
      return false;
    }
    const head = new TextDecoder().decode(value.subarray(0, MAGIC_PEEK_BYTES));
    return head.startsWith('#EXTM3U');
  } catch {
    return false;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* upstream already closed */
    }
  }
}

export async function classifyResponse(
  res: Response,
): Promise<'manifest' | 'segment'> {
  // Content-Type first. This avoids Response.clone() and its
  // HTTP/2 body-corruption issue for the common case where the
  // CDN returns a proper HLS MIME type.
  const raw = res.headers.get('content-type') || '';
  const normalized = raw.split(';')[0].trim().toLowerCase();

  if (MANIFEST_MIME_TYPES.has(normalized)) {
    return 'manifest';
  }

  if (SEGMENT_MIME_TYPES.has(normalized)) {
    return 'segment';
  }

  // Ambiguous or missing Content-Type. Fall back to body prefix
  // inspection. This path is only reached when the CDN returns a
  // generic type like text/plain or does not set Content-Type.
  if (await peekResponseIsManifest(res)) {
    return 'manifest';
  }

  return 'segment';
}

export async function readManifestText(res: Response): Promise<string> {
  if (!res.body) {
    throw new StreamProxyError(STREAM_PROXY_TOO_LARGE, 'Response body is not readable');
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MANIFEST_MAX_BYTES) {
        throw new StreamProxyError(STREAM_PROXY_TOO_LARGE);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function buildProxyUrl(absoluteUrl: string, referrer: string | undefined): string {
  const ref = referrer ? `&ref=${encodeToken(referrer)}` : '';
  return `/api/stream?src=${encodeToken(absoluteUrl)}${ref}`;
}

function rewriteUri(uri: string, baseUrl: string, referrer: string | undefined): string {
  let resolved: URL;

  try {
    resolved = new URL(uri, baseUrl);
  } catch {
    throw new StreamProxyError(
      STREAM_PROXY_BAD_URL,
      `Invalid URI: ${uri}`,
    );
  }

  if (!isHostAllowed(resolved.hostname)) {
    throw new StreamProxyError(
      STREAM_PROXY_HOST_NOT_ALLOWED,
      `Host not in allowlist: ${resolved.hostname}`,
    );
  }

  return buildProxyUrl(resolved.toString(), referrer);
}

export function rewriteManifest(
  text: string,
  baseUrl: string,
  referrer: string | undefined,
): string {
  const parts = text.split(/(\r\n|\n|\r)/);
  const out: string[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (i % 2 === 1) {
      out.push(part);
      continue;
    }
    if (part.length === 0) {
      out.push(part);
      continue;
    }
    if (part.startsWith('#')) {
      out.push(part.replace(/\bURI="([^"]*)"/g, (_m, uri: string) => {
        const rewritten = rewriteUri(uri, baseUrl, referrer);
        return `URI="${rewritten}"`;
      }));
      continue;
    }
    if (part.trim().length === 0) {
      out.push(part);
      continue;
    }
    out.push(rewriteUri(part, baseUrl, referrer));
  }

  return out.join('');
}
