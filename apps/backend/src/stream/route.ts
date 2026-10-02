import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  StreamProxyError,
  STREAM_PROXY_BAD_TOKEN,
  STREAM_PROXY_BAD_URL,
  STREAM_PROXY_HOST_NOT_ALLOWED,
  STREAM_PROXY_TOO_LARGE,
  SEGMENT_TIMEOUT_MS,
  decodeToken,
  isHostAllowed,
  isRefAllowed,
  fetchUpstream,
  classifyResponse,
  readManifestText,
  rewriteManifest,
} from './proxy';
import { Readable } from 'node:stream';

const RANGE_PATTERN = /^bytes=\d*-\d*(,\s*\d*-\d*)*$/;
const MAX_RANGE_LENGTH = 200;

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'cache-control',
];

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

function boundRange(req: Request): string | undefined {
  const raw = typeof req.headers.range === 'string' ? req.headers.range : undefined;
  if (raw === undefined) {
    return undefined;
  }
  if (raw.length > MAX_RANGE_LENGTH) {
    return undefined;
  }
  if (!RANGE_PATTERN.test(raw)) {
    return undefined;
  }
  return raw;
}

const handler = async (req: Request, res: Response): Promise<void> => {
  const controller = new AbortController();

  const onClose = (): void => {
    if (!res.writableFinished) {
      controller.abort();
    }
  };
  res.on('close', onClose);

  try {
    const rawSrc = req.query.src;
    if (typeof rawSrc !== 'string' || rawSrc.length === 0) {
      fail(res, 400, STREAM_PROXY_BAD_TOKEN, 'Missing src parameter');
      return;
    }

    const decodedSrc = decodeToken(rawSrc);

    let parsedSrc: URL;
    try {
      parsedSrc = new URL(decodedSrc);
    } catch {
      throw new StreamProxyError(STREAM_PROXY_BAD_URL, 'Invalid src parameter');
    }
    if (parsedSrc.protocol !== 'http:' && parsedSrc.protocol !== 'https:') {
      throw new StreamProxyError(
        STREAM_PROXY_BAD_URL,
        'src protocol must be http or https',
      );
    }
    if (!isHostAllowed(parsedSrc.hostname)) {
      throw new StreamProxyError(
        STREAM_PROXY_HOST_NOT_ALLOWED,
        `Host not in allowlist: ${parsedSrc.hostname}`,
      );
    }

    let decodedRef: string | undefined;
    const rawRef = req.query.ref;
    if (typeof rawRef === 'string' && rawRef.length > 0) {
      decodedRef = decodeToken(rawRef);
      if (!isRefAllowed(decodedRef)) {
        throw new StreamProxyError(
          STREAM_PROXY_BAD_TOKEN,
          'Referrer host is not allowed',
        );
      }
    } else if (rawRef !== undefined) {
      throw new StreamProxyError(STREAM_PROXY_BAD_TOKEN, 'Invalid ref parameter');
    }

    const upstreamRes = await fetchUpstream(decodedSrc, decodedRef, {
      range: boundRange(req),
      signal: controller.signal,
      timeoutMs: SEGMENT_TIMEOUT_MS,
    });

    if (upstreamRes.status < 200 || upstreamRes.status >= 300) {
      if (upstreamRes.body) {
        try {
          await upstreamRes.body.cancel();
        } catch {
          /* upstream already closed */
        }
      }
      fail(
        res,
        502,
        'STREAM_PROXY_UPSTREAM_ERROR',
        `Upstream returned ${upstreamRes.status}`,
      );
      return;
    }

    const kind = await classifyResponse(upstreamRes);

    if (kind === 'manifest') {
      const text = await readManifestText(upstreamRes);
      const rewritten = rewriteManifest(text, decodedSrc, decodedRef);

      res.off('close', onClose);

      res.status(200);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(rewritten);
      return;
    }

    if (!upstreamRes.body) {
      throw new StreamProxyError(
        'STREAM_PROXY_UPSTREAM_ERROR',
        'Upstream returned an empty body',
      );
    }

    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value !== null) {
        res.setHeader(name, value);
      }
    }

    res.status(upstreamRes.status);
    Readable.fromWeb(
      upstreamRes.body as unknown as import('node:stream/web').ReadableStream,
    ).pipe(res);
    res.on('finish', () => {
      res.off('close', onClose);
    });
  } catch (error) {
    if (res.headersSent || res.writableEnded) {
      return;
    }
    res.off('close', onClose);

    if (error instanceof StreamProxyError) {
      const status =
        error.code === STREAM_PROXY_BAD_TOKEN
          ? 400
          : error.code === STREAM_PROXY_BAD_URL
          ? 400
          : error.code === STREAM_PROXY_HOST_NOT_ALLOWED
          ? 403
          : error.code === STREAM_PROXY_TOO_LARGE
          ? 413
          : 502;
      fail(res, status, error.code, error.message);
      return;
    }

    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      fail(res, 504, 'STREAM_PROXY_TIMEOUT', 'Upstream request timed out');
      return;
    }

    fail(
      res,
      502,
      'STREAM_PROXY_UPSTREAM_ERROR',
      'Failed to proxy upstream stream',
    );
  }
};

const router = Router();
router.get('/', handler);

export default router;
