// pages/admin/promotions.js
//
// Single Promotions page covering Offers + Coupons + Combos with full inline
// CRUD. Replaces the 3 standalone /admin/{offers,coupons,combos} pages —
// those now redirect here (see pages/admin/offers.js, coupons.js, combos.js).
//
// Visual layout per tab matches the old standalone pages:
//   - matte-black "PROMOTIONS / DISCOUNT CODES / BUNDLE OFFERS" stats strip
//   - filter pills (All / Active / Scheduled / etc.) + search box
//   - rich card rows with image / status pill / linked-item / dates / actions
//
// Drawer-based create/edit: clicking "+ New" or "Edit" slides a form drawer
// in from the right. The same drawer component switches its body based on
// the active entity (offer/coupon/combo). Validation + payload shape mirrors
// the old pages exactly so existing Firestore documents render correctly.

import { useEffect, useMemo, useState } from 'react';
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
const MONO = "'JetBrains Mono', monospace";
const A = {
  font: INTER,
  mono: MONO,
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
  shadowCard: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const EMPTY_OFFER  = { title: '', description: '', startDate: '', endDate: '', linkedItemId: '', discountedPrice: '' };
const EMPTY_COUPON = { code: '', type: 'percent', value: '', maxUses: '', validUntil: '', isActive: true };
const EMPTY_COMBO  = { name: '', description: '', comboPrice: '', itemIds: [], tag: '', isActive: true };

const TABS = [
  { k: 'offers',  label: 'Offers',  singular: 'offer'  },
  { k: 'coupons', label: 'Coupons', singular: 'coupon' },
  { k: 'combos',  label: 'Combos',  singular: 'combo'  },
];

// ─── Status helpers — compute display state from Firestore docs.
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
function comboStatus(c) { return c.isActive === false ? 'hidden' : 'visible'; }

// Status pill metadata — { label, bg, color } per status. Shared across
// all three entities (some statuses are entity-specific but the look is uniform).
const STATUS_META = {
  active:    { label: 'ACTIVE',    bg: 'rgba(63,158,90,0.10)',   color: A.success },
  scheduled: { label: 'SCHEDULED', bg: 'rgba(196,168,109,0.12)', color: A.warningDim },
  expired:   { label: 'EXPIRED',   bg: A.subtleBg,                color: A.faintText },
  exhausted: { label: 'EXHAUSTED', bg: A.subtleBg,                color: A.faintText },
  inactive:  { label: 'INACTIVE',  bg: 'rgba(0,0,0,0.06)',        color: A.mutedText },
  visible:   { label: 'VISIBLE',   bg: 'rgba(63,158,90,0.10)',   color: A.success },
  hidden:    { label: 'HIDDEN',    bg: A.subtleBg,                color: A.faintText },
};

// Status colour for the row's left-edge stripe.
const STATUS_STRIPE = {
  active:    A.success,
  scheduled: A.warning,
  expired:   'rgba(0,0,0,0.15)',
  exhausted: 'rgba(0,0,0,0.15)',
  inactive:  'rgba(0,0,0,0.15)',
  visible:   A.warning,
  hidden:    'rgba(0,0,0,0.15)',
};

function formatDate(value) {
  if (!value) return '—';
  // Accepts both 'YYYY-MM-DD' strings and Firestore-timestamp seconds.
  const d = typeof value === 'number'
    ? new Date(value * 1000)
    : new Date(value + (String(value).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatRupee(n) {
  const v = Math.round(Number(n) || 0);
  return '₹' + v.toLocaleString('en-IN');
}

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

  // Per-tab filter + search state — kept independent so flipping tabs
  // doesn't reset the other tab's filter the user had set.
  const [offerFilter,  setOfferFilter]  = useState('all'); // all | active | scheduled | expired
  const [offerSearch,  setOfferSearch]  = useState('');
  const [couponFilter, setCouponFilter] = useState('all'); // all | active | inactive | expired
  const [couponSearch, setCouponSearch] = useState('');
  const [comboFilter,  setComboFilter]  = useState('all'); // all | visible | hidden
  const [comboSearch,  setComboSearch]  = useState('');

  // ─── Drawer state ───
  const [drawerEntity, setDrawerEntity] = useState(null); // 'offer'|'coupon'|'combo'|null
  const [drawerEditingId, setDrawerEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  // Offers: linked-item picker
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  // Combos: items multi-select
  const [comboItemSearch, setComboItemSearch] = useState('');

  // Honour ?tab=xxx (redirect destination + nav deep links).
  useEffect(() => {
    const q = router.query?.tab;
    if (q && TABS.find(t => t.k === q)) setTab(q);
  }, [router.query?.tab]);

  // Escape closes the drawer.
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

  // ─── Per-entity stats — drives the matte-black stats strip ───
  const offerStats = useMemo(() => ({
    active:    offers.filter(o => offerStatus(o) === 'active').length,
    scheduled: offers.filter(o => offerStatus(o) === 'scheduled').length,
    expired:   offers.filter(o => offerStatus(o) === 'expired').length,
    total:     offers.length,
  }), [offers]);

  const couponStats = useMemo(() => ({
    active:    coupons.filter(c => couponStatus(c) === 'active').length,
    inactive:  coupons.filter(c => c.isActive === false).length,
    expired:   coupons.filter(c => couponStatus(c) === 'expired').length,
    totalUses: coupons.reduce((s, c) => s + (c.usedCount || 0), 0),
  }), [coupons]);

  const comboStats = useMemo(() => {
    const totalValue   = combos.reduce((s, c) => s + (Number(c.comboPrice) || 0), 0);
    const totalSavings = combos.reduce((s, c) => s + (Number(c.savings) || 0), 0);
    return {
      visible: combos.filter(c => c.isActive !== false).length,
      hidden:  combos.filter(c => c.isActive === false).length,
      avgPrice: combos.length > 0 ? totalValue / combos.length : 0,
      totalSavings,
    };
  }, [combos]);

  // Tab badge counts (active rows per tab) — drives the gold count chip on each tab.
  const tabCounts = useMemo(() => ({
    offers:  offerStats.active,
    coupons: couponStats.active,
    combos:  comboStats.visible,
  }), [offerStats, couponStats, comboStats]);

  // ─── Filtered/displayed lists ───
  const displayedOffers = useMemo(() => {
    let list = offers;
    if (offerFilter !== 'all') list = list.filter(o => offerStatus(o) === offerFilter);
    const q = offerSearch.trim().toLowerCase();
    if (q) list = list.filter(o =>
      (o.title       || '').toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q) ||
      (o.linkedItemName || '').toLowerCase().includes(q)
    );
    return list;
  }, [offers, offerFilter, offerSearch]);

  const displayedCoupons = useMemo(() => {
    let list = coupons;
    if (couponFilter === 'active')   list = list.filter(c => couponStatus(c) === 'active');
    if (couponFilter === 'inactive') list = list.filter(c => c.isActive === false);
    if (couponFilter === 'expired')  list = list.filter(c => couponStatus(c) === 'expired');
    const q = couponSearch.trim().toLowerCase();
    if (q) list = list.filter(c => (c.code || '').toLowerCase().includes(q));
    return list;
  }, [coupons, couponFilter, couponSearch]);

  const displayedCombos = useMemo(() => {
    let list = combos;
    if (comboFilter === 'visible') list = list.filter(c => c.isActive !== false);
    if (comboFilter === 'hidden')  list = list.filter(c => c.isActive === false);
    const q = comboSearch.trim().toLowerCase();
    if (q) list = list.filter(c =>
      (c.name        || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.tag         || '').toLowerCase().includes(q)
    );
    return list;
  }, [combos, comboFilter, comboSearch]);

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

  // Closing the drawer when tabbing away avoids surprises (editing an offer
  // then clicking the Coupons tab would otherwise leave the drawer open with
  // half-edited offer state).
  const switchTab = (newTab) => {
    if (drawerEntity) closeDrawer();
    setTab(newTab);
    router.replace({ pathname: '/admin/promotions', query: { tab: newTab } }, undefined, { shallow: true });
  };

  // ─── Save dispatcher — entity-specific Firestore mutation ───
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

  // ─── Toggles + deletes ───
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
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .promo-tab:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .promo-row:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.06); }
          .promo-input:focus { border-color: ${A.warning} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.15); }
          .promo-input::placeholder { color: ${A.faintText}; }
          .promo-item-card:hover { background: ${A.subtleBg}; }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Catalog</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Promotions</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Promotions
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>
                Offers, coupons, and combos in one place. Click <strong>Edit</strong> or <strong>+ New</strong> to open the inline editor.
              </div>
            </div>
            <button onClick={() => openCreate(activeTabMeta.singular)} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: A.ink, color: A.cream, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: A.font, letterSpacing: '0.01em', alignSelf: 'flex-start',
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            }}>+ New {activeTabMeta.singular}</button>
          </div>

          {/* ── Stats strip — matte-black signature card, label/tiles vary by tab ── */}
          {tab === 'offers' && (
            <StatsStrip label="PROMOTIONS" tiles={[
              { label: 'Active',    value: offerStats.active,    big: true, color: offerStats.active > 0 ? A.success : A.forestText },
              { label: 'Scheduled', value: offerStats.scheduled, color: A.warning },
              { label: 'Expired',   value: offerStats.expired },
              { label: 'Total',     value: offerStats.total },
            ]} />
          )}
          {tab === 'coupons' && (
            <StatsStrip label="DISCOUNT CODES" tiles={[
              { label: 'Active',     value: couponStats.active, big: true, color: couponStats.active > 0 ? A.success : A.forestText },
              { label: 'Inactive',   value: couponStats.inactive },
              { label: 'Expired',    value: couponStats.expired },
              { label: 'Total uses', value: couponStats.totalUses, color: A.warning },
            ]} />
          )}
          {tab === 'combos' && (
            <StatsStrip label="BUNDLE OFFERS" tiles={[
              { label: 'Visible',  value: comboStats.visible, big: true, color: comboStats.visible > 0 ? A.success : A.forestText },
              { label: 'Hidden',   value: comboStats.hidden },
              { label: 'Avg price', value: combos.length > 0 ? formatRupee(comboStats.avgPrice) : '—', color: A.warning },
              { label: 'Total savings offered', value: comboStats.totalSavings > 0 ? formatRupee(comboStats.totalSavings) : '—' },
            ]} />
          )}

          {/* Tabs */}
          <div style={{ display: 'inline-flex', background: A.shell, border: A.border, borderRadius: 10, padding: 3, marginBottom: 14, boxShadow: A.shadowCard }}>
            {TABS.map(t => {
              const active = tab === t.k;
              const count = tabCounts[t.k];
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
                      fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ padding: '0 28px', marginBottom: 14 }}>
          {tab === 'offers' && (
            <FilterBar
              pills={[
                ['all',       'All',       offers.length],
                ['active',    'Active',    offerStats.active],
                ['scheduled', 'Scheduled', offerStats.scheduled],
                ['expired',   'Expired',   offerStats.expired],
              ]}
              value={offerFilter} onChange={setOfferFilter}
              search={offerSearch} setSearch={setOfferSearch}
              placeholder="Search offers…"
              countText={`${displayedOffers.length} offer${displayedOffers.length === 1 ? '' : 's'}`}
            />
          )}
          {tab === 'coupons' && (
            <FilterBar
              pills={[
                ['all',      'All',      coupons.length],
                ['active',   'Active',   couponStats.active],
                ['inactive', 'Inactive', couponStats.inactive],
                ['expired',  'Expired',  couponStats.expired],
              ]}
              value={couponFilter} onChange={setCouponFilter}
              search={couponSearch} setSearch={setCouponSearch}
              placeholder="Search code…"
              countText={`${displayedCoupons.length} coupon${displayedCoupons.length === 1 ? '' : 's'}`}
            />
          )}
          {tab === 'combos' && (
            <FilterBar
              pills={[
                ['all',     'All',     combos.length],
                ['visible', 'Visible', comboStats.visible],
                ['hidden',  'Hidden',  comboStats.hidden],
              ]}
              value={comboFilter} onChange={setComboFilter}
              search={comboSearch} setSearch={setComboSearch}
              placeholder="Search combo name or tag…"
              countText={`${displayedCombos.length} combo${displayedCombos.length === 1 ? '' : 's'}`}
            />
          )}
        </div>

        {/* List */}
        <div style={{ padding: '0 28px 80px' }}>
          {loading ? (
            <LoadingCard />
          ) : tab === 'offers' ? (
            displayedOffers.length === 0 ? (
              <EmptyCard
                titleText={offers.length === 0 ? 'No offers yet' : 'No offers match your filter'}
                subtitleText={offers.length === 0
                  ? 'Create a time-bound promotion — "Weekend Special 20% off" or a linked-dish discount.'
                  : 'Try a different filter or search term.'}
                ctaText={offers.length === 0 ? 'Create your first offer' : null}
                onCta={() => openCreate('offer')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {displayedOffers.map((offer, idx) => (
                  <OfferRow key={offer.id} offer={offer} idx={idx}
                    onEdit={() => openEdit('offer', offer)}
                    onDelete={() => delOffer(offer)}
                    busy={acting === 'offer:' + offer.id}
                  />
                ))}
              </div>
            )
          ) : tab === 'coupons' ? (
            displayedCoupons.length === 0 ? (
              <EmptyCard
                titleText={coupons.length === 0 ? 'No coupons yet' : 'No coupons match your filter'}
                subtitleText={coupons.length === 0
                  ? 'Create discount codes that customers can redeem at checkout.'
                  : 'Try a different filter or search term.'}
                ctaText={coupons.length === 0 ? 'Create your first coupon' : null}
                onCta={() => openCreate('coupon')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {displayedCoupons.map((c, idx) => (
                  <CouponRow key={c.id} c={c} idx={idx}
                    onEdit={() => openEdit('coupon', c)}
                    onToggle={() => toggleCoupon(c)}
                    onDelete={() => delCoupon(c)}
                    busy={acting === 'coupon:' + c.id}
                  />
                ))}
              </div>
            )
          ) : (
            displayedCombos.length === 0 ? (
              <EmptyCard
                titleText={combos.length === 0 ? 'No combos yet' : 'No combos match your filter'}
                subtitleText={combos.length === 0
                  ? 'Create a bundle like "Lunch Deal: Biryani + Raita + Mocktail — ₹599". Combos appear as a special row at the top of your menu.'
                  : 'Try a different filter or search term.'}
                ctaText={combos.length === 0 ? 'Create your first combo' : null}
                onCta={() => openCreate('combo')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {displayedCombos.map((c, idx) => (
                  <ComboRow key={c.id} c={c} menuItems={menuItems} idx={idx}
                    onEdit={() => openEdit('combo', c)}
                    onToggle={() => toggleCombo(c)}
                    onDelete={() => delCombo(c)}
                    busy={acting === 'combo:' + c.id}
                  />
                ))}
              </div>
            )
          )}
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
// ─── Stats strip + filter bar (shared chrome) ───
// ════════════════════════════════════════════════════════

function StatsStrip({ label, tiles }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
      borderRadius: 12, padding: '12px 18px', marginTop: 12, marginBottom: 14,
      border: A.forestBorder, boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>{label}</span>
        </div>
        <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
          {tiles.map((t, i) => (
            <Fragment key={t.label}>
              {i > 0 && <Divider />}
              <StatTile {...t} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterBar({ pills, value, onChange, search, setSearch, placeholder, countText }) {
  return (
    <div style={{
      background: A.shell, border: A.border, borderRadius: 14,
      boxShadow: A.shadowCard, padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 10, padding: 3 }}>
        {pills.map(([val, label, count]) => {
          const active = value === val;
          return (
            <button key={val}
              onClick={() => onChange(val)}
              style={{
                padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                background: active ? A.ink : 'transparent',
                color: active ? A.cream : A.mutedText,
                display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}>
              {label}
              {count > 0 && (
                <span style={{
                  padding: '1px 6px', borderRadius: 8,
                  background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.20)',
                  color: active ? A.cream : A.warningDim,
                  fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
      <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />
      <input className="promo-input"
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8,
          border: A.border, background: A.shellDarker,
          fontSize: 13, fontFamily: A.font, color: A.ink,
          outline: 'none', transition: 'all 0.15s',
        }} />
      <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>{countText}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ─── Per-entity row cards ───
// ════════════════════════════════════════════════════════

function OfferRow({ offer, idx, onEdit, onDelete, busy }) {
  const status = offerStatus(offer);
  const meta = STATUS_META[status];
  const stripe = STATUS_STRIPE[status];
  return (
    <div className="promo-row" style={{
      background: A.shell, borderRadius: 14, border: A.border,
      borderLeft: `4px solid ${stripe}`,
      boxShadow: A.shadowCard,
      padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      animation: 'fadeUp 0.22s ease both',
      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
      opacity: status === 'expired' ? 0.65 : 1,
      transition: 'box-shadow 0.15s',
    }}>
      {offer.linkedItemImage ? (
        <img src={offer.linkedItemImage} alt={offer.linkedItemName}
          style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: A.border }} />
      ) : (
        <div style={{
          width: 52, height: 52, borderRadius: 10,
          background: A.subtleBg, border: A.border, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: A.faintText, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
        }}>PROMO</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: A.ink, letterSpacing: '-0.2px' }}>{offer.title}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
            background: meta.bg, color: meta.color,
          }}>{meta.label}</span>
        </div>
        {offer.description && (
          <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 4, lineHeight: 1.5 }}>
            {offer.description}
          </div>
        )}
        {offer.linkedItemName && (
          <div style={{ fontSize: 12, color: A.ink, fontWeight: 600, marginBottom: 4 }}>
            {offer.linkedItemName}
            {offer.linkedItemPrice && (
              <span style={{ color: A.faintText, textDecoration: 'line-through', marginLeft: 8, fontWeight: 500 }}>
                ₹{offer.linkedItemPrice}
              </span>
            )}
            {offer.discountedPrice != null && (
              <span style={{ color: A.success, fontWeight: 700, marginLeft: 8 }}>
                → ₹{offer.discountedPrice}
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 11, color: A.faintText }}>
          {offer.startDate ? `${formatDate(offer.startDate)} → ${formatDate(offer.endDate)}` : `Ends ${formatDate(offer.endDate)}`}
        </div>
      </div>

      <RowActions onEdit={onEdit} onDelete={onDelete} busy={busy} />
    </div>
  );
}

function CouponRow({ c, idx, onEdit, onToggle, onDelete, busy }) {
  const status = couponStatus(c);
  const meta = STATUS_META[status];
  const stripe = STATUS_STRIPE[status];
  return (
    <div className="promo-row" style={{
      background: A.shell, borderRadius: 14, border: A.border,
      borderLeft: `4px solid ${stripe}`,
      boxShadow: A.shadowCard, padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      animation: 'fadeUp 0.22s ease both',
      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
      opacity: c.isActive === false ? 0.7 : 1,
      transition: 'box-shadow 0.15s',
    }}>
      <div style={{
        background: A.subtleBg, color: A.ink,
        fontFamily: A.mono, fontWeight: 700, fontSize: 15,
        padding: '10px 16px', borderRadius: 10, flexShrink: 0,
        letterSpacing: '0.08em', border: A.borderStrong,
      }}>{c.code}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 15, color: A.ink, letterSpacing: '-0.2px' }}>
            {c.type === 'percent' ? `${c.value}%` : `₹${c.value}`}
          </span>
          <span style={{ fontSize: 12, color: A.mutedText }}>off</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
            background: meta.bg, color: meta.color,
          }}>{meta.label}</span>
        </div>
        <div style={{ fontSize: 12, color: A.mutedText, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Used <strong style={{ color: A.ink, fontWeight: 600 }}>{c.usedCount || 0}</strong>{c.maxUses ? ` / ${c.maxUses}` : ''}</span>
          {c.validUntil && <span>Expires <strong style={{ color: A.ink, fontWeight: 600 }}>{formatDate(c.validUntil)}</strong></span>}
          {c.createdAt?.seconds && <span style={{ color: A.faintText }}>Created {formatDate(c.createdAt.seconds)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
        <Toggle on={c.isActive !== false} onClick={onToggle} busy={busy} />
        <RowActions onEdit={onEdit} onDelete={onDelete} busy={busy} />
      </div>
    </div>
  );
}

function ComboRow({ c, menuItems, idx, onEdit, onToggle, onDelete, busy }) {
  const comboItems = (c.itemIds || []).map(id => menuItems.find(m => m.id === id)).filter(Boolean);
  const visible = c.isActive !== false;
  const stripe = visible ? A.warning : 'rgba(0,0,0,0.15)';
  const missing = (c.itemIds?.length || 0) - comboItems.length;
  return (
    <div className="promo-row" style={{
      background: A.shell, borderRadius: 14, border: A.border,
      borderLeft: `4px solid ${stripe}`,
      boxShadow: A.shadowCard, padding: '16px 22px',
      animation: 'fadeUp 0.22s ease both',
      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
      opacity: visible ? 1 : 0.7,
      transition: 'box-shadow 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: A.ink, letterSpacing: '-0.2px' }}>{c.name}</span>
            {c.tag && (
              <span style={{
                padding: '3px 10px', borderRadius: 4,
                background: 'rgba(196,168,109,0.10)',
                color: A.warningDim, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>{c.tag}</span>
            )}
            {!visible && (
              <span style={{
                padding: '3px 8px', borderRadius: 4,
                background: A.subtleBg, color: A.faintText,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>Hidden</span>
            )}
          </div>
          {c.description && (
            <div style={{ fontSize: 13, color: A.mutedText, marginBottom: 10, lineHeight: 1.5 }}>{c.description}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {comboItems.map(item => (
              <span key={item.id} style={{
                padding: '4px 10px', borderRadius: 4,
                background: A.subtleBg, fontSize: 12, fontWeight: 500,
                color: A.ink, border: A.border,
              }}>{item.name}</span>
            ))}
            {missing > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 4,
                background: 'rgba(217,83,79,0.08)', color: A.danger,
                fontSize: 11, fontWeight: 600,
              }}>
                {missing} deleted item{missing === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 20, color: A.ink, letterSpacing: '-0.4px' }}>
              {formatRupee(c.comboPrice)}
            </span>
            {c.originalPrice > c.comboPrice && (
              <span style={{ fontSize: 12, color: A.faintText, textDecoration: 'line-through', fontFamily: A.mono }}>
                {formatRupee(c.originalPrice)}
              </span>
            )}
            {c.savings > 0 && (
              <span style={{
                padding: '3px 10px', borderRadius: 4,
                background: 'rgba(63,158,90,0.10)', color: A.success,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              }}>SAVE {formatRupee(c.savings)}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <Toggle on={visible} onClick={onToggle} busy={busy} />
          <RowActions onEdit={onEdit} onDelete={onDelete} busy={busy} />
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ─── Form sub-components (drawer body) ───
// ════════════════════════════════════════════════════════

function OfferForm({ form, setForm, menuItems, itemSearch, setItemSearch, itemPickerOpen, setItemPickerOpen }) {
  const today = todayKey();
  const linkedItem = form.linkedItemId ? menuItems.find(m => m.id === form.linkedItemId) : null;
  const pickerItems = itemSearch.trim()
    ? menuItems.filter(m => (m.name || '').toLowerCase().includes(itemSearch.toLowerCase()))
    : menuItems;

  return (
    <>
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
          style={{ ...inputStyle, fontFamily: A.mono, letterSpacing: '0.04em' }} />
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
        <Toggle on={form.isActive} onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} />
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

      <Field label="Combo price" required hint={originalTotal > 0 ? `(individual total: ${formatRupee(originalTotal)})` : ''}>
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
            Customer saves {formatRupee(savings)}
          </div>
        )}
      </Field>

      <Field label="Active">
        <Toggle on={form.isActive} onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} />
      </Field>
    </>
  );
}

// ════════════════════════════════════════════════════════
// ─── Shared chrome + helpers ───
// ════════════════════════════════════════════════════════

// Tiny Fragment alias — saves importing React.Fragment for the StatTile loop.
function Fragment({ children }) { return <>{children}</>; }

function StatTile({ label, value, color = A.forestText, big = false }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: A.mono, fontWeight: 700, fontSize: big ? 22 : 18, color, lineHeight: 1, letterSpacing: '-0.5px' }}>
        {value}
      </div>
    </div>
  );
}
function Divider() {
  return <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />;
}

function RowActions({ onEdit, onDelete, busy }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
      <button onClick={onEdit}
        style={{
          padding: '7px 14px', borderRadius: 8, border: A.border,
          background: A.shell, color: A.ink, fontWeight: 600, fontSize: 12,
          cursor: 'pointer', fontFamily: A.font,
        }}>Edit</button>
      <button onClick={onDelete} disabled={busy}
        style={{
          padding: '7px 12px', borderRadius: 8, border: 'none',
          background: 'rgba(217,83,79,0.08)', color: A.danger,
          fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: A.font,
          opacity: busy ? 0.5 : 1,
        }}>{busy ? '…' : 'Delete'}</button>
    </div>
  );
}

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
function Toggle({ on, onClick, busy }) {
  return (
    <div onClick={busy ? undefined : onClick} style={{
      display: 'inline-block', cursor: busy ? 'not-allowed' : 'pointer',
      width: 44, height: 24, borderRadius: 99,
      background: on ? A.success : 'rgba(0,0,0,0.18)',
      position: 'relative', transition: 'background 0.2s',
      opacity: busy ? 0.6 : 1,
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

function LoadingCard() {
  return (
    <div style={{
      background: A.shell, borderRadius: 14, border: A.border,
      padding: '64px 32px', textAlign: 'center', boxShadow: A.shadowCard,
    }}>
      <div style={{
        display: 'inline-block', width: 24, height: 24,
        border: `2px solid ${A.subtleBg}`, borderTopColor: A.warning,
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        marginBottom: 16,
      }} />
      <div style={{ fontSize: 13, color: A.mutedText }}>Loading…</div>
    </div>
  );
}
function EmptyCard({ titleText, subtitleText, ctaText, onCta }) {
  return (
    <div style={{
      background: A.shell, borderRadius: 14, border: A.border,
      padding: '56px 32px', textAlign: 'center', boxShadow: A.shadowCard,
    }}>
      <div style={{ fontWeight: 600, fontSize: 16, color: A.ink, marginBottom: 8, letterSpacing: '-0.2px' }}>{titleText}</div>
      <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>{subtitleText}</div>
      {ctaText && (
        <button onClick={onCta} style={{
          marginTop: 18, padding: '10px 20px', borderRadius: 10, border: 'none',
          background: A.ink, color: A.cream,
          fontSize: 13, fontWeight: 600, fontFamily: A.font, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>{ctaText}</button>
      )}
    </div>
  );
}
