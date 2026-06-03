import { useState } from 'react';
import { useShop, useSaveShopItem, useDeleteShopItem, type ShopItem } from '../lib/community';
import { Icon } from '../lib/icons';
import { Switch, SkeletonRows, EmptyState, toast, fmt, clampInt } from '../components/ui';
import { Select, useRoleOptions } from '../components/pickers';

interface ShopForm {
  roleId: string | null;
  label: string;
  price: number;
  stock: number;
  durationHours: string;
  requiredLevel: string;
}

const EMPTY: ShopForm = { roleId: null, label: '', price: 100, stock: -1, durationHours: '', requiredLevel: '' };

export function Shop() {
  const { data, isLoading } = useShop();
  const save = useSaveShopItem();
  const del = useDeleteShopItem();
  const roles = useRoleOptions();
  const [f, setF] = useState<ShopForm>(EMPTY);
  const setForm = <K extends keyof ShopForm>(k: K, v: ShopForm[K]) => setF({ ...f, [k]: v });
  const roleName = (id: string) => roles.find((r) => r.id === id)?.label ?? id;

  function add() {
    if (!f.roleId) return toast('اختر رتبة أولًا', 'err');
    save.mutate(
      {
        roleId: f.roleId,
        label: f.label || undefined,
        price: f.price,
        stock: f.stock,
        durationHours: f.durationHours === '' ? undefined : Number(f.durationHours),
        requiredLevel: f.requiredLevel === '' ? undefined : Number(f.requiredLevel),
      },
      { onSuccess: () => { toast('أُضيف'); setF(EMPTY); }, onError: () => toast('فشل', 'err') },
    );
  }

  function toggle(item: ShopItem, enabled: boolean) {
    save.mutate({ id: item.id, enabled }, { onError: () => toast('فشل', 'err') });
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <p className="page-intro" style={{ margin: 0 }}>متجر ينفق فيه الأعضاء عملة السيرفر لشراء رتب. يتطلب تفعيل نظام العملات.</p>

      <div className="card card-pad">
        <div className="card-hd"><div className="card-title"><Icon name="plus" /> رتبة جديدة</div></div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}><label>الرتبة</label><Select value={f.roleId} onChange={(v) => setForm('roleId', v)} options={roles} placeholder="اختر رتبة" /></div>
          <div className="field" style={{ flex: 1 }}><label>الاسم (اختياري)</label><input className="input" value={f.label} onChange={(e) => setForm('label', e.target.value)} placeholder="اسم معروض" /></div>
        </div>
        <div className="field-row">
          <div className="field"><label>السعر</label><input className="input tnum" type="number" min={0} value={f.price} onChange={(e) => setForm('price', clampInt(e.target.value, 0, 1000000000))} /></div>
          <div className="field"><label>المخزون</label><input className="input tnum" type="number" min={-1} value={f.stock} onChange={(e) => setForm('stock', clampInt(e.target.value, -1, 1000000))} /><div className="hint">-1 = غير محدود</div></div>
        </div>
        <div className="field-row">
          <div className="field"><label>المدة (ساعات، فارغ = دائم)</label><input className="input tnum" type="number" min={1} value={f.durationHours} onChange={(e) => setForm('durationHours', e.target.value)} placeholder="دائم" /></div>
          <div className="field"><label>المستوى المطلوب (اختياري)</label><input className="input tnum" type="number" min={1} value={f.requiredLevel} onChange={(e) => setForm('requiredLevel', e.target.value)} placeholder="بدون" /></div>
        </div>
        <button className="btn btn-primary" disabled={save.isPending} onClick={add}><Icon name="plus" /> إضافة</button>
      </div>

      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : !data || data.items.length === 0 ? (
        <div className="card"><EmptyState icon="crown" title="لا رتب في المتجر" sub="أضف رتبة ليشتريها الأعضاء." /></div>
      ) : (
        <div className="card">
          <div className="feed">
            {data.items.map((item) => (
              <div className="feed-item" key={item.id}>
                <div className="feed-ico"><Icon name="crown" /></div>
                <div className="feed-body">
                  <div className="ft">{item.label || roleName(item.roleId)}</div>
                  <div className="fs"><span className="ft mono">{item.roleId}</span></div>
                  <div className="chips" style={{ marginTop: 6 }}>
                    <span className="chip">{fmt(item.price)} عملة</span>
                    <span className="chip">{item.stock < 0 ? 'مخزون غير محدود' : `المخزون: ${fmt(item.stock)}`}</span>
                    {item.durationHours != null && <span className="chip">{fmt(item.durationHours)} ساعة</span>}
                    {item.requiredLevel != null && <span className="chip">مستوى {fmt(item.requiredLevel)}+</span>}
                  </div>
                </div>
                <div className="row">
                  <Switch checked={item.enabled} onChange={(v) => toggle(item, v)} />
                  <button className="btn btn-ghost" onClick={() => del.mutate(item.id)} aria-label="حذف"><Icon name="x" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
