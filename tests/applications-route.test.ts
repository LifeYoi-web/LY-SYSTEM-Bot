import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

import { createApplicationsRouter } from '../src/api/routes/applications';
import { _resetPlans } from '../src/db/subscriptions';

function appWith(prisma: any) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).tenant = { guildId: 'g1' };
    next();
  });
  a.use('/api/applications', createApplicationsRouter({ client: {} as any, prisma, config: { guildId: 'g1' } } as any));
  return a;
}

beforeEach(() => _resetPlans());

describe('DELETE /forms/:id (tenant safety)', () => {
  it("404s a FOREIGN guild's form id and deletes nothing", async () => {
    const prisma = {
      applicationForm: {
        findUnique: vi.fn().mockResolvedValue({ id: 'f1', guildId: 'g-OTHER' }),
        delete: vi.fn(),
      },
      applicationSubmission: { deleteMany: vi.fn() },
    };
    await request(appWith(prisma)).delete('/api/applications/forms/f1').expect(404);
    expect(prisma.applicationSubmission.deleteMany).not.toHaveBeenCalled();
    expect(prisma.applicationForm.delete).not.toHaveBeenCalled();
  });

  it('deletes an owned form with tenant-scoped submission cleanup', async () => {
    const prisma = {
      applicationForm: {
        findUnique: vi.fn().mockResolvedValue({ id: 'f1', guildId: 'g1' }),
        delete: vi.fn().mockResolvedValue({}),
      },
      applicationSubmission: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    await request(appWith(prisma)).delete('/api/applications/forms/f1').expect(200);
    expect(prisma.applicationSubmission.deleteMany).toHaveBeenCalledWith({
      where: { guildId: 'g1', formId: 'f1' },
    });
    expect(prisma.applicationForm.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });

  it('404s an unknown form id', async () => {
    const prisma = {
      applicationForm: { findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() },
      applicationSubmission: { deleteMany: vi.fn() },
    };
    await request(appWith(prisma)).delete('/api/applications/forms/nope').expect(404);
    expect(prisma.applicationForm.delete).not.toHaveBeenCalled();
  });
});
