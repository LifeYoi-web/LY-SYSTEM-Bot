import { useEffect, useState } from 'react';
import { useReport, useUpdateReport } from '../lib/community';
import { Icon } from '../lib/icons';
import { SkeletonRows, toast } from '../components/ui';
import { Select, useChannelOptions } from '../components/pickers';

export function Report() {
  const { data, isLoading } = useReport();
  const save = useUpdateReport();
  const channels = useChannelOptions(['text']);
  const [channelId, setChannelId] = useState<string | null>(null);
  useEffect(() => { if (data) setChannelId(data.channelId); }, [data]);
  if (isLoading) return <SkeletonRows rows={3} />;

  return (
    <div className="stack" style={{ maxWidth: 600 }}>
      <p className="page-intro" style={{ margin: 0 }}>يستخدم الأعضاء أمر <code>/report</code> للإبلاغ عن مخالفة، وتصلك في القناة المحددة.</p>
      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="shield-alert" /> قناة البلاغات</div></div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>القناة التي تصل إليها البلاغات</label>
          <Select value={channelId} onChange={setChannelId} options={channels} placeholder="بدون (النظام متوقف)" />
        </div>
      </div>
      <div className="row"><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ channelId }, { onSuccess: () => toast('تم الحفظ'), onError: () => toast('فشل الحفظ', 'err') })}><Icon name="check" /> حفظ</button></div>
    </div>
  );
}
