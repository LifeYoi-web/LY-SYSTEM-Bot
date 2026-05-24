import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Overview {
  name: string;
  memberCount: number;
  channelCount: number;
}

export function Overview() {
  const { data, isLoading, error } = useQuery<Overview>({ queryKey: ['overview'], queryFn: () => api('/overview') });
  if (isLoading) return <p>جاري التحميل...</p>;
  if (error) return <p>تعذّر تحميل البيانات</p>;
  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h2 style={{ color: '#f57c00' }}>{data!.name}</h2>
      <p>الأعضاء: {data!.memberCount}</p>
      <p>القنوات: {data!.channelCount}</p>
    </div>
  );
}
