import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { buildDateSeries, lastNDates, utcDateKey, clamp } from '../src/shared/analytics';
import { createAnalyticsRouter } from '../src/api/routes/analytics';

describe('analytics helpers', () => {
  it('lastNDates returns n consecutive UTC days, oldest first', () => {
    const today = new Date('2026-05-24T12:00:00Z');
    const days = lastNDates(3, today);
    expect(days).toEqual(['2026-05-22', '2026-05-23', '2026-05-24']);
  });

  it('buildDateSeries fills gaps with zeros and keeps known rows', () => {
    const today = new Date('2026-05-24T00:00:00Z');
    const series = buildDateSeries([{ date: '2026-05-24', messages: 9, joins: 2 }], 2, today);
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ date: '2026-05-23', messages: 0, joins: 0 });
    expect(series[1]).toMatchObject({ date: '2026-05-24', messages: 9, joins: 2, leaves: 0 });
  });

  it('clamp bounds values and handles NaN', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(99, 1, 10)).toBe(10);
    expect(clamp(NaN, 7, 90)).toBe(7);
  });
});

describe('analytics route', () => {
  function deps() {
    const today = utcDateKey(new Date());
    return {
      config: { guildId: 'g1' },
      prisma: {
        dailyStat: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { date: today, messages: 5, joins: 2, leaves: 1, modActions: 0, memberCount: 50 },
            ]),
        },
        moderationCase: {
          groupBy: vi
            .fn()
            .mockResolvedValueOnce([{ type: 'ban', _count: { type: 2 } }])
            .mockResolvedValueOnce([{ moderatorId: 'm1', _count: { moderatorId: 5 } }]),
        },
      },
    } as any;
  }

  it('returns a dense series, totals, distribution and top moderators', async () => {
    const app = express();
    app.use('/api/analytics', createAnalyticsRouter(deps()));
    const res = await request(app).get('/api/analytics').expect(200);
    expect(res.body.days).toBe(14);
    expect(res.body.series).toHaveLength(14);
    expect(res.body.totals.messages).toBe(5);
    expect(res.body.caseDistribution).toEqual([{ type: 'ban', count: 2 }]);
    expect(res.body.topModerators).toEqual([{ moderatorId: 'm1', count: 5 }]);
  });
});
