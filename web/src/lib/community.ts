import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost, apiPut, apiDelete } from './api';

/* ============================ types ============================ */
export interface TicketConfig {
  guildId: string;
  enabled: boolean;
  categoryId: string | null;
  supportRoleId: string | null;
  openMessage: string | null;
  counter: number;
  transcriptChannelId: string | null;
  dmOnOpen: boolean;
  dmOnClose: boolean;
}
export interface TicketType {
  id: string;
  guildId: string;
  label: string;
  emoji: string | null;
  categoryId: string | null;
  supportRoleId: string | null;
  openMessage: string | null;
  pingSupport: boolean;
  position: number;
  enabled: boolean;
}
export interface Ticket {
  id: string;
  channelId: string;
  userId: string;
  number: number;
  typeId: string | null;
  claimedBy: string | null;
  closedBy: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
}
export interface ClosedTicket extends Ticket {
  transcriptId: string | null;
}
export interface Giveaway {
  id: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  winnerCount: number;
  endsAt: string;
  ended: boolean;
  entrants: string[];
  winners: string[];
  createdAt: string;
}
export interface StarboardConfig {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  threshold: number;
  emoji: string;
}
export interface SuggestionConfig {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
}
export interface Suggestion {
  id: string;
  channelId: string;
  messageId: string | null;
  authorId: string;
  content: string;
  status: string;
  up: number;
  down: number;
  createdAt: string;
}
export interface BirthdayConfig {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
}
export interface Birthday {
  guildId: string;
  userId: string;
  day: number;
  month: number;
}
export interface Tag {
  id: string;
  name: string;
  content: string;
  uses: number;
}
export interface StickyMessage {
  guildId: string;
  channelId: string;
  content: string;
  lastMessageId: string | null;
  enabled: boolean;
}
export interface CountingConfig {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  current: number;
  best: number;
  lastUserId: string | null;
}
export interface StatCounter {
  id: string;
  channelId: string;
  type: string;
  template: string;
}
export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  content: string;
  remindAt: string;
}
export interface ReportConfig {
  guildId: string;
  channelId: string | null;
}
export interface TempVoiceConfig {
  guildId: string;
  enabled: boolean;
  hubChannelId: string | null;
  categoryId: string | null;
  nameTemplate: string;
  defaultUserLimit: number;
  defaultLocked: boolean;
}
export interface CreatorAnnounceConfig {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  pingMode: string; // everyone | here | role | none
  pingRoleId: string | null;
  messageTemplate: string | null;
  youtubeEnabled: boolean;
  youtubeChannelId: string | null;
  tiktokEnabled: boolean;
  tiktokUsername: string | null;
}

/* ============================ hooks ============================ */
function invalidate(qc: ReturnType<typeof useQueryClient>, key: string) {
  return () => qc.invalidateQueries({ queryKey: [key] });
}

// Tickets
export const useTickets = () =>
  useQuery<{ config: TicketConfig; types: TicketType[]; tickets: Ticket[]; closed: ClosedTicket[] }>({
    queryKey: ['tickets'],
    queryFn: () => api('/tickets'),
  });
export function useUpdateTicketConfig() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<TicketConfig>) => apiPut('/tickets/config', b), onSuccess: invalidate(qc, 'tickets') });
}
export function usePostTicketPanel() {
  return useMutation({ mutationFn: (channelId: string) => apiPost('/tickets/panel', { channelId }) });
}
export function useSaveTicketType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: Partial<TicketType> & { id?: string }) =>
      id ? apiPut(`/tickets/types/${id}`, b) : apiPost('/tickets/types', b),
    onSuccess: invalidate(qc, 'tickets'),
  });
}
export function useDeleteTicketType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/tickets/types/${id}`), onSuccess: invalidate(qc, 'tickets') });
}
export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiPost(`/tickets/${id}/close`), onSuccess: invalidate(qc, 'tickets') });
}
export function useReopenTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiPost(`/tickets/${id}/reopen`), onSuccess: invalidate(qc, 'tickets') });
}

// Giveaways
export const useGiveaways = () => useQuery<{ giveaways: Giveaway[] }>({ queryKey: ['giveaways'], queryFn: () => api('/giveaways') });
export function useCreateGiveaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { channelId: string; prize: string; winnerCount: number; duration: string }) => apiPost('/giveaways', b),
    onSuccess: invalidate(qc, 'giveaways'),
  });
}
export function useGiveawayAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'end' | 'reroll' | 'delete' }) =>
      action === 'delete' ? apiDelete(`/giveaways/${id}`) : apiPost(`/giveaways/${id}/${action}`),
    onSuccess: invalidate(qc, 'giveaways'),
  });
}

// Starboard
export const useStarboard = () => useQuery<StarboardConfig>({ queryKey: ['starboard'], queryFn: () => api('/starboard') });
export function useUpdateStarboard() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<StarboardConfig>) => apiPut('/starboard', b), onSuccess: invalidate(qc, 'starboard') });
}

// Suggestions
export const useSuggestions = () => useQuery<{ config: SuggestionConfig; suggestions: Suggestion[] }>({ queryKey: ['suggestions'], queryFn: () => api('/suggestions') });
export function useUpdateSuggestionConfig() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<SuggestionConfig>) => apiPut('/suggestions/config', b), onSuccess: invalidate(qc, 'suggestions') });
}
export function useSuggestionDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'deny' }) => apiPost(`/suggestions/${id}/${decision}`),
    onSuccess: invalidate(qc, 'suggestions'),
  });
}

// Birthdays
export const useBirthdays = () => useQuery<{ config: BirthdayConfig; birthdays: Birthday[] }>({ queryKey: ['birthdays'], queryFn: () => api('/birthdays') });
export function useUpdateBirthdayConfig() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<BirthdayConfig>) => apiPut('/birthdays/config', b), onSuccess: invalidate(qc, 'birthdays') });
}

// Tags
export const useTags = () => useQuery<{ tags: Tag[] }>({ queryKey: ['tags'], queryFn: () => api('/tags') });
export function useSaveTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id?: string; name?: string; content: string }) => (id ? apiPut(`/tags/${id}`, b) : apiPost('/tags', b)),
    onSuccess: invalidate(qc, 'tags'),
  });
}
export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/tags/${id}`), onSuccess: invalidate(qc, 'tags') });
}

// Sticky
export const useSticky = () => useQuery<{ items: StickyMessage[] }>({ queryKey: ['sticky'], queryFn: () => api('/sticky') });
export function useSaveSticky() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { channelId: string; content: string; enabled?: boolean }) => apiPut('/sticky', b), onSuccess: invalidate(qc, 'sticky') });
}
export function useDeleteSticky() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (channelId: string) => apiDelete(`/sticky/${channelId}`), onSuccess: invalidate(qc, 'sticky') });
}

// Counting
export const useCounting = () => useQuery<CountingConfig>({ queryKey: ['counting'], queryFn: () => api('/counting') });
export function useUpdateCounting() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<CountingConfig> & { reset?: boolean }) => apiPut('/counting', b), onSuccess: invalidate(qc, 'counting') });
}

// Stat counters
export const useStatCounters = () => useQuery<{ counters: StatCounter[] }>({ queryKey: ['statcounters'], queryFn: () => api('/statcounters') });
export function useCreateStatCounter() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { channelId: string; type: string; template: string }) => apiPost('/statcounters', b), onSuccess: invalidate(qc, 'statcounters') });
}
export function useDeleteStatCounter() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/statcounters/${id}`), onSuccess: invalidate(qc, 'statcounters') });
}

// Reminders
export const useReminders = () => useQuery<{ items: Reminder[] }>({ queryKey: ['reminders'], queryFn: () => api('/reminders') });
export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/reminders/${id}`), onSuccess: invalidate(qc, 'reminders') });
}

// Report
export const useReport = () => useQuery<ReportConfig>({ queryKey: ['report'], queryFn: () => api('/report') });
export function useUpdateReport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<ReportConfig>) => apiPut('/report', b), onSuccess: invalidate(qc, 'report') });
}

// Temp voice rooms (Join-to-Create)
export const useTempVoice = () =>
  useQuery<{ config: TempVoiceConfig }>({ queryKey: ['tempvoice'], queryFn: () => api('/tempvoice') });
export function useUpdateTempVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Partial<TempVoiceConfig>) => apiPut('/tempvoice/config', b),
    onSuccess: invalidate(qc, 'tempvoice'),
  });
}

// Creator content announcements (YouTube / TikTok new uploads)
export const useCreatorAnnounce = () =>
  useQuery<{ config: CreatorAnnounceConfig }>({ queryKey: ['creatorannounce'], queryFn: () => api('/creatorannounce') });
export function useUpdateCreatorAnnounce() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Partial<CreatorAnnounceConfig>) => apiPut('/creatorannounce/config', b),
    onSuccess: invalidate(qc, 'creatorannounce'),
  });
}
export function useTestCreatorAnnounce() {
  return useMutation({ mutationFn: () => apiPost('/creatorannounce/test') });
}

/* ===================== Wave-2 features (15 new) ===================== */

// Invite tracking
export interface InviteConfig {
  guildId: string;
  enabled: boolean;
  fakeDays: number;
  rewardRoleId: string | null;
  rewardThreshold: number;
  logChannelId: string | null;
}
export interface InviteStat {
  guildId: string;
  userId: string;
  regular: number;
  fake: number;
  left: number;
}
export const useInvites = () =>
  useQuery<{ config: InviteConfig; leaderboard: InviteStat[] }>({ queryKey: ['invites'], queryFn: () => api('/invites') });
export function useUpdateInviteConfig() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<InviteConfig>) => apiPut('/invites/config', b), onSuccess: invalidate(qc, 'invites') });
}

// Anti-raid
export interface RaidConfig {
  guildId: string;
  enabled: boolean;
  joinWindowSec: number;
  joinThreshold: number;
  action: string; // lockdown | kick | ban
  raiseVerification: boolean;
  alertChannelId: string | null;
  autoLiftMinutes: number;
}
export const useRaid = () => useQuery<RaidConfig>({ queryKey: ['raid'], queryFn: () => api('/raid') });
export function useUpdateRaid() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<RaidConfig>) => apiPut('/raid', b), onSuccess: invalidate(qc, 'raid') });
}

// Economy
export interface EconomyConfig {
  guildId: string;
  enabled: boolean;
  currencyName: string;
  currencyEmoji: string;
  perMessage: number;
  cooldownSeconds: number;
  dailyAmount: number;
  streakBonus: number;
  maxStreakBonus: number;
}
export interface Wallet {
  guildId: string;
  userId: string;
  balance: number;
  streak: number;
  lastDaily: string | null;
}
export const useEconomy = () =>
  useQuery<{ config: EconomyConfig; leaderboard: Wallet[] }>({ queryKey: ['economy'], queryFn: () => api('/economy') });
export function useUpdateEconomy() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<EconomyConfig>) => apiPut('/economy/config', b), onSuccess: invalidate(qc, 'economy') });
}
export function useGrantCoins() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { userId: string; amount: number }) => apiPost('/economy/grant', b), onSuccess: invalidate(qc, 'economy') });
}

// Role shop
export interface ShopItem {
  id: string;
  guildId: string;
  roleId: string;
  label: string | null;
  price: number;
  stock: number; // -1 = unlimited
  durationHours: number | null;
  requiredLevel: number | null;
  position: number;
  enabled: boolean;
}
export const useShop = () => useQuery<{ items: ShopItem[] }>({ queryKey: ['shop'], queryFn: () => api('/shop') });
export function useSaveShopItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: Partial<ShopItem> & { id?: string }) => (id ? apiPut(`/shop/items/${id}`, b) : apiPost('/shop/items', b)),
    onSuccess: invalidate(qc, 'shop'),
  });
}
export function useDeleteShopItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/shop/items/${id}`), onSuccess: invalidate(qc, 'shop') });
}

// Embed builder
export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}
export interface EmbedLinkButton {
  label: string;
  url: string;
  emoji?: string;
}
export interface EmbedPayload {
  title?: string;
  description?: string;
  color?: string;
  fields?: EmbedField[];
  image?: string;
  thumbnail?: string;
  footer?: string;
  author?: string;
  buttons?: EmbedLinkButton[];
}
export interface SavedEmbed {
  id: string;
  guildId: string;
  name: string;
  payload: EmbedPayload;
  postedChannelId: string | null;
  postedMessageId: string | null;
  updatedAt: string;
}
export const useEmbeds = () => useQuery<{ embeds: SavedEmbed[] }>({ queryKey: ['embeds'], queryFn: () => api('/embeds') });
export function useSaveEmbed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id?: string; name?: string; payload: EmbedPayload }) =>
      id ? apiPut(`/embeds/${id}`, b) : apiPost('/embeds', b),
    onSuccess: invalidate(qc, 'embeds'),
  });
}
export function useDeleteEmbed() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/embeds/${id}`), onSuccess: invalidate(qc, 'embeds') });
}
export function usePostEmbed() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: { id: string; channelId?: string }) => apiPost(`/embeds/${b.id}/post`, { channelId: b.channelId }), onSuccess: invalidate(qc, 'embeds') });
}

// Applications
export interface AppQuestion {
  id: string;
  formId: string;
  label: string;
  style: string; // short | paragraph
  required: boolean;
  position: number;
}
export interface AppForm {
  id: string;
  guildId: string;
  name: string;
  description: string | null;
  reviewChannelId: string | null;
  acceptRoleId: string | null;
  enabled: boolean;
  questions: AppQuestion[];
}
export interface AppSubmission {
  id: string;
  formId: string;
  userId: string;
  answers: { label: string; answer: string }[];
  status: string;
  reviewedBy: string | null;
  createdAt: string;
}
export interface AppFormInput {
  id?: string;
  name: string;
  description?: string | null;
  reviewChannelId?: string | null;
  acceptRoleId?: string | null;
  enabled?: boolean;
  questions: { label: string; style: string; required: boolean }[];
}
export const useApplications = () =>
  useQuery<{ forms: AppForm[]; submissions: AppSubmission[] }>({ queryKey: ['applications'], queryFn: () => api('/applications') });
export function useSaveForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: AppFormInput) => (id ? apiPut(`/applications/forms/${id}`, b) : apiPost('/applications/forms', b)),
    onSuccess: invalidate(qc, 'applications'),
  });
}
export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => apiDelete(`/applications/forms/${id}`), onSuccess: invalidate(qc, 'applications') });
}
export function usePostAppPanel() {
  return useMutation({ mutationFn: (b: { id: string; channelId: string }) => apiPost(`/applications/forms/${b.id}/panel`, { channelId: b.channelId }) });
}

// Weekly digest
export interface DigestConfig {
  guildId: string;
  enabled: boolean;
  channelId: string | null;
  weekday: number;
  lastSentKey: string | null;
}
export const useDigest = () => useQuery<DigestConfig>({ queryKey: ['digest'], queryFn: () => api('/digest') });
export function useUpdateDigest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<DigestConfig>) => apiPut('/digest/config', b), onSuccess: invalidate(qc, 'digest') });
}
export function useTestDigest() {
  return useMutation({ mutationFn: () => apiPost('/digest/test') });
}

// Booster tracking
export interface BoosterConfig {
  guildId: string;
  enabled: boolean;
  announceChannelId: string | null;
  message: string | null;
  perkRoleIds: string[];
  coinBonus: number;
}
export interface BoosterRecord {
  guildId: string;
  userId: string;
  startedAt: string;
  active: boolean;
}
export const useBoosters = () =>
  useQuery<{ config: BoosterConfig; boosters: BoosterRecord[] }>({ queryKey: ['boosters'], queryFn: () => api('/boosters') });
export function useUpdateBoosters() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<BoosterConfig>) => apiPut('/boosters/config', b), onSuccess: invalidate(qc, 'boosters') });
}

// Churn alerts
export interface AlertConfig {
  guildId: string;
  enabled: boolean;
  alertChannelId: string | null;
  leaveSpikeEnabled: boolean;
  leaveSpikeThreshold: number;
  activityDropEnabled: boolean;
  activityDropPct: number;
  joinSpikeEnabled: boolean;
  joinSpikeThreshold: number;
}
export const useAlerts = () => useQuery<AlertConfig>({ queryKey: ['alerts'], queryFn: () => api('/alerts') });
export function useUpdateAlerts() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<AlertConfig>) => apiPut('/alerts', b), onSuccess: invalidate(qc, 'alerts') });
}

// Staff report
export interface StaffRow {
  userId: string;
  tag: string | null;
  modActions: number;
  ticketsClaimed: number;
  ticketsClosed: number;
  inactive: boolean;
}
export const useStaffReport = (days: number) =>
  useQuery<{ days: number; rows: StaffRow[] }>({ queryKey: ['staffreport', days], queryFn: () => api(`/staffreport?days=${days}`) });
