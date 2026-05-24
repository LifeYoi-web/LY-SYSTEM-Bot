import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';

export interface Me {
  id: string;
  username: string;
  avatar: string | null;
  authorized: boolean;
}

export function useMe() {
  return useQuery<Me>({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false });
}

export function avatarUrl(me: { id: string; avatar: string | null } | undefined | null): string | null {
  if (!me || !me.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`;
}
