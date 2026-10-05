import express from 'express';
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const historyStore: Array<Record<string, unknown>> = [];

vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'USER', type: 'access' };
    next();
  },
}));

vi.mock('../config/prisma', () => ({
  prisma: {
    watchHistory: {
      findFirst: vi.fn(async (args: any) =>
        historyStore.find((item) =>
          item.userId === args.where.userId &&
          item.animeId === args.where.animeId &&
          item.episodeNumber === args.where.episodeNumber,
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const item = {
          id: `history-${historyStore.length + 1}`,
          ...data,
          watchedAt: new Date(),
          updatedAt: new Date(),
        };
        historyStore.push(item);
        return item;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const item = historyStore.find((entry) => entry.id === where.id)!;
        Object.assign(item, data, { updatedAt: new Date() });
        return item;
      }),
      findMany: vi.fn(async () => historyStore),
    },
  },
}));

import router from './user';

function request(server: http.Server, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server not listening');
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method,
      headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : undefined,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('watch history API', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    historyStore.length = 0;
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it('creates, updates, and reads episode history', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/user', router);
    server = app.listen(0);

    const first = await request(server, 'POST', '/api/user/history', {
      animeId: 123,
      episode: 4,
      position: 91.8,
      completed: false,
    });
    expect(first.status).toBe(200);
    expect(first.json.data.position).toBe(91);

    const second = await request(server, 'POST', '/api/user/history', {
      animeId: 123,
      episode: 4,
      position: 600,
      completed: true,
    });
    expect(second.status).toBe(200);
    expect(second.json.data.position).toBe(600);
    expect(second.json.data.completed).toBe(true);

    const list = await request(server, 'GET', '/api/user/history?animeId=123&episode=4');
    expect(list.status).toBe(200);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0].completed).toBe(true);
  });
});
