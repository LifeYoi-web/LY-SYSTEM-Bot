// Pure aggregate-trend detection over the DailyStat series — no DB, no Discord.
// Distinct from automod (which is per-message); this watches whole-server trends.
// Unit-tested in tests/alerts.test.ts.

export interface DayStat {
  date: string; // YYYY-MM-DD (UTC)
  messages: number;
  joins: number;
  leaves: number;
}

export interface AlertRules {
  leaveSpikeEnabled: boolean;
  leaveSpikeThreshold: number;
  activityDropEnabled: boolean;
  activityDropPct: number; // alert when today's messages fall this % below the prior-days average
  joinSpikeEnabled: boolean;
  joinSpikeThreshold: number;
}

export type AlertRule = 'leave_spike' | 'join_spike' | 'activity_drop';

export interface AlertHit {
  rule: AlertRule;
  message: string;
}

/**
 * Evaluate alert rules for `todayKey` against the surrounding series. `series` should
 * include today plus several prior days; activity-drop needs >= 3 prior days to be meaningful.
 */
export function detectAlerts(series: DayStat[], todayKey: string, rules: AlertRules): AlertHit[] {
  const today = series.find((s) => s.date === todayKey);
  if (!today) return [];
  const prior = series.filter((s) => s.date !== todayKey);
  const hits: AlertHit[] = [];

  if (rules.leaveSpikeEnabled && today.leaves >= rules.leaveSpikeThreshold) {
    hits.push({ rule: 'leave_spike', message: `⚠️ مغادرات مرتفعة: **${today.leaves}** عضو غادروا اليوم.` });
  }
  if (rules.joinSpikeEnabled && today.joins >= rules.joinSpikeThreshold) {
    hits.push({ rule: 'join_spike', message: `⚠️ موجة انضمام: **${today.joins}** عضو انضموا اليوم — راجع احتمال ريد.` });
  }
  if (rules.activityDropEnabled && prior.length >= 3) {
    const avg = prior.reduce((s, d) => s + d.messages, 0) / prior.length;
    if (avg > 0 && today.messages < avg * (1 - rules.activityDropPct / 100)) {
      hits.push({
        rule: 'activity_drop',
        message: `📉 هبوط نشاط: **${today.messages}** رسالة اليوم مقابل متوسط **${Math.round(avg)}** في الأيام السابقة.`,
      });
    }
  }
  return hits;
}
