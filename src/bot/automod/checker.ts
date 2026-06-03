export type Violation = 'banned_word' | 'invite' | 'link' | 'mentions' | 'spam' | 'scam' | null;

// Common token-stealing / phishing domains. Used as defaults when a guild has not
// supplied its own scamDomains list. Matching is substring + case-insensitive.
export const DEFAULT_SCAM_DOMAINS = [
  'discordnitro', 'discord-nitro', 'discrod', 'dlscord', 'discordgift', 'discord-gift',
  'steamcommunity.ru', 'steamcommunnity', 'free-nitro', 'nitro-free', 'discordapp.gift',
  'discord.gift-', 'gift-discord', 'discord-airdrop', 'crypto-airdrop',
];

/**
 * Scam / phishing link scan, independent of the all-or-nothing antiLink switch so a
 * guild can allow normal links while still nuking known token-stealing domains.
 */
export function checkScamLink(content: string, domains: string[]): boolean {
  const list = domains.length ? domains : DEFAULT_SCAM_DOMAINS;
  const lower = content.toLowerCase();
  return list.some((d) => d && lower.includes(d.toLowerCase()));
}

export interface ContentRules {
  antiInvite: boolean;
  antiLink: boolean;
  bannedWords: string[];
  maxMentions: number;
}

const INVITE_RE = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/\S+/i;
const URL_RE = /https?:\/\/\S+/i;

/**
 * Stateless content scan. Order is deliberate: explicit banned words first, then
 * invites, generic links, then mention floods.
 */
export function checkContent(content: string, mentionCount: number, rules: ContentRules): Violation {
  const lower = content.toLowerCase();
  for (const w of rules.bannedWords ?? []) {
    if (w && lower.includes(w.toLowerCase())) return 'banned_word';
  }
  if (rules.antiInvite && INVITE_RE.test(content)) return 'invite';
  if (rules.antiLink && URL_RE.test(content)) return 'link';
  if (mentionCount > rules.maxMentions) return 'mentions';
  return null;
}

// Per-user sliding window for spam detection.
const recent = new Map<string, number[]>();

export function checkSpam(userId: string, now = Date.now(), windowMs = 7000, max = 5): boolean {
  // Opportunistic eviction so the map can't grow unbounded over the process lifetime.
  if (recent.size > 5000) {
    for (const [k, ts] of recent) {
      const last = ts[ts.length - 1];
      if (last === undefined || now - last > windowMs) recent.delete(k);
    }
  }
  const arr = (recent.get(userId) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  recent.set(userId, arr);
  return arr.length > max;
}

export function _resetSpam(): void {
  recent.clear();
}

export const VIOLATION_LABELS: Record<Exclude<Violation, null>, string> = {
  banned_word: 'كلمة محظورة',
  invite: 'رابط دعوة',
  link: 'رابط خارجي',
  mentions: 'إشارات مفرطة',
  spam: 'سبام / إغراق',
  scam: 'رابط نصب / تصيّد',
};
