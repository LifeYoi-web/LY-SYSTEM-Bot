import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../src/api/middleware/rateLimit';

function app() {
  const a = express();
  a.use(rateLimit({ windowMs: 60_000, max: 2, key: () => 'fixed' }));
  a.get('/x', (_req, res) => res.json({ ok: true }));
  return a;
}

describe('rateLimit middleware', () => {
  it('allows up to max requests then 429s, exposing rate-limit headers', async () => {
    const a = app();
    const r1 = await request(a).get('/x').expect(200);
    expect(r1.headers['x-ratelimit-remaining']).toBe('1');
    await request(a).get('/x').expect(200);
    const r3 = await request(a).get('/x').expect(429);
    expect(r3.body.error).toMatch(/too many/i);
    expect(r3.headers['retry-after']).toBeDefined();
  });
});
