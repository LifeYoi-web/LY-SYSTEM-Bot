import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiPost } from './lib/api';

export interface MeGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Me {
  id: string;
  username: string;
  avatar: string | null;
  authorized: boolean;
  isOwner?: boolean;
  guildId?: string;
  guilds?: MeGuild[];
}

export function useMe() {
  return useQuery<Me>({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false });
}

export function useSelectGuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guildId: string) => apiPost<{ ok: boolean }>('/auth/select-guild', { guildId }),
    onSuccess: () => qc.clear(), // every cached query belongs to the previous guild
  });
}

export function avatarUrl(me: { id: string; avatar: string | null } | undefined | null): string | null {
  if (!me || !me.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`;
}
