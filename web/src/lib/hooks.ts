import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost, apiPut, apiDelete } from './api';

// ---- Entitlements ----
export interface Entitlements {
  plan: 'free' | 'premium' | 'custom';
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
}

export function useEntitlements() {
  return useQuery<Entitlements>({
    queryKey: ['entitlements'],
    queryFn: () => api('/entitlements'),
    staleTime: 60_000,
  });
}

import type {
  Overview,
  BotPresence,
  MembersResponse,
  MemberDetail,
  ModCase,
  Settings,
  AutoMod,
  LogsResponse,
  Analytics,
  ServerInfo,
  Channel,
  Role,
  LevelConfig,
  LevelReward,
  LeaderboardEntry,
  RolePanel,
  AutoResponse,
  ScheduledMessage,
} from './types';

export function useOverview() {
  return useQuery<Overview>({ queryKey: ['overview'], queryFn: () => api('/overview'), refetchInterval: 30_000 });
}

export function useAnalytics(days = 14) {
  return useQuery<Analytics>({ queryKey: ['analytics', days], queryFn: () => api(`/analytics?days=${days}`) });
}

export interface MemberQuery {
  search?: string;
  filter?: 'all' | 'humans' | 'bots';
  sort?: 'joined' | 'name';
  limit?: number;
  offset?: number;
}
export function useMembers(q: MemberQuery) {
  const params = new URLSearchParams();
  if (q.search) params.set('search', q.search);
  if (q.filter) params.set('filter', q.filter);
  if (q.sort) params.set('sort', q.sort);
  if (q.limit) params.set('limit', String(q.limit));
  if (q.offset) params.set('offset', String(q.offset));
  const qs = params.toString();
  return useQuery<MembersResponse>({
    queryKey: ['members', qs],
    queryFn: () => api(`/members${qs ? `?${qs}` : ''}`),
  });
}

export function useMemberDetail(id: string | null) {
  return useQuery<MemberDetail>({
    queryKey: ['member', id],
    queryFn: () => api(`/members/${id}`),
    enabled: !!id,
  });
}

export function useCases(filter: { userId?: string } = {}) {
  const qs = filter.userId ? `?userId=${encodeURIComponent(filter.userId)}` : '';
  return useQuery<ModCase[]>({ queryKey: ['cases', filter.userId ?? ''], queryFn: () => api(`/moderation/cases${qs}`) });
}

export function useSettings() {
  return useQuery<Settings>({ queryKey: ['settings'], queryFn: () => api('/settings') });
}
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Settings>) => apiPut<Settings>('/settings', body),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}

export function useAutoMod() {
  return useQuery<AutoMod>({ queryKey: ['automod'], queryFn: () => api('/automod') });
}
export function useUpdateAutoMod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AutoMod>) => apiPut<AutoMod>('/automod', body),
    onSuccess: (data) => qc.setQueryData(['automod'], data),
  });
}

export function useLogs(params: { type?: string; page?: number; limit?: number }) {
  const sp = new URLSearchParams();
  if (params.type) sp.set('type', params.type);
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return useQuery<LogsResponse>({ queryKey: ['logs', qs], queryFn: () => api(`/logs${qs ? `?${qs}` : ''}`) });
}

export function useServer() {
  return useQuery<ServerInfo>({ queryKey: ['server'], queryFn: () => api('/server') });
}
export function useChannels() {
  return useQuery<{ channels: Channel[] }>({ queryKey: ['channels'], queryFn: () => api('/server/channels') });
}
export function useRoles() {
  return useQuery<{ roles: Role[] }>({ queryKey: ['roles'], queryFn: () => api('/server/roles') });
}

export interface ModActionBody {
  kind: 'warn' | 'mute' | 'kick' | 'ban';
  userId: string;
  reason?: string;
  seconds?: number;
  deleteMessageSeconds?: number;
}
export function useModAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, ...body }: ModActionBody) => apiPost(`/moderation/${kind}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['member'] });
    },
  });
}

export function useLiftCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/moderation/cases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

// ---- Leveling ----
export function useLeveling() {
  return useQuery<{ config: LevelConfig; rewards: LevelReward[] }>({ queryKey: ['leveling'], queryFn: () => api('/leveling') });
}
export function useUpdateLeveling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LevelConfig>) => apiPut<LevelConfig>('/leveling', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leveling'] }),
  });
}
export function useLeaderboard() {
  return useQuery<{ leaderboard: LeaderboardEntry[] }>({ queryKey: ['leaderboard'], queryFn: () => api('/leveling/leaderboard') });
}
export function useAddReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { level: number; roleId: string }) => apiPost('/leveling/rewards', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leveling'] }),
  });
}
export function useDeleteReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/leveling/rewards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leveling'] }),
  });
}

// ---- Role panels ----
export function useRolePanels() {
  return useQuery<{ panels: RolePanel[] }>({ queryKey: ['rolepanels'], queryFn: () => api('/rolepanels') });
}
export function useSaveRolePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<RolePanel> & { id?: string }) =>
      id ? apiPut(`/rolepanels/${id}`, body) : apiPost('/rolepanels', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rolepanels'] }),
  });
}
export function useDeleteRolePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/rolepanels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rolepanels'] }),
  });
}
export function usePostRolePanel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, channelId }: { id: string; channelId: string }) => apiPost(`/rolepanels/${id}/post`, { channelId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rolepanels'] }),
  });
}

// ---- Announce ----
export function useAnnounce() {
  return useMutation({
    mutationFn: (body: { channelId: string; content?: string; embed?: Record<string, string> }) => apiPost('/announce', body),
  });
}

// ---- Auto-responders ----
export function useAutoResponders() {
  return useQuery<{ items: AutoResponse[] }>({ queryKey: ['autoresponders'], queryFn: () => api('/autoresponders') });
}
export function useSaveAutoResponder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<AutoResponse> & { id?: string }) =>
      id ? apiPut(`/autoresponders/${id}`, body) : apiPost('/autoresponders', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoresponders'] }),
  });
}
export function useDeleteAutoResponder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/autoresponders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoresponders'] }),
  });
}

// ---- Scheduled ----
export function useScheduled() {
  return useQuery<{ items: ScheduledMessage[] }>({ queryKey: ['scheduled'], queryFn: () => api('/scheduled') });
}
export function useSaveScheduled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ScheduledMessage> & { id?: string }) =>
      id ? apiPut(`/scheduled/${id}`, body) : apiPost('/scheduled', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled'] }),
  });
}
export function useDeleteScheduled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/scheduled/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled'] }),
  });
}

// ---- Bot (presence + restart) ----
export function useBotPresence() {
  return useQuery<BotPresence>({ queryKey: ['botPresence'], queryFn: () => api('/bot/presence') });
}
export function useUpdateBotPresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string | null; text: string | null; url: string | null }) =>
      apiPut<BotPresence>('/bot/presence', body),
    onSuccess: (data) => qc.setQueryData(['botPresence'], data),
  });
}
export function useRestartBot() {
  return useMutation<{ ok: boolean }, Error, void>({ mutationFn: () => apiPost('/bot/restart') });
}
