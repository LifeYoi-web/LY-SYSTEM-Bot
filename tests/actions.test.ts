import { describe, it, expect, vi, beforeEach } from 'vitest';
import { banUser, kickUser, muteUser, warnUser, liftCase } from '../src/bot/moderation/actions';

function fakeDeps() {
  const calls: string[] = [];
  const member = { timeout: vi.fn().mockImplementation(async () => void calls.push('timeout')) };
  const guild = {
    members: {
      ban: vi.fn().mockImplementation(async () => void calls.push('ban')),
      kick: vi.fn().mockImplementation(async () => void calls.push('kick')),
      unban: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(member),
    },
  };
  const notify = vi.fn().mockImplementation(async () => void calls.push('notify'));
  let seq = 0;
  const prisma = {
    moderationCase: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `c${++seq}`, active: true, ...data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      findUnique: vi.fn(),
    },
    logEntry: { create: vi.fn().mockResolvedValue(undefined) },
  };
  return { deps: { guild, prisma, notify } as any, guild, member, prisma, notify, calls };
}

const base = { guildId: 'g1', targetUserId: 'u1', moderatorId: 'm1', reason: 'spam' };

describe('moderation actions', () => {
  let f: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    f = fakeDeps();
  });

  it('banUser bans, records a case and a log entry', async () => {
    const c = await banUser(f.deps, { ...base, deleteMessageSeconds: 3600 });
    expect(f.guild.members.ban).toHaveBeenCalledWith('u1', { reason: 'spam', deleteMessageSeconds: 3600 });
    expect(c.type).toBe('ban');
    expect(f.prisma.moderationCase.create).toHaveBeenCalledTimes(1);
    expect(f.prisma.logEntry.create).toHaveBeenCalledTimes(1);
  });

  it('kickUser kicks and records', async () => {
    const c = await kickUser(f.deps, base);
    expect(f.guild.members.kick).toHaveBeenCalledWith('u1', 'spam');
    expect(c.type).toBe('kick');
  });

  it('muteUser times out for the given seconds and sets expiresAt', async () => {
    const c = await muteUser(f.deps, { ...base, seconds: 300 });
    expect(f.guild.members.fetch).toHaveBeenCalledWith('u1');
    expect(f.member.timeout).toHaveBeenCalledWith(300_000, 'spam');
    expect(c.type).toBe('mute');
    expect(c.expiresAt).toBeInstanceOf(Date);
  });

  it('warnUser records and DMs the target (no ban/kick)', async () => {
    const c = await warnUser(f.deps, base);
    expect(f.guild.members.ban).not.toHaveBeenCalled();
    expect(f.guild.members.kick).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'warn', reason: 'spam' });
    expect(c.type).toBe('warn');
  });

  it('banUser DMs the target BEFORE banning (cannot DM once removed)', async () => {
    await banUser(f.deps, base);
    expect(f.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'ban', reason: 'spam' });
    expect(f.calls).toEqual(['notify', 'ban']);
  });

  it('kickUser DMs the target before kicking', async () => {
    await kickUser(f.deps, base);
    expect(f.calls).toEqual(['notify', 'kick']);
  });

  it('muteUser DMs the target', async () => {
    await muteUser(f.deps, { ...base, seconds: 300 });
    expect(f.notify).toHaveBeenCalledWith({ userId: 'u1', type: 'mute', reason: 'spam' });
  });

  it('a failing DM never blocks the moderation action', async () => {
    f.notify.mockRejectedValueOnce(new Error('user has DMs closed'));
    const c = await banUser(f.deps, base);
    expect(f.guild.members.ban).toHaveBeenCalledWith('u1', expect.objectContaining({ reason: 'spam' }));
    expect(c.type).toBe('ban');
  });

  it('liftCase unbans, marks the ban case inactive and logs', async () => {
    f.prisma.moderationCase.findUnique.mockResolvedValue({ id: 'c1', guildId: 'g1', targetUserId: 'u1', type: 'ban', active: true });
    const c = await liftCase(f.deps, 'c1');
    expect(f.guild.members.unban).toHaveBeenCalledWith('u1', expect.any(String));
    expect(f.prisma.moderationCase.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { active: false } });
    expect(c?.active).toBe(false);
  });

  it('liftCase returns null for an unknown case', async () => {
    f.prisma.moderationCase.findUnique.mockResolvedValue(null);
    expect(await liftCase(f.deps, 'nope')).toBeNull();
  });
});
