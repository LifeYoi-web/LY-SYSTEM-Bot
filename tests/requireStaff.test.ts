import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireStaff } from '../src/api/middleware/requireStaff';

function appWithSession(user: any) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).session = user ? { user } : {};
    next();
  });
  app.get('/protected', requireStaff(), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireStaff', () => {
  it('401s without an authorized session', async () => {
    await request(appWithSession(null)).get('/protected').expect(401);
  });
  it('passes through for an authorized user', async () => {
    await request(appWithSession({ authorized: true })).get('/protected').expect(200, { ok: true });
  });
});
