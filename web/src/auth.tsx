import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';

export interface Me {
  id: string;
  username: string;
  avatar: string | null;
  authorized: boolean;
}

export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    retry: false,
  });
}
