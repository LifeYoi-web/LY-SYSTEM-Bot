import { describe, it, expect } from 'vitest';
import { hasFeature, limitFor, FEATURES, LIMITS, PLAN_RANK } from '../src/shared/entitlements';

describe('entitlements matrix', () => {
  it('free lacks premium features; premium and custom have them', () => {
    expect(hasFeature('free', 'music')).toBe(false);
    expect(hasFeature('premium', 'music')).toBe(true);
    expect(hasFeature('custom', 'music')).toBe(true);
    expect(hasFeature('free', 'voiceXp')).toBe(false);
    expect(hasFeature('free', 'creatorAlerts')).toBe(false);
    expect(hasFeature('free', 'aiSummaries')).toBe(false);
    expect(hasFeature('free', 'tempVoice')).toBe(false);
    expect(hasFeature('free', 'welcomeStyles')).toBe(false);
    expect(hasFeature('free', 'welcomeCustomBg')).toBe(false);
  });

  it('limits follow the spec §4 launch defaults', () => {
    expect(limitFor('free', 'tags')).toBe(10);
    expect(limitFor('free', 'autoResponses')).toBe(5);
    expect(limitFor('free', 'rolePanels')).toBe(2);
    expect(limitFor('free', 'scheduledMessages')).toBe(3);
    expect(limitFor('free', 'statCounters')).toBe(2);
    expect(limitFor('free', 'savedEmbeds')).toBe(5);
    expect(limitFor('free', 'shopItems')).toBe(5);
    expect(limitFor('free', 'ticketTypes')).toBe(1);
    expect(limitFor('free', 'activeGiveaways')).toBe(1);
    expect(limitFor('free', 'applicationForms')).toBe(1);
    expect(limitFor('free', 'transcriptRetentionDays')).toBe(7);
    expect(limitFor('premium', 'tags')).toBe(Infinity);
    expect(limitFor('custom', 'ticketTypes')).toBe(Infinity);
  });

  it('every feature key maps to a plan present in PLAN_RANK, every limit covers all plans', () => {
    for (const plan of Object.values(FEATURES)) expect(PLAN_RANK[plan]).toBeDefined();
    for (const perPlan of Object.values(LIMITS)) {
      expect(Object.keys(perPlan).sort()).toEqual(['custom', 'free', 'premium']);
    }
  });
});
