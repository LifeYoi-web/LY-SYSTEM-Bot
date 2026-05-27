import { describe, it, expect } from 'vitest';
import {
  slugifyTicketName,
  resolveType,
  isTicketStaff,
  renderTranscriptHtml,
  buildTicketPanel,
} from '../src/bot/tickets';

const cfg = (over: Record<string, unknown> = {}) =>
  ({
    guildId: 'g1',
    enabled: true,
    categoryId: 'cat',
    supportRoleId: 'srole',
    openMessage: null,
    counter: 0,
    transcriptChannelId: null,
    dmOnOpen: true,
    dmOnClose: true,
    ...over,
  }) as any;

const type = (over: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    guildId: 'g1',
    label: 'دعم فني',
    emoji: '🛠️',
    categoryId: 'c2',
    supportRoleId: 'r2',
    openMessage: 'hi',
    pingSupport: true,
    position: 0,
    enabled: true,
    createdAt: new Date(),
    ...over,
  }) as any;

describe('slugifyTicketName', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyTicketName('Tech Support')).toBe('tech-support');
  });
  it('falls back to "ticket" when nothing usable remains', () => {
    expect(slugifyTicketName('!!!')).toBe('ticket');
  });
});

describe('resolveType', () => {
  it('returns the matching configured type', () => {
    const r = resolveType(cfg(), [type()], 't1');
    expect(r.id).toBe('t1');
    expect(r.supportRoleId).toBe('r2');
  });
  it('falls back to the config default when the id is missing or absent', () => {
    const r = resolveType(cfg(), [], undefined);
    expect(r.id).toBeNull();
    expect(r.slug).toBe('ticket');
    expect(r.supportRoleId).toBe('srole');
  });
});

describe('isTicketStaff', () => {
  const member = (perms: boolean, roles: string[]) =>
    ({ permissions: { has: () => perms }, roles: { cache: { has: (r: string) => roles.includes(r) } } }) as any;
  it('is true for ManageGuild/Administrator', () => {
    expect(isTicketStaff(member(true, []), cfg(), [])).toBe(true);
  });
  it('is true for a member of a per-type support role', () => {
    expect(isTicketStaff(member(false, ['r2']), cfg({ supportRoleId: null }), [type()])).toBe(true);
  });
  it('is false for a non-staff member', () => {
    expect(isTicketStaff(member(false, ['x']), cfg({ supportRoleId: null }), [])).toBe(false);
  });
});

describe('renderTranscriptHtml', () => {
  it('escapes message content and includes the ticket number', () => {
    const html = renderTranscriptHtml({
      guildName: 'LY',
      number: 7,
      typeLabel: 'دعم',
      opener: 'u1',
      closedBy: 'u2',
      messages: [
        {
          authorTag: 'a#1',
          authorId: 'u1',
          bot: false,
          content: '<script>x</script>',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          attachments: [],
        },
      ],
    });
    expect(html).toContain('#7');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x');
  });
  it('renders a placeholder for an empty conversation', () => {
    const html = renderTranscriptHtml({ guildName: 'LY', number: 1, typeLabel: 'x', opener: 'u', messages: [] });
    expect(html).toContain('لا توجد رسائل');
  });
});

describe('buildTicketPanel', () => {
  it('uses a single open button when no enabled types exist', () => {
    const json = JSON.stringify(buildTicketPanel(cfg(), []).components);
    expect(json).toContain('ticket:open');
    expect(json).not.toContain('ticket:type');
  });
  it('uses a type select menu when enabled types exist', () => {
    const json = JSON.stringify(buildTicketPanel(cfg(), [type()]).components);
    expect(json).toContain('ticket:type');
  });
  it('ignores disabled types (falls back to the button)', () => {
    const json = JSON.stringify(buildTicketPanel(cfg(), [type({ enabled: false })]).components);
    expect(json).toContain('ticket:open');
  });
});
