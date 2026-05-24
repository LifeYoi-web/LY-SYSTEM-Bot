import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiPost, apiPut, apiDelete } from './api';
import type {
  Overview,
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
