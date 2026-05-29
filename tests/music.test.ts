import { describe, it, expect } from 'vitest';
import {
  formatDuration,
  coerceVolume,
  parseSeek,
  voiceError,
  nextLoopMode,
  loopLabel,
  queueLines,
  buildControlRow,
  buildNowPlaying,
  requesterMention,
  type TrackLike,
} from '../src/bot/music/player';

const track = (title: string, duration = 200_000, isStream = false): TrackLike => ({
  info: { title, author: 'Artist', duration, uri: `https://yt/${title}`, artworkUrl: null, isStream },
});

describe('formatDuration', () => {
  it('formats minutes:seconds', () => expect(formatDuration(200_000)).toBe('3:20'));
  it('formats hours:minutes:seconds', () => expect(formatDuration(3_725_000)).toBe('1:02:05'));
  it('marks live streams', () => expect(formatDuration(0, true)).toBe('🔴 مباشر'));
  it('handles zero/invalid', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
  });
});

describe('coerceVolume', () => {
  it('clamps into 0..150 and rounds', () => {
    expect(coerceVolume(200)).toBe(150);
    expect(coerceVolume(-5)).toBe(0);
    expect(coerceVolume(73.6)).toBe(74);
  });
  it('rejects non-numbers', () => expect(coerceVolume('loud')).toBeNull());
});

describe('parseSeek', () => {
  it('parses plain seconds', () => expect(parseSeek('90')).toBe(90_000));
  it('parses mm:ss', () => expect(parseSeek('1:30')).toBe(90_000));
  it('parses h:mm:ss', () => expect(parseSeek('1:00:00')).toBe(3_600_000));
  it('parses 1m30s', () => expect(parseSeek('1m30s')).toBe(90_000));
  it('rejects garbage', () => {
    expect(parseSeek('soon')).toBeNull();
    expect(parseSeek('')).toBeNull();
  });
});

describe('voiceError', () => {
  it('requires the member to be in a voice channel', () => expect(voiceError(null, null)).toMatch(/روم صوتي/));
  it('requires the same channel as the bot', () => expect(voiceError('a', 'b')).toMatch(/نفس الروم/));
  it('allows same channel', () => expect(voiceError('a', 'a')).toBeNull());
  it('allows when the bot is not connected yet', () => expect(voiceError('a', null)).toBeNull());
});

describe('loop mode', () => {
  it('cycles off → track → queue → off', () => {
    expect(nextLoopMode('off')).toBe('track');
    expect(nextLoopMode('track')).toBe('queue');
    expect(nextLoopMode('queue')).toBe('off');
  });
  it('labels modes in Arabic', () => {
    expect(loopLabel('off')).toBe('إيقاف');
    expect(loopLabel('queue')).toBe('القائمة');
  });
});

describe('queueLines', () => {
  const tracks = Array.from({ length: 23 }, (_, i) => track(`t${i + 1}`));
  it('paginates 10 per page and reports total pages', () => {
    const { lines, totalPages, page } = queueLines(tracks, 0);
    expect(lines).toHaveLength(10);
    expect(totalPages).toBe(3);
    expect(page).toBe(0);
    expect(lines[0]).toContain('**1.**');
  });
  it('clamps an out-of-range page to the last page', () => {
    const { page, lines } = queueLines(tracks, 99);
    expect(page).toBe(2);
    expect(lines).toHaveLength(3);
  });
});

describe('buildControlRow', () => {
  it('carries the mu: control custom ids', () => {
    const json = JSON.stringify(buildControlRow(false));
    for (const id of ['mu:toggle', 'mu:skip', 'mu:stop', 'mu:loop', 'mu:shuffle']) expect(json).toContain(id);
  });
  it('reflects the paused state in the toggle label', () => {
    expect(JSON.stringify(buildControlRow(true))).toContain('تشغيل');
    expect(JSON.stringify(buildControlRow(false))).toContain('إيقاف');
  });
});

describe('requesterMention / buildNowPlaying', () => {
  it('mentions the requester when present', () => {
    expect(requesterMention({ requester: { id: '42' } })).toBe('<@42>');
    expect(requesterMention({})).toBe('غير معروف');
  });
  it('builds an embed with the title, link, and control row', () => {
    const payload = buildNowPlaying(track('My Song'), { volume: 80, repeatMode: 'off', paused: false });
    const json = JSON.stringify(payload);
    expect(json).toContain('My Song');
    expect(json).toContain('https://yt/My Song');
    expect(json).toContain('mu:skip');
    expect(json).toContain('80%');
  });
});
