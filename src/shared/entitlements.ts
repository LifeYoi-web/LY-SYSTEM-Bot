// Single source of truth for the freemium tier matrix (spec 2026-06-05 §4).
// Pure data + helpers — no I/O. Plan resolution lives in src/db/subscriptions.ts.

export type Plan = 'free' | 'premium' | 'custom';

export const PLAN_RANK: Record<Plan, number> = { free: 0, premium: 1, custom: 2 };

/** Premium-gated features: the minimum plan that unlocks each. */
export type FeatureKey =
  | 'music'
  | 'tempVoice'
  | 'voiceXp'
  | 'creatorAlerts'
  | 'aiSummaries'
  | 'welcomeStyles' // the 9-style gallery (free keeps 'classic')
  | 'welcomeCustomBg';

export const FEATURES: Record<FeatureKey, Plan> = {
  music: 'premium',
  tempVoice: 'premium',
  voiceXp: 'premium',
  creatorAlerts: 'premium',
  aiSummaries: 'premium',
  welcomeStyles: 'premium',
  welcomeCustomBg: 'premium',
};

/** Create-time caps per plan (launch defaults — adjust here only). */
export type LimitKey =
  | 'tags'
  | 'autoResponses'
  | 'rolePanels'
  | 'scheduledMessages'
  | 'statCounters'
  | 'savedEmbeds'
  | 'shopItems'
  | 'ticketTypes'
  | 'activeGiveaways'
  | 'applicationForms'
  | 'transcriptRetentionDays';

const UNLIMITED = Infinity;

export const LIMITS: Record<LimitKey, Record<Plan, number>> = {
  tags: { free: 10, premium: UNLIMITED, custom: UNLIMITED },
  autoResponses: { free: 5, premium: UNLIMITED, custom: UNLIMITED },
  rolePanels: { free: 2, premium: UNLIMITED, custom: UNLIMITED },
  scheduledMessages: { free: 3, premium: UNLIMITED, custom: UNLIMITED },
  statCounters: { free: 2, premium: UNLIMITED, custom: UNLIMITED },
  savedEmbeds: { free: 5, premium: UNLIMITED, custom: UNLIMITED },
  shopItems: { free: 5, premium: UNLIMITED, custom: UNLIMITED },
  ticketTypes: { free: 1, premium: UNLIMITED, custom: UNLIMITED },
  activeGiveaways: { free: 1, premium: UNLIMITED, custom: UNLIMITED },
  applicationForms: { free: 1, premium: UNLIMITED, custom: UNLIMITED },
  transcriptRetentionDays: { free: 7, premium: UNLIMITED, custom: UNLIMITED },
};

export function hasFeature(plan: Plan, key: FeatureKey): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURES[key]];
}

export function limitFor(plan: Plan, key: LimitKey): number {
  return LIMITS[key][plan];
}
