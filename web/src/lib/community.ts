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
