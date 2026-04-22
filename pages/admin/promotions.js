// pages/admin/promotions.js
// Unified landing for Offers + Coupons + Combos. Shows all three entities
// in one place with a tab bar + per-tab list view. Full CRUD (create/edit)
// still happens in the dedicated pages (/admin/offers, /admin/coupons,
// /admin/combos) — this page is the single entry point from the nav and a
// quick overview; the dedicated pages are the deep-dive editors.
//
// This shape was chosen because the three existing pages are 560–630 lines
// each with similar-but-different drawer forms. Replicating the full CRUD
// here would double the code; delegating edits to the existing pages gives
// us the unified UX without the maintenance burden.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHead from '../../components/PageHead';
import {
  getAllOffers, deleteOffer,
  getCoupons, updateCoupon, deleteCoupon,
  getCombos, updateCombo, deleteCombo,
  getAllMenuItems,
} from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
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

function today() { return new Date().toISOString().split('T')[0]; }
function offerStatus(o) {
  const t = today();
  if (o.endDate && o.endDate < t) return 'expired';
  if (o.startDate && o.startDate > t) return 'scheduled';
  return 'active';
}
function couponStatus(c) {
  const t = today();
  if (c.isActive === false) return 'inactive';
  if (c.validUntil && c.validUntil < t) return 'expired';
  if (c.maxUses && c.usedCount >= c.maxUses) return 'exhausted';
  return 'active';
}
function comboStatus(c) { return c.isActive === false ? 'inactive' : 'active'; }

const TABS = [
  { k: 'offers',  label: 'Offers',  editHref: '/admin/offers'  },
  { k: 'coupons', label: 'Coupons', editHref: '/admin/coupons' },
  { k: 'combos',  label: 'Combos',  editHref: '/admin/combos'  },
];

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

  // Honour ?tab=xxx query from nav deep-links.
  useEffect(() => {
    const q = router.query?.tab;
    if (q && TABS.find(t => t.k === q)) setTab(q);
  }, [router.query?.tab]);

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

  // ─── Counts for tab badges ───
  const counts = useMemo(() => ({
    offers:  offers.filter(o  => offerStatus(o)  === 'active').length,
    coupons: coupons.filter(c => couponStatus(c) === 'active').length,
    combos:  combos.filter(c  => comboStatus(c)  === 'active').length,
  }), [offers, coupons, combos]);

  // ─── Toggle + delete handlers (inline, not a drawer — keeps this page light) ───
  const toggleCoupon = async (c) => {
    setActing('coupon:' + c.id);
    try {
      await updateCoupon(rid, c.id, { isActive: !c.isActive });
      setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
    } catch (e) { toast.error('Could not update'); }
    setActing(null);
  };
  const toggleCombo = async (c) => {
    setActing('combo:' + c.id);
    try {
      await updateCombo(rid, c.id, { isActive: !c.isActive });
      setCombos(prev => prev.map(x => x.id === c.id ? { ...x, isActive: !c.isActive } : x));
    } catch (e) { toast.error('Could not update'); }
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

  const activeTab = TABS.find(t => t.k === tab);

  return (
    <AdminLayout>
      <PageHead title="Promotions" />
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          .promo-tab:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .promo-row:hover { background: ${A.shellDarker}; }
        `}</style>

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
              Offers, coupons, and combos in one place. Click <strong>Edit</strong> on any row to open the full editor.
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'inline-flex', background: A.shell, border: A.border, borderRadius: 10, padding: 3, marginBottom: 14, boxShadow: A.cardShadow }}>
            {TABS.map(t => {
              const active = tab === t.k;
              const count = counts[t.k];
              return (
                <button key={t.k} className={`promo-tab ${active ? 'active' : ''}`}
                  onClick={() => { setTab(t.k); router.replace({ pathname: '/admin/promotions', query: { tab: t.k } }, undefined, { shallow: true }); }}
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
          {/* Action row — "+ New" links to the full editor page for each entity */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: A.mutedText }}>
              {loading ? 'Loading…' :
               tab === 'offers'  ? `${offers.length} offer${offers.length === 1 ? '' : 's'}` :
               tab === 'coupons' ? `${coupons.length} coupon${coupons.length === 1 ? '' : 's'}` :
                                    `${combos.length} combo${combos.length === 1 ? '' : 's'}`}
            </div>
            <Link href={activeTab.editHref} style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream,
                fontSize: 13, fontWeight: 600, fontFamily: A.font,
                cursor: 'pointer', letterSpacing: '-0.05px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                + New {activeTab.label.replace(/s$/, '').toLowerCase()}
              </button>
            </Link>
          </div>

          <div style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 56, textAlign: 'center', color: A.mutedText, fontSize: 13 }}>Loading…</div>
            ) : tab === 'offers' ? (
              offers.length === 0 ? (
                <Empty message="No offers yet." href={activeTab.editHref} />
              ) : offers.map(o => (
                <Row key={o.id}
                  title={o.title || 'Untitled offer'}
                  subtitle={[
                    o.discountedPrice ? `₹${o.discountedPrice} price` : null,
                    o.startDate || o.endDate ? `${o.startDate || '—'} → ${o.endDate || '—'}` : null,
                    o.linkedItemId ? (menuItems.find(m => m.id === o.linkedItemId)?.name || 'Linked item') : null,
                  ].filter(Boolean).join(' · ')}
                  status={offerStatus(o)}
                  onEdit={() => router.push(activeTab.editHref)}
                  onDelete={() => delOffer(o)}
                  busy={acting === 'offer:' + o.id}
                />
              ))
            ) : tab === 'coupons' ? (
              coupons.length === 0 ? (
                <Empty message="No coupons yet." href={activeTab.editHref} />
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
                  onEdit={() => router.push(activeTab.editHref)}
                  onDelete={() => delCoupon(c)}
                  busy={acting === 'coupon:' + c.id}
                />
              ))
            ) : (
              combos.length === 0 ? (
                <Empty message="No combos yet." href={activeTab.editHref} />
              ) : combos.map(c => {
                const items = (c.itemIds || []).map(id => menuItems.find(m => m.id === id)?.name).filter(Boolean);
                return (
                  <Row key={c.id}
                    title={c.name || 'Untitled combo'}
                    subtitle={[
                      c.comboPrice ? `₹${c.comboPrice}` : null,
                      items.length > 0 ? `${items.length} items: ${items.slice(0,2).join(', ')}${items.length > 2 ? '…' : ''}` : null,
                    ].filter(Boolean).join(' · ')}
                    status={comboStatus(c)}
                    onToggle={() => toggleCombo(c)}
                    toggledOn={c.isActive !== false}
                    onEdit={() => router.push(activeTab.editHref)}
                    onDelete={() => delCombo(c)}
                    busy={acting === 'combo:' + c.id}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

AdminPromotions.getLayout = (page) => page;

// ─── Shared row ───
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
          Edit →
        </button>
        <button onClick={onDelete} disabled={busy}
          style={{
            padding: '6px 10px', borderRadius: 7,
            border: '1px solid rgba(217,83,79,0.18)',
            background: 'rgba(217,83,79,0.05)',
            color: A.danger, fontSize: 11, fontWeight: 600, fontFamily: A.font,
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
          }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function Empty({ message, href }) {
  return (
    <div style={{ padding: '56px 32px', textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: A.ink, marginBottom: 8 }}>{message}</div>
      <div style={{ fontSize: 13, color: A.mutedText, marginBottom: 16 }}>Start promoting — pick the "+ New" button above or jump directly to the full editor.</div>
      <Link href={href} style={{ textDecoration: 'none' }}>
        <span style={{
          display: 'inline-block',
          padding: '10px 20px', borderRadius: 10,
          background: A.ink, color: A.cream,
          fontSize: 13, fontWeight: 600, fontFamily: A.font,
        }}>Go to full editor →</span>
      </Link>
    </div>
  );
}
