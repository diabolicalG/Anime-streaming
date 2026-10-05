import express from 'express';
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import router from './route';
import { encodeToken, isRefAllowed } from './proxy';

function request(server: http.Server, path: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server is not listening');
  }

  return new Promise((resolve, reject) => {
    const req = http.get(
      { hostname: '127.0.0.1', port: address.port, path },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
  });
}

describe('stream proxy chain', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('accepts every supported referrer host', () => {
    expect(isRefAllowed('https://krussdomi.com/')).toBe(true);
    expect(isRefAllowed('https://playeng.animeapps.top/')).toBe(true);
    expect(isRefAllowed('https://evil.example/')).toBe(false);
  });

  it('proxies master manifest, variant manifest, and segment as one chain', async () => {
    const upstreams = new Map<string, { body: string | Buffer; contentType: string }>([
      [
        'https://playeng.animeapps.top/master.m3u8',
        {
          body: '#EXTM3U\\n#EXT-X-STREAM-INF:BANDWIDTH=800000\\nvariant.m3u8\\n',
          contentType: 'application/vnd.apple.mpegurl',
        },
      ],
      [
        'https://playeng.animeapps.top/variant.m3u8',
        {
          body: '#EXTM3U\\n#EXTINF:4,\\nsegment.ts\\n',
          contentType: 'application/vnd.apple.mpegurl',
        },
      ],
      [
        'https://playeng.animeapps.top/segment.ts',
        {
          body: Buffer.from('segment-bytes'),
          contentType: 'video/mp2t',
        },
      ],
    ]);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const upstream = upstreams.get(url);
      if (!upstream) {
        return new Response('not found', { status: 404 });
      }

      expect(new Headers(init?.headers).get('Referer')).toBe('https://playeng.animeapps.top/');
      expect(new Headers(init?.headers).get('Origin')).toBe('https://playeng.animeapps.top');

      return new Response(upstream.body, {
        status: 200,
        headers: { 'content-type': upstream.contentType },
      });
    });

    const app = express();
    app.use('/api/stream', router);
    server = app.listen(0);

    const ref = encodeToken('https://playeng.animeapps.top/');
    const master = encodeToken('https://playeng.animeapps.top/master.m3u8');

    const masterRes = await request(
      server,
      `/api/stream?src=${master}&ref=${ref}`,
    );
    expect(masterRes.status).toBe(200);
    expect(masterRes.headers['content-type']).toMatch(/application\\/vnd.apple.mpegurl/);

    const masterText = masterRes.body.toString('utf8');
    expect(masterText).toContain('/api/stream?src=');

    const variantUrl = new URL(
      masterText.split('\\n').find((line) => line.includes('/api/stream?src='))!,
      'http://127.0.0.1',
    );

    const variantRes = await request(server, variantUrl.pathname + variantUrl.search);
    expect(variantRes.status).toBe(200);
    expect(variantRes.headers['content-type']).toMatch(/application\\/vnd.apple.mpegurl/);

    const variantText = variantRes.body.toString('utf8');
    const segmentUrl = new URL(
      variantText.split('\\n').find((line) => line.includes('/api/stream?src='))!,
      'http://127.0.0.1',
    );

    const segmentRes = await request(server, segmentUrl.pathname + segmentUrl.search);
    expect(segmentRes.status).toBe(200);
    expect(segmentRes.headers['content-type']).toMatch(/video\\/mp2t/);
    expect(segmentRes.body.toString('utf8')).toBe('segment-bytes');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
