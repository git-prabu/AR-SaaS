import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../lib/db';
import toast from 'react-hot-toast';
import { T, ADMIN_STYLES } from '../../lib/utils';

const S = {
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: T.stone, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, fontFamily: T.font },
  input: { width: '100%', padding: '10px 13px', background: T.cream, border: `1.5px solid ${T.sand}`, borderRadius: 11, fontSize: 13, color: T.ink, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' },
};

const empty = { code: '', type: 'percent', value: '', maxUses: '', validUntil: '' };

function formatDate(seconds) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminCoupons() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | couponObj
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    if (!rid) return;
    getCoupons(rid).then(c => { setCoupons(c); setLoading(false); });
  };

  useEffect(() => { load(); }, [rid]);

  const openAdd = () => { setForm({ ...empty }); setModal('add'); };
  const openEdit = (c) => {
    setForm({ code: c.code, type: c.type, value: String(c.value), maxUses: c.maxUses ? String(c.maxUses) : '', validUntil: c.validUntil || '' });
    setModal(c);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('Coupon code is required'); return; }
    if (!form.value || isNaN(parseFloat(form.value))) { toast.error('Enter a valid discount value'); return; }
    if (form.type === 'percent' && parseFloat(form.value) > 100) { toast.error('Percentage discount cannot exceed 100%'); return; }
    const codeUpper = form.code.toUpperCase().trim();
    const duplicate = coupons.find(c => c.code === codeUpper && (modal === 'add' || c.id !== modal.id));
    if (duplicate) { toast.error('A coupon with this code already exists'); return; }
    setSaving(true);
    try {
      const data = {
        code: form.code.toUpperCase().trim(),
        type: form.type,
        value: parseFloat(form.value),
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        validUntil: form.validUntil || null,
      };
      if (modal === 'add') {
        await createCoupon(rid, data);
        toast.success('Coupon created!');
      } else {
        await updateCoupon(rid, modal.id, data);
        toast.success('Coupon updated!');
      }
      setModal(null);
      await load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this coupon?')) return;
    setDeleting(id);
    try { await deleteCoupon(rid, id); toast.success('Deleted'); await load(); } catch { toast.error('Delete failed'); }
    setDeleting(null);
  };

  const handleToggle = async (c) => {
    try {
      await updateCoupon(rid, c.id, { isActive: !c.isActive });
      toast.success(c.isActive ? 'Coupon deactivated' : 'Coupon activated');
      await load();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <AdminLayout>
      <Head><title>Coupons | Advert Radical</title></Head>
      <div style={{ padding: '28px 32px', maxWidth: 960, paddingBottom: 60, fontFamily: T.font }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 22, color: T.ink }}>Coupons</div>
            <div style={{ fontSize: 13, color: T.stone, marginTop: 4, fontFamily: T.font }}>Create discount codes for your customers</div>
          </div>
          <button onClick={openAdd}
            style={{ padding: '10px 22px', borderRadius: T.radiusBtn, border: 'none', cursor: 'pointer', background: T.accent, color: T.shellText, fontWeight: 700, fontSize: 13, fontFamily: T.font }}>
            + New Coupon
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.stone, fontFamily: T.font }}>Loading…</div>
        ) : coupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: T.accentSubtle, borderRadius: 16, border: `1px dashed ${T.sand}` }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🏷</div>
            <div style={{ fontWeight: 700, color: T.stone, fontFamily: T.font }}>No coupons yet</div>
            <div style={{ fontSize: 13, color: T.stone, marginTop: 4, fontFamily: T.font, opacity: 0.7 }}>Create coupon codes to offer discounts to your customers.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coupons.map(c => {
              const isExpired = c.validUntil && new Date(c.validUntil) < new Date();
              const isExhausted = c.maxUses && c.usedCount >= c.maxUses;
              const statusColor = !c.isActive ? T.stone : isExpired || isExhausted ? T.danger : T.success;
              const statusLabel = !c.isActive ? 'Inactive' : isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Active';
              return (
                <div key={c.id} style={{ background: T.white, border: `1px solid ${T.sand}`, borderRadius: T.radiusCard, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: T.shadowCard, opacity: !c.isActive ? 0.65 : 1 }}>
                  {/* Code badge */}
                  <div style={{ background: T.accent, color: '#C4A86D', fontFamily: 'monospace', fontWeight: 800, fontSize: 15, padding: '8px 16px', borderRadius: 10, flexShrink: 0, letterSpacing: '0.08em' }}>
                    {c.code}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink, fontFamily: T.font }}>
                        {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                      </div>
                      <div style={{ padding: '2px 9px', borderRadius: 20, background: statusColor + '15', color: statusColor, fontSize: 11, fontWeight: 700, fontFamily: T.font }}>
                        {statusLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.stone, display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: T.font }}>
                      <span>Used: {c.usedCount || 0}{c.maxUses ? ` / ${c.maxUses}` : ''}</span>
                      {c.validUntil && <span>Expires: {new Date(c.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                      <span>Created: {formatDate(c.createdAt?.seconds)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {/* Active toggle */}
                    <div onClick={() => handleToggle(c)} style={{ width: 36, height: 20, borderRadius: 99, background: c.isActive ? T.success : 'rgba(38,52,49,0.15)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: c.isActive ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                    </div>
                    <button onClick={() => openEdit(c)} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${T.sand}`, background: 'transparent', color: T.ink, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: T.font }}>Edit</button>
                    <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id} style={{ padding: '7px 10px', borderRadius: 9, border: 'none', background: 'rgba(138,74,66,0.08)', color: T.danger, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: T.font }}>
                      {deleting === c.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ background: T.white, borderRadius: 20, padding: '28px 26px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 18, color: T.ink, marginBottom: 22 }}>
              {modal === 'add' ? 'Create Coupon' : 'Edit Coupon'}
            </div>

            {/* Code */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Coupon Code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                placeholder="e.g. HAPPY10" maxLength={20}
                style={{ ...S.input, fontFamily: 'monospace', fontWeight: 700, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase' }} />
            </div>

            {/* Type + Value */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Discount Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={S.input}>
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Value</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                    placeholder={form.type === 'percent' ? 'e.g. 10' : 'e.g. 50'} style={S.input} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: T.stone, fontWeight: 600, fontFamily: T.font }}>{form.type === 'percent' ? '%' : '₹'}</span>
                </div>
              </div>
            </div>

            {/* Max uses + expiry */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
              <div>
                <label style={S.label}>Max Uses <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                <input type="number" min="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                  placeholder="Unlimited" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Valid Until <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} style={S.input} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: '12px', borderRadius: T.radiusBtn, border: `1px solid ${T.sand}`, background: T.white, color: T.ink, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: T.radiusBtn, border: 'none', cursor: 'pointer', background: T.accent, color: T.shellText, fontWeight: 700, fontSize: 14, opacity: saving ? 0.6 : 1, fontFamily: T.font }}>
                {saving ? 'Saving…' : modal === 'add' ? 'Create Coupon' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
