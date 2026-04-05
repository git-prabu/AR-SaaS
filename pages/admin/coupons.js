import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../lib/db';
import toast from 'react-hot-toast';

const S = {
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(42,31,16,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', padding: '10px 13px', background: '#F7F5F2', border: '1.5px solid rgba(42,31,16,0.09)', borderRadius: 11, fontSize: 13, color: '#1E1B18', fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' },
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
      <div style={{ padding: '28px 32px', maxWidth: 960, paddingBottom: 60, fontFamily: 'Inter,sans-serif' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18' }}>Coupons</div>
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 }}>Create discount codes for your customers</div>
          </div>
          <button onClick={openAdd}
            style={{ padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#F79B3D', color: '#fff', fontWeight: 700, fontSize: 13 }}>
            + New Coupon
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(42,31,16,0.4)' }}>Loading…</div>
        ) : coupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(42,31,16,0.03)', borderRadius: 16, border: '1px dashed rgba(42,31,16,0.12)' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🏷</div>
            <div style={{ fontWeight: 700, color: 'rgba(42,31,16,0.5)' }}>No coupons yet</div>
            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.35)', marginTop: 4 }}>Create coupon codes to offer discounts to your customers.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coupons.map(c => {
              const isExpired = c.validUntil && new Date(c.validUntil) < new Date();
              const isExhausted = c.maxUses && c.usedCount >= c.maxUses;
              const statusColor = !c.isActive ? 'rgba(42,31,16,0.4)' : isExpired || isExhausted ? '#C04A28' : '#2D8B4E';
              const statusLabel = !c.isActive ? 'Inactive' : isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Active';
              return (
                <div key={c.id} style={{ background: '#fff', border: '1px solid rgba(42,31,16,0.08)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(42,31,16,0.04)', opacity: !c.isActive ? 0.65 : 1 }}>
                  {/* Code badge */}
                  <div style={{ background: '#1E1B18', color: '#F79B3D', fontFamily: 'monospace', fontWeight: 800, fontSize: 15, padding: '8px 16px', borderRadius: 10, flexShrink: 0, letterSpacing: '0.08em' }}>
                    {c.code}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1E1B18' }}>
                        {c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`}
                      </div>
                      <div style={{ padding: '2px 9px', borderRadius: 20, background: statusColor + '15', color: statusColor, fontSize: 11, fontWeight: 700 }}>
                        {statusLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(42,31,16,0.45)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>Used: {c.usedCount || 0}{c.maxUses ? ` / ${c.maxUses}` : ''}</span>
                      {c.validUntil && <span>Expires: {new Date(c.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                      <span>Created: {formatDate(c.createdAt?.seconds)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                    {/* Active toggle */}
                    <div onClick={() => handleToggle(c)} style={{ width: 36, height: 20, borderRadius: 99, background: c.isActive ? '#8FC4A8' : 'rgba(42,31,16,0.15)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: c.isActive ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                    </div>
                    <button onClick={() => openEdit(c)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(42,31,16,0.12)', background: 'transparent', color: '#1E1B18', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id} style={{ padding: '7px 10px', borderRadius: 9, border: 'none', background: 'rgba(224,90,58,0.08)', color: '#E05A3A', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
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
          <div style={{ background: '#fff', borderRadius: 20, padding: '28px 26px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 18, color: '#1E1B18', marginBottom: 22 }}>
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
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'rgba(42,31,16,0.4)', fontWeight: 600 }}>{form.type === 'percent' ? '%' : '₹'}</span>
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
              <button onClick={() => setModal(null)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(42,31,16,0.15)', background: '#fff', color: '#1E1B18', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#F79B3D', color: '#fff', fontWeight: 700, fontSize: 14, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : modal === 'add' ? 'Create Coupon' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
