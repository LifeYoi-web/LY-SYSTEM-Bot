import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { parseYouTubeFeed, resolveYouTubeChannelId } from '../src/bot/creator/youtubeFeed';
import { parseTikTokResponse } from '../src/bot/creator/tiktok';
import { selectNewItems, dueFor } from '../src/bot/creator/poll';
import { pingFor, buildAnnouncement, renderTemplate } from '../src/bot/creator/announce';
import type { ContentItem } from '../src/bot/creator/types';

const item = (id: string, t = id): ContentItem => ({ id, title: t, url: `https://x/${id}` });

const YT_FEED = `<?xml version="1.0"?>
<feed>
  <entry>
    <id>yt:video:VID2</id>
    <yt:videoId>VID2</yt:videoId>
    <title>Newer &amp; Better</title>
    <published>2024-02-01T00:00:00+00:00</published>
  </entry>
  <entry>
    <id>yt:video:VID1</id>
    <yt:videoId>VID1</yt:videoId>
    <title>Older</title>
    <published>2024-01-01T00:00:00+00:00</published>
  </entry>
</feed>`;

describe('parseYouTubeFeed', () => {
  it('extracts videos newest-first with decoded titles + derived url/thumbnail', () => {
    const items = parseYouTubeFeed(YT_FEED);
    expect(items.map((i) => i.id)).toEqual(['VID2', 'VID1']);
    expect(items[0].title).toBe('Newer & Better');
    expect(items[0].url).toBe('https://www.youtube.com/watch?v=VID2');
    expect(items[0].thumbnail).toContain('VID2');
  });
  it('returns [] for an empty/garbage feed', () => {
    expect(parseYouTubeFeed('<feed></feed>')).toEqual([]);
  });
});

describe('resolveYouTubeChannelId', () => {
  it('passes through a bare UC id without any network call', async () => {
    const id = 'UCabcdefghijklmnopqrstuv';
    expect(await resolveYouTubeChannelId(id, () => { throw new Error('no network'); })).toBe(id);
  });
  it('extracts the id from a /channel/ URL offline', async () => {
    const out = await resolveYouTubeChannelId('https://youtube.com/channel/UCabcdefghijklmnopqrstuv/videos', () => {
      throw new Error('no network');
    });
    expect(out).toBe('UCabcdefghijklmnopqrstuv');
  });
  it('scrapes the channel id from a handle page', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '...{"channelId":"UCzyxwvutsrqponmlkjihgfe"}...',
    });
    const out = await resolveYouTubeChannelId('@someone', fakeFetch as never);
    expect(out).toBe('UCzyxwvutsrqponmlkjihgfe');
    expect(fakeFetch).toHaveBeenCalled();
  });
  it('returns null when the page cannot be fetched', async () => {
    const out = await resolveYouTubeChannelId('@nope', (async () => ({ ok: false, text: async () => '' })) as never);
    expect(out).toBeNull();
  });
});

describe('selectNewItems', () => {
  it('baselines on first run (lastId null) and announces nothing', () => {
    const r = selectNewItems([item('b'), item('a')], null);
    expect(r.toAnnounce).toEqual([]);
    expect(r.newLastId).toBe('b');
  });
  it('announces items newer than lastId, oldest-first', () => {
    const r = selectNewItems([item('c'), item('b'), item('a')], 'a');
    expect(r.toAnnounce.map((i) => i.id)).toEqual(['b', 'c']);
    expect(r.newLastId).toBe('c');
  });
  it('announces nothing when lastId is already the newest', () => {
    const r = selectNewItems([item('c'), item('b'), item('a')], 'c');
    expect(r.toAnnounce).toEqual([]);
    expect(r.newLastId).toBe('c');
  });
  it('caps to the newest few when lastId is not in the feed (no flood)', () => {
    const r = selectNewItems([item('e'), item('d'), item('c'), item('b'), item('a')], 'zzz', 3);
    expect(r.toAnnounce.map((i) => i.id)).toEqual(['c', 'd', 'e']);
    expect(r.newLastId).toBe('e');
  });
});

describe('dueFor', () => {
  const now = new Date('2024-01-01T00:10:00Z');
  it('is due when never polled', () => {
    expect(dueFor(null, now, 300_000)).toBe(true);
  });
  it('is due once the interval has elapsed', () => {
    expect(dueFor(new Date('2024-01-01T00:04:00Z'), now, 300_000)).toBe(true);
  });
  it('is not due before the interval', () => {
    expect(dueFor(new Date('2024-01-01T00:08:00Z'), now, 300_000)).toBe(false);
  });
});

describe('parseTikTokResponse', () => {
  it('reads the tiktok-scraper7 shape, newest-first, with a derived url', () => {
    const json = {
      data: {
        videos: [
          { video_id: '111', title: 'first', cover: 'http://c/1.jpg', create_time: 1700000000 },
          { video_id: '222', title: 'second', cover: 'http://c/2.jpg', create_time: 1700000500 },
        ],
      },
    };
    const items = parseTikTokResponse(json, 'user');
    expect(items.map((i) => i.id)).toEqual(['222', '111']);
    expect(items[0].url).toBe('https://www.tiktok.com/@user/video/222');
    expect(items[1].thumbnail).toBe('http://c/1.jpg');
  });
  it('returns [] when no recognizable array is present', () => {
    expect(parseTikTokResponse({ message: 'error' }, 'user')).toEqual([]);
  });
});

describe('pingFor / renderTemplate / buildAnnouncement', () => {
  it('maps ping modes to content + allowedMentions', () => {
    expect(pingFor({ pingMode: 'everyone' } as never)).toEqual({ content: '@everyone', allowedMentions: { parse: ['everyone'] } });
    expect(pingFor({ pingMode: 'here' } as never).content).toBe('@here');
    expect(pingFor({ pingMode: 'role', pingRoleId: 'r1' } as never)).toEqual({ content: '<@&r1>', allowedMentions: { roles: ['r1'] } });
    expect(pingFor({ pingMode: 'role', pingRoleId: null } as never).content).toBe('');
    expect(pingFor({ pingMode: 'none' } as never).content).toBe('');
  });
  it('substitutes template placeholders', () => {
    expect(renderTemplate('{platform}: {title} {url}', { title: 'T', url: 'U', platform: 'YouTube', creator: 'C' }))
      .toBe('YouTube: T U');
  });
  it('builds an embed + link button + ping for a video', () => {
    const cfg = { pingMode: 'everyone', messageTemplate: null, youtubeChannelId: 'UCx', tiktokUsername: null } as never;
    const payload = buildAnnouncement(cfg, 'youtube', item('VID', 'My Title'));
    expect(payload.content).toBe('@everyone');
    const json = JSON.stringify(payload);
    expect(json).toContain('My Title');
    expect(json).toContain('https://x/VID');
    expect(json).toContain('شاهد الآن');
  });
});

// ---- route ----

vi.mock('../src/db/community', () => ({
  getCreatorAnnounceConfig: vi.fn().mockResolvedValue({
    guildId: 'g1', enabled: false, channelId: null, pingMode: 'everyone', pingRoleId: null,
    messageTemplate: null, youtubeEnabled: false, youtubeChannelId: null, youtubeLastVideoId: null,
    lastPolledYt: null, tiktokEnabled: false, tiktokUsername: null, tiktokLastVideoId: null, lastPolledTt: null,
  }),
  updateCreatorAnnounceConfig: vi.fn().mockImplementation((g: string, d: Record<string, unknown>) => Promise.resolve({ guildId: g, ...d })),
}));

import { createCreatorAnnounceRouter } from '../src/api/routes/creatorannounce';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).tenant = { guildId: 'g1' }; next(); });
  // Channel cache: any id maps to a g1 channel so channelId validation passes.
  const fakeClient = { channels: { cache: { get: () => ({ guildId: 'g1' }) } } };
  a.use('/api/creatorannounce', createCreatorAnnounceRouter({ client: fakeClient as never, prisma: {} as never, config: { guildId: 'g1' } }));
  return a;
}

describe('creatorannounce route', () => {
  it('GET / returns the config payload', async () => {
    const res = await request(app()).get('/api/creatorannounce').expect(200);
    expect(res.body.config).toMatchObject({ guildId: 'g1', enabled: false, pingMode: 'everyone' });
  });
  it('PUT /config 400s on an invalid pingMode', async () => {
    await request(app()).put('/api/creatorannounce/config').send({ pingMode: 'shout' }).expect(400);
  });
  it('PUT /config 400s on a too-long messageTemplate', async () => {
    await request(app()).put('/api/creatorannounce/config').send({ messageTemplate: 'x'.repeat(301) }).expect(400);
  });
  it('PUT /config stores a bare UC channel id and sanitizes the tiktok username', async () => {
    const res = await request(app())
      .put('/api/creatorannounce/config')
      .send({ enabled: true, channelId: 'c1', youtubeEnabled: true, youtubeChannelId: 'UCabcdefghijklmnopqrstuv', tiktokUsername: '@Cool.User!!' })
      .expect(200);
    expect(res.body).toMatchObject({
      enabled: true, channelId: 'c1', youtubeChannelId: 'UCabcdefghijklmnopqrstuv', tiktokUsername: 'Cool.User',
    });
  });
});
