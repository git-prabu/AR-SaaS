// pages/admin/promotions.js
//
// Single Promotions page covering Offers + Coupons + Combos with full inline
// CRUD. Replaces the 3 standalone /admin/{offers,coupons,combos} pages —
// those now redirect here (see pages/admin/offers.js, coupons.js, combos.js).
//
// Drawer-based create/edit: clicking "+ New" or "Edit" slides a form drawer
// in from the right. The same drawer component switches its body based on the
// active entity (offer/coupon/combo). State for each entity's form lives in
// `form` keyed by `drawerEntity`, so swapping tabs while the drawer is open
// would discard in-flight edits — closeDrawer() is always called when
// switching tabs to avoid that surprise.
//
// Validation + payload shape mirrors what offers.js / coupons.js / combos.js
// shipped before; field-by-field changes were preserved exactly so existing
// Firestore documents continue to render correctly.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHead from '../../components/PageHead';
import {
  getAllOffers,  createOffer,  updateOffer,  deleteOffer,
  getCoupons,    createCoupon, updateCoupon, deleteCoupon,
  getCombos,     createCombo,  updateCombo,  deleteCombo,
  getAllMenuItems, todayKey,
} from '../../lib/db';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as admin pages ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

// Empty form shapes — match payload schema for each entity exactly.
const EMPTY_OFFER  = { title: '', description: '', startDate: '', endDate: '', linkedItemId: '', discountedPrice: '' };
const EMPTY_COUPON = { code: '', type: 'percent', value: '', maxUses: '', validUntil: '', isActive: true };
const EMPTY_COMBO  = { name: '', description: '', comboPrice: '', itemIds: [], tag: '', isActive: true };

const TABS = [
  { k: 'offers',  label: 'Offers',  singular: 'offer'  },
  { k: 'coupons', label: 'Coupons', singular: 'coupon' },
  { k: 'combos',  label: 'Combos',  singular: 'combo'  },
];

// Status helpers — compute display state from the Firestore doc.
function offerStatus(o) {
  const t = todayKey();
  if (o.endDate && o.endDate < t) return 'expired';
  if (o.startDate && o.startDate > t) return 'scheduled';
  return 'active';
}
function couponStatus(c) {
  const t = todayKey();
  if (c.isActive === false) return 'inactive';
  if (c.validUntil && c.validUntil < t) return 'expired';
  if (c.maxUses && c.usedCount >= c.maxUses) return 'exhausted';
  return 'active';
}
function comboStatus(c) { return c.isActive === false ? 'inactive' : 'active'; }

const inputStyle = {
  width: '100%', padding: '10px 12px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.10)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export default function AdminPromotions() {
  const router = useRouter();
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [tab, setTab] = useState('offers');
  const [offers, setOffers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [combos, setCombos] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  // ─── Drawer state ───
  // drawerEntity: 'offer' | 'coupon' | 'combo' | null (null = closed)
  // drawerEditingId: null = creating, string = editing existing doc
  const [drawerEntity, setDrawerEntity] = useState(null);
  const [drawerEditingId, setDrawerEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  // Offers: linked-item picker state
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  // Combos: item multi-select state
  const [comboItemSearch, setComboItemSearch] = useState('');

  // Honour ?tab=xxx query from nav deep-links + redirects from old pages.
  useEffect(() => {
    const q = router.query?.tab;
    if (q && TABS.find(t => t.k === q)) setTab(q);
  }, [router.query?.tab]);

  // Escape key closes the drawer.
  useEffect(() => {
    if (!drawerEntity) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerEntity]);

  const load = async () => {
    if (!rid) return;
    setLoading(true);
    try {
      const [o, c, cb, m] = await Promise.all([
        getAllOffers(rid),
        getCoupons(rid),
        getCombos(rid),
        getAllMenuItems(rid),
      ]);
      setOffers(o || []);
      setCoupons(c || []);
      setCombos(cb || []);
      setMenuItems(m || []);
    } catch (e) { console.error('promotions load failed', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [rid]);

  // Counts of currently-active rows per tab — drives the gold badge on each tab.
  const counts = useMemo(() => ({
    offers:  offers.filter(o  => offerStatus(o)  === 'active').length,
    coupons: coupons.filter(c => couponStatus(c) === 'active').length,
    combos:  combos.filter(c  => comboStatus(c)  === 'active').length,
  }), [offers, coupons, combos]);

  // ─── Drawer open/close ───
  const openCreate = (entity) => {
    setDrawerEntity(entity);
    setDrawerEditingId(null);
    if (entity === 'offer')  setForm({ ...EMPTY_OFFER });
    if (entity === 'coupon') setForm({ ...EMPTY_COUPON });
    if (entity === 'combo')  setForm({ ...EMPTY_COMBO });
    setItemPickerOpen(false); setItemSearch(''); setComboItemSearch('');
  };
  const openEdit = (entity, doc) => {
    setDrawerEntity(entity);
    setDrawerEditingId(doc.id);
    if (entity === 'offer') {
      setForm({
        title:           doc.title || '',
        description:     doc.description || '',
        startDate:       doc.startDate || '',
        endDate:         doc.endDate || '',
        linkedItemId:    doc.linkedItemId || '',
        discountedPrice: doc.discountedPrice ?? '',
      });
    }
    if (entity === 'coupon') {
      setForm({
        code:       doc.code || '',
        type:       doc.type || 'percent',
        value:      doc.value ?? '',
        maxUses:    doc.maxUses ?? '',
        validUntil: doc.validUntil || '',
        isActive:   doc.isActive !== false,
      });
    }
    if (entity === 'combo') {
      setForm({
        name:        doc.name || '',
        description: doc.description || '',
        comboPrice:  doc.comboPrice ?? '',
        itemIds:     doc.itemIds || [],
        tag:         doc.tag || '',
        isActive:    doc.isActive !== false,
      });
    }
    setItemPickerOpen(false); setItemSearch(''); setComboItemSearch('');
  };
  const closeDrawer = () => {
    setDrawerEntity(null);
    setDrawerEditingId(null);
    setForm({});
    setItemPickerOpen(false); setItemSearch(''); setComboItemSearch('');
  };

  // Switching tabs while drawer is open — close it so user doesn't lose
  // context (e.g., editing an offer then clicking the Coupons tab).
  const switchTab = (newTab) => {
    if (drawerEntity) closeDrawer();
    setTab(newTab);
    router.replace({ pathname: '/admin/promotions', query: { tab: newTab } }, undefined, { shallow: true });
  };

  // ─── Save dispatcher — calls the entity-specific Firestore mutation ───
  const handleSave = async () => {
    if (!drawerEntity) return;

    if (drawerEntity === 'offer') {
      if (!form.title?.trim()) return toast.error('Title is required');
      if (!form.endDate) return toast.error('End date is required');
      if (form.startDate && form.endDate < form.startDate) return toast.error('End date must be after start date');
      if (form.discountedPrice !== '' && Number(form.discountedPrice) <= 0) return toast.error('Offer price must be greater than 0');
      const linked = form.linkedItemId ? menuItems.find(m => m.id === form.linkedItemId) : null;
      const payload = {
        ...form,
        discountedPrice: form.discountedPrice !== '' ? Number(form.discountedPrice) : null,
        linkedItemId:    form.linkedItemId || null,
        linkedItemName:  linked?.name      || null,
        linkedItemImage: linked?.imageURL  || null,
        linkedItemPrice: linked?.price     || null,
      };
      setSaving(true);
      try {
        if (drawerEditingId) { await updateOffer(rid, drawerEditingId, payload); toast.success('Offer updated'); }
        else                 { await createOffer(rid, payload);                   toast.success('Offer created'); }
        closeDrawer();
        await load();
      } catch (e) { toast.error('Save failed: ' + e.message); }
      finally { setSaving(false); }
      return;
    }

    if (drawerEntity === 'coupon') {
      if (!form.code?.trim()) return toast.error('Coupon code is required');
      if (!form.value || isNaN(parseFloat(form.value))) return toast.error('Enter a valid discount value');
      if (form.type === 'percent' && parseFloat(form.value) > 100) return toast.error('Percentage discount cannot exceed 100%');
      if (parseFloat(form.value) <= 0) return toast.error('Discount value must be greater than 0');
      const codeUpper = form.code.toUpperCase().trim();
      if (coupons.find(c => c.code === codeUpper && c.id !== drawerEditingId)) return toast.error('A coupon with this code already exists');
      const payload = {
        code: codeUpper,
        type: form.type,
        value: parseFloat(form.value),
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        validUntil: form.validUntil || null,
        isActive: form.isActive,
      };
      setSaving(true);
      try {
        if (drawerEditingId) { await updateCoupon(rid, drawerEditingId, payload); toast.success('Coupon updated'); }
        else                 { await createCoupon(rid, payload);                   toast.success('Coupon created'); }
        closeDrawer();
        await load();
      } catch (e) { toast.error('Save failed: ' + e.message); }
      finally { setSaving(false); }
      return;
    }

    if (drawerEntity === 'combo') {
      if (!form.name?.trim()) return toast.error('Combo name is required');
      if ((form.itemIds || []).length < 2) return toast.error('Select at least 2 items for the combo');
      if (!form.comboPrice || isNaN(form.comboPrice) || Number(form.comboPrice) <= 0) return toast.error('Enter a valid combo price');
      const selectedItems = form.itemIds.map(id => menuItems.find(m => m.id === id)).filter(Boolean);
      const originalTotal = selectedItems.reduce((s, it) => s + (Number(it.price) || 0), 0);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        comboPrice: Number(form.comboPrice),
        itemIds: form.itemIds,
        tag: form.tag.trim(),
        isActive: form.isActive,
        originalPrice: originalTotal,
        savings: Math.max(0, originalTotal - Number(form.comboPrice)),
      };
      setSaving(true);
      try {
        if (drawerEditingId) { await updateCombo(rid, drawerEditingId, payload); toast.success('Combo updated'); }
        else                 { await createCombo(rid, payload);                   toast.success('Combo created'); }
        closeDrawer();
        await load();
      } catch (e) { toast.error('Save failed: ' + e.message); }
      finally { setSaving(false); }
      return;
    }
  };

  // ─── Toggle handlers (coupons + combos) ───
  const toggleCoupon = async (c) => {
    setActing('coupon:' + c.id);
    try {
      await updateCoupon(rid, c.id, { isActive: !c.isActive });
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
    } catch { toast.error('Could not update'); }
    setActing(null);
  };
  const toggleCombo = async (c) => {
    setActing('combo:' + c.id);
    try {
      await updateCombo(rid, c.id, { isActive: !c.isActive });
      setCombos(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
    } catch { toast.error('Could not update'); }
    setActing(null);
  };

  // ─── Delete handlers ───
  const delOffer = async (o) => {
    if (!confirm(`Delete offer "${o.title}"?`)) return;
    setActing('offer:' + o.id);
    try { await deleteOffer(rid, o.id); setOffers(prev => prev.filter(x => x.id !== o.id)); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
    setActing(null);
  };
  const delCoupon = async (c) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    setActing('coupon:' + c.id);
    try { await deleteCoupon(rid, c.id); setCoupons(prev => prev.filter(x => x.id !== c.id)); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
    setActing(null);
  };
  const delCombo = async (c) => {
    if (!confirm(`Delete combo "${c.name}"?`)) return;
    setActing('combo:' + c.id);
    try { await deleteCombo(rid, c.id); setCombos(prev => prev.filter(x => x.id !== c.id)); toast.success('Deleted'); }
    catch { toast.error('Delete failed'); }
    setActing(null);
  };

  const activeTabMeta = TABS.find(t => t.k === tab);

  return (
    <AdminLayout>
      <PageHead title="Promotions" />
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .promo-tab:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .promo-row:hover { background: ${A.shellDarker}; }
          .promo-input:focus { border-color: ${A.warning} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.15); }
          .promo-input::placeholder { color: ${A.faintText}; }
          .promo-item-card:hover { background: ${A.subtleBg}; }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Catalog</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Promotions</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>
              Promotions
            </div>
            <div style={{ fontSize: 13, color: A.mutedText, marginTop: 6 }}>
              Offers, coupons, and combos in one place. Click <strong>Edit</strong> or <strong>+ New</strong> to open the inline editor.
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'inline-flex', background: A.shell, border: A.border, borderRadius: 10, padding: 3, marginBottom: 14, boxShadow: A.cardShadow }}>
            {TABS.map(t => {
              const active = tab === t.k;
              const count = counts[t.k];
              return (
                <button key={t.k} className={`promo-tab ${active ? 'active' : ''}`}
                  onClick={() => switchTab(t.k)}
                  style={{
                    padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontFamily: A.font, fontSize: 13, fontWeight: active ? 700 : 600,
                    background: active ? A.ink : 'transparent',
                    color: active ? A.cream : A.mutedText,
                    display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
                  }}>
                  {t.label}
                  {count > 0 && (
                    <span style={{
                      padding: '1px 7px', borderRadius: 10,
                      background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.18)',
                      color:      active ? A.cream                 : A.warningDim,
                      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '0 28px 60px' }}>
          {/* Action row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: A.mutedText }}>
              {loading ? 'Loading…' :
               tab === 'offers'  ? `${offers.length} offer${offers.length === 1 ? '' : 's'}` :
               tab === 'coupons' ? `${coupons.length} coupon${coupons.length === 1 ? '' : 's'}` :
                                    `${combos.length} combo${combos.length === 1 ? '' : 's'}`}
            </div>
            <button onClick={() => openCreate(activeTabMeta.singular)} style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: A.ink, color: A.cream,
              fontSize: 13, fontWeight: 600, fontFamily: A.font,
              cursor: 'pointer', letterSpacing: '-0.05px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}>
              + New {activeTabMeta.singular}
            </button>
          </div>

          {/* List */}
          <div style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 56, textAlign: 'center', color: A.mutedText, fontSize: 13 }}>Loading…</div>
            ) : tab === 'offers' ? (
              offers.length === 0 ? (
                <Empty message="No offers yet." ctaLabel="Create your first offer" onCta={() => openCreate('offer')} />
              ) : offers.map(o => (
                <Row key={o.id}
                  title={o.title || 'Untitled offer'}
                  subtitle={[
                    o.discountedPrice ? `₹${o.discountedPrice} price` : null,
                    o.startDate || o.endDate ? `${o.startDate || '—'} → ${o.endDate || '—'}` : null,
                    o.linkedItemId ? (menuItems.find(m => m.id === o.linkedItemId)?.name || 'Linked item') : null,
                  ].filter(Boolean).join(' · ')}
                  status={offerStatus(o)}
                  onEdit={() => openEdit('offer', o)}
                  onDelete={() => delOffer(o)}
                  busy={acting === 'offer:' + o.id}
                />
              ))
            ) : tab === 'coupons' ? (
              coupons.length === 0 ? (
                <Empty message="No coupons yet." ctaLabel="Create your first coupon" onCta={() => openCreate('coupon')} />
              ) : coupons.map(c => (
                <Row key={c.id}
                  titleMono={c.code}
                  subtitle={[
                    c.type === 'percent' ? `${c.value}% off` : `₹${c.value} off`,
                    c.maxUses ? `${c.usedCount || 0}/${c.maxUses} uses` : `${c.usedCount || 0} uses`,
                    c.validUntil ? `Valid until ${c.validUntil}` : null,
                  ].filter(Boolean).join(' · ')}
                  status={couponStatus(c)}
                  onToggle={() => toggleCoupon(c)}
                  toggledOn={c.isActive !== false}
                  onEdit={() => openEdit('coupon', c)}
                  onDelete={() => delCoupon(c)}
                  busy={acting === 'coupon:' + c.id}
                />
              ))
            ) : (
              combos.length === 0 ? (
                <Empty message="No combos yet." ctaLabel="Create your first combo" onCta={() => openCreate('combo')} />
              ) : combos.map(c => {
                const items = (c.itemIds || []).map(id => menuItems.find(m => m.id === id)?.name).filter(Boolean);
                return (
                  <Row key={c.id}
                    title={c.name || 'Untitled combo'}
                    subtitle={[
                      c.comboPrice ? `₹${c.comboPrice}` : null,
                      items.length > 0 ? `${items.length} items: ${items.slice(0, 2).join(', ')}${items.length > 2 ? '…' : ''}` : null,
                      c.tag ? c.tag : null,
                    ].filter(Boolean).join(' · ')}
                    status={comboStatus(c)}
                    onToggle={() => toggleCombo(c)}
                    toggledOn={c.isActive !== false}
                    onEdit={() => openEdit('combo', c)}
                    onDelete={() => delCombo(c)}
                    busy={acting === 'combo:' + c.id}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* ─── Drawer ─── */}
        {drawerEntity && (
          <>
            <div onClick={closeDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 90, animation: 'fadeIn 0.2s ease both',
            }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 480,
              background: A.shell, zIndex: 91,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              animation: 'slideInRight 0.28s ease both',
            }}>
              <DrawerHeader
                title={drawerEntity === 'offer' ? 'Offer' : drawerEntity === 'coupon' ? 'Coupon' : 'Combo'}
                editing={!!drawerEditingId}
                onClose={closeDrawer}
              />

              <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
                {drawerEntity === 'offer' && (
                  <OfferForm
                    form={form} setForm={setForm}
                    menuItems={menuItems}
                    itemSearch={itemSearch} setItemSearch={setItemSearch}
                    itemPickerOpen={itemPickerOpen} setItemPickerOpen={setItemPickerOpen}
                  />
                )}
                {drawerEntity === 'coupon' && (
                  <CouponForm form={form} setForm={setForm} />
                )}
                {drawerEntity === 'combo' && (
                  <ComboForm
                    form={form} setForm={setForm}
                    menuItems={menuItems}
                    comboItemSearch={comboItemSearch} setComboItemSearch={setComboItemSearch}
                  />
                )}
              </div>

              <DrawerFooter
                saving={saving}
                editing={!!drawerEditingId}
                onCancel={closeDrawer}
                onSave={handleSave}
                saveLabel={drawerEntity}
              />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

AdminPromotions.getLayout = (page) => page;

// ════════════════════════════════════════════════════════
// ─── Form sub-components ───
// ════════════════════════════════════════════════════════

function OfferForm({ form, setForm, menuItems, itemSearch, setItemSearch, itemPickerOpen, setItemPickerOpen }) {
  const today = todayKey();
  const linkedItem = form.linkedItemId ? menuItems.find(m => m.id === form.linkedItemId) : null;
  const pickerItems = itemSearch.trim()
    ? menuItems.filter(m => (m.name || '').toLowerCase().includes(itemSearch.toLowerCase()))
    : menuItems;

  return (
    <>
      {/* Live preview — only when title is entered, mirrors the look of the
          customer-facing promo card so the admin can see what they're shipping. */}
      {form.title && (
        <div style={{ marginBottom: 20 }}>
          <Label>Live preview</Label>
          <div style={{
            background: A.ink, borderRadius: 12, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${A.warning}, transparent)` }} />
            {linkedItem?.imageURL && (
              <img src={linkedItem.imageURL} alt={linkedItem.name}
                style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(196,168,109,0.3)' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: A.cream }}>{form.title}</div>
              {form.description && (
                <div style={{ fontSize: 12, color: A.forestTextMuted, marginTop: 2 }}>{form.description}</div>
              )}
              {linkedItem && (
                <div style={{ fontSize: 11, color: A.forestTextMuted, marginTop: 3 }}>
                  {linkedItem.name}
                  {linkedItem.price != null && <span style={{ textDecoration: 'line-through', marginLeft: 6 }}>₹{linkedItem.price}</span>}
                  {form.discountedPrice && <span style={{ color: A.warning, fontWeight: 700, marginLeft: 6 }}>→ ₹{form.discountedPrice}</span>}
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, color: A.forestTextFaint, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Preview</span>
          </div>
        </div>
      )}

      <Field label="Title" required>
        <input className="promo-input"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Weekend Special — 20% off"
          style={inputStyle} />
      </Field>

      <Field label="Description">
        <input className="promo-input"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Tap to see the dish"
          style={inputStyle} />
      </Field>

      <Field label="Link to a dish" hint="(optional — makes card clickable)">
        {linkedItem ? (
          <div style={{
            padding: '10px 12px', borderRadius: 10, border: A.borderStrong,
            background: A.shellDarker,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {linkedItem.imageURL && (
              <img src={linkedItem.imageURL} alt={linkedItem.name}
                style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {linkedItem.name}
              </div>
              <div style={{ fontSize: 11, color: A.faintText }}>
                {linkedItem.category || '—'}{linkedItem.price ? ` · ₹${linkedItem.price}` : ''}
              </div>
            </div>
            <button type="button" onClick={() => setForm(f => ({ ...f, linkedItemId: '', discountedPrice: '' }))}
              style={{
                padding: '5px 10px', borderRadius: 6, border: 'none',
                background: A.subtleBg, color: A.mutedText,
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: INTER,
              }}>Remove</button>
          </div>
        ) : (
          <>
            <input className="promo-input"
              value={itemSearch}
              onChange={e => { setItemSearch(e.target.value); setItemPickerOpen(true); }}
              onFocus={() => setItemPickerOpen(true)}
              placeholder="Search and pick a dish…"
              style={inputStyle} />
            {itemPickerOpen && itemSearch && (
              <div style={{
                marginTop: 4, border: A.borderStrong, borderRadius: 10,
                background: A.shell, maxHeight: 220, overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              }}>
                {pickerItems.length === 0 ? (
                  <div style={{ padding: 14, fontSize: 12, color: A.faintText, textAlign: 'center' }}>No items found</div>
                ) : (
                  pickerItems.slice(0, 50).map(item => (
                    <div key={item.id} className="promo-item-card"
                      onClick={() => { setForm(f => ({ ...f, linkedItemId: item.id })); setItemPickerOpen(false); setItemSearch(''); }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: A.border,
                      }}>
                      {item.imageURL && <img src={item.imageURL} alt="" style={{ width: 30, height: 30, borderRadius: 5, objectFit: 'cover' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: A.ink }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: A.faintText }}>{item.category || '—'}{item.price ? ` · ₹${item.price}` : ''}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {linkedItem && (
          <div style={{ marginTop: 10 }}>
            <Label>Offer price <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(shown as discounted price)</span></Label>
            <div style={{ position: 'relative' }}>
              <input className="promo-input"
                type="number" min="0"
                value={form.discountedPrice}
                onChange={e => setForm(f => ({ ...f, discountedPrice: e.target.value }))}
                placeholder={linkedItem.price ? `less than ${linkedItem.price}` : 'Enter offer price'}
                style={{ ...inputStyle, paddingLeft: 32 }} />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: A.mutedText, fontWeight: 600, pointerEvents: 'none' }}>₹</span>
            </div>
          </div>
        )}
      </Field>

      {/* Date range */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <Field label="Start date" inline>
          <input className="promo-input" type="date"
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            style={inputStyle} />
        </Field>
        <Field label="End date" required inline>
          <input className="promo-input" type="date"
            value={form.endDate}
            min={form.startDate || today}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function CouponForm({ form, setForm }) {
  return (
    <>
      <Field label="Coupon code" required hint="(uppercase letters/numbers, no spaces)">
        <input className="promo-input"
          value={form.code}
          onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
          placeholder="WELCOME20"
          style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <Field label="Discount type" required inline>
          <select className="promo-input"
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            style={inputStyle}>
            <option value="percent">Percent (%)</option>
            <option value="fixed">Fixed (₹)</option>
          </select>
        </Field>
        <Field label={form.type === 'percent' ? 'Percent off' : 'Amount off'} required inline>
          <div style={{ position: 'relative' }}>
            <input className="promo-input"
              type="number" min="0" step="any"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder={form.type === 'percent' ? '20' : '100'}
              style={{ ...inputStyle, paddingRight: 32 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: A.mutedText, fontWeight: 600, pointerEvents: 'none' }}>
              {form.type === 'percent' ? '%' : '₹'}
            </span>
          </div>
        </Field>
      </div>

      <Field label="Max uses" hint="(blank = unlimited)">
        <input className="promo-input"
          type="number" min="0"
          value={form.maxUses}
          onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
          placeholder="Unlimited"
          style={inputStyle} />
      </Field>

      <Field label="Valid until" hint="(blank = no expiry)">
        <input className="promo-input" type="date"
          value={form.validUntil}
          onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
          style={inputStyle} />
      </Field>

      <Field label="Active">
        <Toggle
          on={form.isActive}
          onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
        />
      </Field>
    </>
  );
}

function ComboForm({ form, setForm, menuItems, comboItemSearch, setComboItemSearch }) {
  const selectedItems = (form.itemIds || []).map(id => menuItems.find(m => m.id === id)).filter(Boolean);
  const pickerItems = comboItemSearch.trim()
    ? menuItems.filter(m => (m.name || '').toLowerCase().includes(comboItemSearch.toLowerCase()))
    : menuItems;
  const originalTotal = selectedItems.reduce((s, it) => s + (Number(it.price) || 0), 0);
  const savings = Math.max(0, originalTotal - (Number(form.comboPrice) || 0));

  const toggleItem = (id) => setForm(f => ({
    ...f,
    itemIds: f.itemIds.includes(id) ? f.itemIds.filter(x => x !== id) : [...f.itemIds, id],
  }));

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <Field label="Combo name" required inline>
          <input className="promo-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Family Pack"
            style={inputStyle} />
        </Field>
        <Field label="Tag" hint="(optional badge)" inline>
          <input className="promo-input"
            value={form.tag}
            onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
            placeholder="Best Value"
            style={inputStyle} />
        </Field>
      </div>

      <Field label="Description">
        <input className="promo-input"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Two mains + a starter"
          style={inputStyle} />
      </Field>

      <Field label="Items in combo" required hint={`(${selectedItems.length} selected — pick at least 2)`}>
        {/* Selected chips */}
        {selectedItems.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {selectedItems.map(it => (
              <span key={it.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 14,
                background: 'rgba(196,168,109,0.12)',
                color: A.warningDim,
                fontSize: 12, fontWeight: 600, fontFamily: A.font,
                border: '1px solid rgba(196,168,109,0.30)',
              }}>
                {it.name}
                {it.price != null && <span style={{ color: A.faintText, fontWeight: 500 }}>₹{it.price}</span>}
                <button type="button" onClick={() => toggleItem(it.id)} style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: A.warningDim, fontSize: 13, padding: 0, marginLeft: 2, lineHeight: 1,
                }}>×</button>
              </span>
            ))}
          </div>
        )}
        <input className="promo-input"
          value={comboItemSearch}
          onChange={e => setComboItemSearch(e.target.value)}
          placeholder="Search items to add…"
          style={inputStyle} />
        <div style={{
          marginTop: 4, border: A.borderStrong, borderRadius: 10,
          background: A.shell, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}>
          {pickerItems.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, color: A.faintText, textAlign: 'center' }}>No items found</div>
          ) : (
            pickerItems.slice(0, 50).map(item => {
              const sel = (form.itemIds || []).includes(item.id);
              return (
                <div key={item.id} className="promo-item-card"
                  onClick={() => toggleItem(item.id)}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    borderBottom: A.border,
                    background: sel ? 'rgba(196,168,109,0.08)' : 'transparent',
                  }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 4,
                    border: sel ? `1.5px solid ${A.warning}` : `1.5px solid rgba(0,0,0,0.20)`,
                    background: sel ? A.warning : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: A.shell, fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>{sel ? '✓' : ''}</div>
                  {item.imageURL && <img src={item.imageURL} alt="" style={{ width: 30, height: 30, borderRadius: 5, objectFit: 'cover' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.ink }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: A.faintText }}>{item.category || '—'}{item.price ? ` · ₹${item.price}` : ''}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Field>

      <Field label="Combo price" required hint={originalTotal > 0 ? `(individual total: ₹${originalTotal})` : ''}>
        <div style={{ position: 'relative' }}>
          <input className="promo-input"
            type="number" min="0"
            value={form.comboPrice}
            onChange={e => setForm(f => ({ ...f, comboPrice: e.target.value }))}
            placeholder={originalTotal > 0 ? `less than ${originalTotal}` : 'Combo price'}
            style={{ ...inputStyle, paddingLeft: 32 }} />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: A.mutedText, fontWeight: 600, pointerEvents: 'none' }}>₹</span>
        </div>
        {savings > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: A.success, fontWeight: 600 }}>
            Customer saves ₹{savings}
          </div>
        )}
      </Field>

      <Field label="Active">
        <Toggle
          on={form.isActive}
          onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
        />
      </Field>
    </>
  );
}

// ════════════════════════════════════════════════════════
// ─── Shared sub-components ───
// ════════════════════════════════════════════════════════

// Field wrapper — label + optional hint + child input
function Field({ label, required, hint, children, inline }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 18 }}>
      <Label>{label} {required && <Required />}{hint && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}> {hint}</span>}</Label>
      {children}
    </div>
  );
}
function Label({ children }) {
  return <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: A.mutedText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: INTER }}>{children}</label>;
}
function Required() { return <span style={{ color: A.danger, fontWeight: 700 }}>*</span>; }
function Toggle({ on, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-block', cursor: 'pointer',
      width: 44, height: 24, borderRadius: 99,
      background: on ? A.success : 'rgba(0,0,0,0.18)',
      position: 'relative', transition: 'background 0.2s',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: A.shell,
        position: 'absolute', top: 3, left: on ? 23 : 3,
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

function DrawerHeader({ title, editing, onClose }) {
  return (
    <div style={{
      padding: '16px 22px', borderBottom: A.border,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: A.shellDarker, flexShrink: 0,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: A.warningDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
          {editing ? 'Edit' : 'New'}
        </div>
        <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 18, color: A.ink, letterSpacing: '-0.2px' }}>{title}</div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" style={{
        width: 36, height: 36, borderRadius: 8,
        border: A.border, background: A.shell,
        cursor: 'pointer', fontSize: 16, color: A.mutedText, fontFamily: INTER,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  );
}

function DrawerFooter({ saving, editing, onCancel, onSave, saveLabel }) {
  return (
    <div style={{
      padding: '14px 22px', borderTop: A.border,
      display: 'flex', justifyContent: 'flex-end', gap: 10,
      background: A.shellDarker, flexShrink: 0,
    }}>
      <button type="button" onClick={onCancel} disabled={saving} style={{
        padding: '10px 18px', borderRadius: 9,
        border: A.borderStrong, background: 'transparent',
        fontFamily: INTER, fontSize: 13, fontWeight: 600, color: A.mutedText,
        cursor: saving ? 'not-allowed' : 'pointer',
      }}>Cancel</button>
      <button type="button" onClick={onSave} disabled={saving} style={{
        padding: '10px 22px', borderRadius: 9, border: 'none',
        background: A.ink, color: A.cream,
        fontFamily: INTER, fontSize: 13, fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer',
        opacity: saving ? 0.6 : 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        {saving
          ? <><span style={{ width: 13, height: 13, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Saving…</>
          : (editing ? `Update ${saveLabel}` : `Create ${saveLabel}`)}
      </button>
    </div>
  );
}

// List row — same shape across all 3 entities so the list area looks uniform.
function Row({ title, titleMono, subtitle, status, onToggle, toggledOn, onEdit, onDelete, busy }) {
  const statusColors = {
    active:    { bg: 'rgba(63,158,90,0.10)',  color: A.success,    label: 'Active' },
    scheduled: { bg: 'rgba(196,168,109,0.12)', color: A.warningDim, label: 'Scheduled' },
    expired:   { bg: A.subtleBg,                color: A.faintText,  label: 'Expired' },
    exhausted: { bg: A.subtleBg,                color: A.faintText,  label: 'Exhausted' },
    inactive:  { bg: 'rgba(0,0,0,0.06)',        color: A.mutedText,  label: 'Inactive' },
  };
  const s = statusColors[status] || statusColors.inactive;
  return (
    <div className="promo-row" style={{
      padding: '14px 22px', borderTop: A.border,
      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center',
      transition: 'background 0.12s',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titleMono ? (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}>{titleMono}</span>
          ) : title}
        </div>
        <div style={{ fontSize: 12, color: A.mutedText, marginTop: 3 }}>
          {subtitle || '—'}
        </div>
      </div>
      <span style={{
        padding: '3px 10px', borderRadius: 4,
        background: s.bg, color: s.color,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>{s.label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {typeof onToggle === 'function' && (
          <button onClick={onToggle} disabled={busy}
            title={toggledOn ? 'Disable' : 'Enable'}
            style={{
              padding: '6px 12px', borderRadius: 7,
              border: A.border, background: A.shell,
              fontSize: 11, fontWeight: 600, fontFamily: A.font,
              color: toggledOn ? A.success : A.mutedText,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
            }}>
            {toggledOn ? 'On' : 'Off'}
          </button>
        )}
        <button onClick={onEdit}
          style={{
            padding: '6px 12px', borderRadius: 7,
            border: A.border, background: A.shell,
            fontSize: 11, fontWeight: 600, fontFamily: A.font, color: A.ink,
            cursor: 'pointer',
          }}>
          Edit
        </button>
        <button onClick={onDelete} disabled={busy}
          aria-label="Delete"
          style={{
            padding: '6px 10px', borderRadius: 7,
            border: '1px solid rgba(217,83,79,0.18)',
            background: 'rgba(217,83,79,0.05)',
            color: A.danger, fontSize: 11, fontWeight: 600, fontFamily: A.font,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
          }}>
          ×
        </button>
      </div>
    </div>
  );
}

function Empty({ message, ctaLabel, onCta }) {
  return (
    <div style={{ padding: '56px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: A.ink, marginBottom: 8 }}>{message}</div>
      <div style={{ fontSize: 13, color: A.mutedText, marginBottom: 16 }}>Start promoting — pick the "+ New" button above.</div>
      <button onClick={onCta} style={{
        padding: '10px 20px', borderRadius: 10, border: 'none',
        background: A.ink, color: A.cream,
        fontSize: 13, fontWeight: 600, fontFamily: A.font, cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>{ctaLabel}</button>
    </div>
  );
}
