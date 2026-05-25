import { describe, it, expect, vi } from 'vitest';
import { formatModDm, makeModNotifier } from '../src/bot/moderation/notify';

describe('formatModDm', () => {
  it('names the action, the server, and the reason', () => {
    const msg = formatModDm('warn', 'إزعاج', 'LY سيرفر');
    expect(msg).toContain('تحذير');
    expect(msg).toContain('LY سيرفر');
    expect(msg).toContain('إزعاج');
  });

  it('falls back to a placeholder when no reason is given', () => {
    expect(formatModDm('ban', undefined, 'X')).toContain('غير محدّد');
    expect(formatModDm('ban', '   ', 'X')).toContain('غير محدّد');
  });

  it('uses distinct phrasing per action type', () => {
    const types = ['warn', 'mute', 'kick', 'ban'] as const;
    const msgs = types.map((t) => formatModDm(t, 'r', 'S'));
    expect(new Set(msgs).size).toBe(types.length);
  });
});

describe('makeModNotifier', () => {
  it('DMs the fetched user with the formatted message', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const client = { users: { fetch: vi.fn().mockResolvedValue({ send }) } } as any;
    await makeModNotifier(client, 'My Server')({ userId: 'u1', type: 'warn', reason: 'r' });
    expect(client.users.fetch).toHaveBeenCalledWith('u1');
    expect(String(send.mock.calls[0][0])).toContain('My Server');
  });

  it('never throws when the user blocks DMs (fetch/send rejects)', async () => {
    const client = { users: { fetch: vi.fn().mockRejectedValue(new Error('Cannot send messages to this user')) } } as any;
    await expect(makeModNotifier(client, 'S')({ userId: 'u1', type: 'ban' })).resolves.toBeUndefined();
  });
});
