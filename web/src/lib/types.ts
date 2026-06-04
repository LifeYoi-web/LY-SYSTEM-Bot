export interface Overview {
  name: string;
  iconUrl: string | null;
  memberCount: number;
  botCount: number;
  humanCount: number;
  channelCount: number;
  roleCount: number;
  boostLevel: number;
  boostCount: number;
  activeCases: number;
  totalCases: number;
  todayJoins: number;
  todayMessages: number;
  recentLogs: LogEntry[];
}

export interface BotPresence {
  type: string | null; // playing | listening | watching | streaming | custom | null
  text: string | null;
  url: string | null;
  types?: string[]; // allowed types (returned by GET)
}

export interface RoleRef {
  id: string;
  name: string;
  color: string | null;
}

export interface Member {
  id: string;
  username: string;
  globalName: string | null;
  displayName: string;
  avatarUrl: string | null;
  isBot: boolean;
  joinedAt: string | null;
  createdAt: string | null;
  color: string | null;
  roleCount: number;
  roles: RoleRef[];
}

export interface MembersResponse {
  members: Member[];
  total: number;
  limit: number;
  offset: number;
}

export type CaseType = 'ban' | 'kick' | 'mute' | 'warn';

export interface ModCase {
  id: string;
  guildId: string;
  targetUserId: string;
  moderatorId: string;
  type: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  active: boolean;
}

export interface MemberDetail {
  member: Member;
  cases: ModCase[];
  stats: { total: number; active: number; byType: Record<string, number> };
}

export interface WelcomeButton {
  label: string;
  url: string;
  emoji?: string;
}
export interface Settings {
  guildId: string;
  language: string;
  logChannelId: string | null;
  staffRoleIds: string[];
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string | null;
  goodbyeEnabled: boolean;
  goodbyeMessage: string | null;
  autoRoleId: string | null;
  // Premium welcome / goodbye
  welcomeUseCard: boolean;
  welcomeCardBg: string | null;
  welcomeCardStyle: string;
  welcomeEmbedEnabled: boolean;
  goodbyeEmbedEnabled: boolean;
  welcomeButtons: WelcomeButton[];
  welcomeDmEnabled: boolean;
  welcomeDmMessage: string | null;
  welcomeMentionDeleteSeconds: number;
  goodbyeUseCard: boolean;
  // Account-age / alt gate on join
  minAccountAgeDays: number;
  altGateAction: string; // kick | quarantine | alert
  quarantineRoleId: string | null;
}

export interface AutoMod {
  guildId: string;
  enabled: boolean;
  antiSpam: boolean;
  antiInvite: boolean;
  antiLink: boolean;
  bannedWords: string[];
  maxMentions: number;
  actionOnViolation: string;
  muteSeconds: number;
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
  antiScam: boolean;
  scamDomains: string[];
  scamAction: string;
}

export interface LogEntry {
  id: string;
  guildId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface DayPoint {
  date: string;
  messages: number;
  joins: number;
  leaves: number;
  modActions: number;
  memberCount: number;
}

export interface Analytics {
  days: number;
  series: DayPoint[];
  totals: { messages: number; joins: number; leaves: number; modActions: number };
  caseDistribution: { type: string; count: number }[];
  topModerators: { moderatorId: string; count: number }[];
}

export interface ServerInfo {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  channelCount: number;
  roleCount: number;
  emojiCount: number;
  boostLevel: number;
  boostCount: number;
  ownerId: string;
  createdTimestamp: number | null;
  channelsByType: Record<string, number>;
}

export interface Channel {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  position: number;
}

export interface Role {
  id: string;
  name: string;
  color: string | null;
  position: number;
  managed: boolean;
}

export interface LevelConfig {
  guildId: string;
  enabled: boolean;
  xpPerMessage: number;
  cooldownSeconds: number;
  multiplier: number;
  levelUpEnabled: boolean;
  levelUpChannelId: string | null;
  levelUpMessage: string | null;
  stackRewards: boolean;
  voiceXpEnabled: boolean;
  voiceXpPerMinute: number;
  ignoredVoiceChannelIds: string[];
}
export interface LevelReward {
  id: string;
  guildId: string;
  level: number;
  roleId: string;
}
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  xp: number;
  level: number;
  progress: { level: number; into: number; needed: number; pct: number };
}

export interface PanelRole {
  roleId: string;
  label: string;
  emoji?: string;
  style?: number;
}
export interface RolePanel {
  id: string;
  guildId: string;
  channelId: string | null;
  messageId: string | null;
  title: string;
  description: string | null;
  roles: PanelRole[];
  createdAt: string;
}

export interface AutoResponse {
  id: string;
  guildId: string;
  trigger: string;
  matchType: string;
  reply: string;
  enabled: boolean;
}

export interface ScheduledMessage {
  id: string;
  guildId: string;
  channelId: string;
  content: string;
  runAt: string;
  repeat: string;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}
