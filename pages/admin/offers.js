import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllOffers, createOffer, updateOffer, deleteOffer, getAllMenuItems, todayKey } from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, mono: "'JetBrains Mono', monospace",
  cream: '#EDEDED', ink: '#1A1A1A',
  shell: '#FFFFFF', shellDarker: '#FAFAF8',
  warning: '#C4A86D', warningDim: '#A08656',
  success: '#3F9E5A', danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
  forest: '#1A1A1A', forestDarker: '#2A2A2A',
  forestText: '#EAE7E3', forestTextMuted: 'rgba(234,231,227,0.55)', forestTextFaint: 'rgba(234,231,227,0.35)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const EMPTY_FORM = { title: '', description: '', startDate: '', endDate: '', linkedItemId: '', discountedPrice: '' };

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ═══ Offer status derived from dates ═══
function offerStatus(o) {
  const today = todayKey();
  if (o.endDate && o.endDate < today) return 'expired';
  if (o.startDate && o.startDate > today) return 'scheduled';
  return 'active';
}
const STATUS_META = {
  active:    { label: 'Active',    color: A.success,    bg: 'rgba(63,158,90,0.10)' },
  scheduled: { label: 'Scheduled', color: A.warningDim, bg: 'rgba(196,168,109,0.10)' },
  expired:   { label: 'Expired',   color: A.faintText,  bg: A.subtleBg },
};

export default function AdminOffers() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const today = todayKey();

  const [offers, setOffers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemSearch, setItemSearch] = useState('');
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    if (!rid) return;
    try {
      const [o, m] = await Promise.all([getAllOffers(rid), getAllMenuItems(rid)]);
      setOffers(o);
      setMenuItems(m.filter(i => i.isActive !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (e) { console.error('Offers load failed:', e); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, [rid]);

  const stats = useMemo(() => {
    const byStatus = offers.reduce((acc, o) => {
      const s = offerStatus(o);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return {
      active: byStatus.active || 0,
      scheduled: byStatus.scheduled || 0,
      expired: byStatus.expired || 0,
    };
  }, [offers]);

  const displayed = useMemo(() => {
    let list = offers;
    if (filter !== 'all') list = list.filter(o => offerStatus(o) === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o =>
      (o.title || '').toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q) ||
      (o.linkedItemName || '').toLowerCase().includes(q)
    );
    return list;
  }, [offers, filter, search]);

  const linkedItem = menuItems.find(i => i.id === form.linkedItemId);

  // Filtered items for searchable picker
  const pickerItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q)
    );
  }, [menuItems, itemSearch]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDrawerOpen(true); };
  const openEdit = (o) => {
    setEditingId(o.id);
    setForm({
      title: o.title || '', description: o.description || '',
      startDate: o.startDate || '', endDate: o.endDate || '',
      linkedItemId: o.linkedItemId || '',
      discountedPrice: o.discountedPrice != null ? String(o.discountedPrice) : '',
    });
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(EMPTY_FORM); setItemPickerOpen(false); setItemSearch(''); };
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const handleSave = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.endDate) return toast.error('End date is required');
    if (form.startDate && form.endDate < form.startDate) return toast.error('End date must be after start date');
    if (form.discountedPrice !== '' && Number(form.discountedPrice) <= 0) return toast.error('Offer price must be greater than 0');

    setSaving(true);
    try {
      const payload = {
        ...form,
        discountedPrice: form.discountedPrice !== '' ? Number(form.discountedPrice) : null,
        linkedItemId: form.linkedItemId || null,
        linkedItemName: linkedItem?.name || null,
        linkedItemImage: linkedItem?.imageURL || null,
        linkedItemPrice: linkedItem?.price || null,
      };
      if (editingId) { await updateOffer(rid, editingId, payload); toast.success('Offer updated'); }
      else           { await createOffer(rid, payload);            toast.success('Offer created'); }
      closeDrawer();
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (o) => {
    if (!confirm(`Delete offer "${o.title}"? This cannot be undone.`)) return;
    setDeleting(o.id);
    try { await deleteOffer(rid, o.id); toast.success('Offer deleted'); await load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  return (
    <AdminLayout>
      <Head><title>Offers | Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: none; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .of-row { transition: all 0.15s; }
          .of-row:hover { box-shadow: 0 4px 20px rgba(38,52,49,0.06); }
          .of-tab-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .of-btn:hover:not(:disabled) { filter: brightness(1.08); }
          .of-ghost:hover { background: ${A.subtleBg}; }
          .of-input:focus { border-color: ${A.warning} !important; background: ${A.shell} !important; }
          .of-item-card { transition: all 0.12s; }
          .of-item-card:hover { border-color: rgba(196,168,109,0.40) !important; }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Menu</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Offers</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Offers & Promotions
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>
                Time-bound promos displayed as a horizontal strip on your live menu
              </div>
            </div>
            <button className="of-btn" onClick={openCreate}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: A.font, letterSpacing: '0.01em', alignSelf: 'flex-start',
              }}>+ New Offer</button>
          </div>

          {/* Stats strip */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 12, padding: '12px 18px', marginTop: 12, marginBottom: 14,
            border: A.forestBorder, boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>PROMOTIONS</span>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
                <StatTile label="Active" value={stats.active} big color={stats.active > 0 ? A.success : A.forestText} />
                <Divider />
                <StatTile label="Scheduled" value={stats.scheduled} color={A.warning} />
                <Divider />
                <StatTile label="Expired" value={stats.expired} />
                <Divider />
                <StatTile label="Total" value={offers.length} />
              </div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ padding: '0 28px', marginBottom: 14 }}>
          <div style={{
            background: A.shell, border: A.border, borderRadius: 14,
            boxShadow: A.shadowCard, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 10, padding: 3 }}>
              {[
                ['all', 'All', offers.length],
                ['active', 'Active', stats.active],
                ['scheduled', 'Scheduled', stats.scheduled],
                ['expired', 'Expired', stats.expired],
              ].map(([val, label, count]) => {
                const active = filter === val;
                return (
                  <button key={val} className={`of-tab-pill ${active ? 'active' : ''}`}
                    onClick={() => setFilter(val)}
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
            <input className="of-input"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search offers…"
              style={{
                flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink,
                outline: 'none', transition: 'all 0.15s',
              }} />
            <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>
              {displayed.length} offer{displayed.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* List */}
        <div style={{ padding: '0 28px 80px' }}>
          {!loaded ? (
            <LoadingCard />
          ) : displayed.length === 0 ? (
            <EmptyCard
              titleText={offers.length === 0 ? 'No offers yet' : 'No offers match your filter'}
              subtitleText={offers.length === 0
                ? 'Create a time-bound promotion — "Weekend Special 20% off" or a linked-dish discount.'
                : 'Try a different filter or search term.'}
              ctaText={offers.length === 0 ? 'Create your first offer' : null}
              onCta={openCreate}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayed.map((offer, idx) => {
                const status = offerStatus(offer);
                const meta = STATUS_META[status];
                return (
                  <div key={offer.id} className="of-row"
                    style={{
                      background: A.shell, borderRadius: 14, border: A.border,
                      borderLeft: `4px solid ${meta.color}`,
                      boxShadow: A.shadowCard,
                      padding: '14px 20px',
                      display: 'flex', alignItems: 'center', gap: 16,
                      animation: 'fadeUp 0.22s ease both',
                      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                      opacity: status === 'expired' ? 0.65 : 1,
                    }}>

                    {/* Image or placeholder */}
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

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                      <button className="of-ghost" onClick={() => openEdit(offer)}
                        style={{
                          padding: '7px 14px', borderRadius: 8, border: A.border,
                          background: A.shell, color: A.ink, fontWeight: 600, fontSize: 12,
                          cursor: 'pointer', fontFamily: A.font,
                        }}>Edit</button>
                      <button onClick={() => handleDelete(offer)} disabled={deleting === offer.id}
                        style={{
                          padding: '7px 12px', borderRadius: 8, border: 'none',
                          background: 'rgba(217,83,79,0.08)', color: A.danger,
                          fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: A.font,
                          opacity: deleting === offer.id ? 0.5 : 1,
                        }}>{deleting === offer.id ? '…' : 'Delete'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer */}
        {drawerOpen && (
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
              <DrawerHeader title="Offer" editing={!!editingId} onClose={closeDrawer} />

              <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
                {/* Live preview (only if title entered) */}
                {form.title && (
                  <div style={{ marginBottom: 20 }}>
                    <Label>Live preview</Label>
                    <div style={{
                      background: A.ink, borderRadius: 12, padding: '14px 18px',
                      display: 'flex', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden',
                    }}>
                      {/* Subtle gold glow accent */}
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

                <div style={{ marginBottom: 18 }}>
                  <Label>Title <Required /></Label>
                  <input className="of-input"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Weekend Special — 20% off"
                    style={inputStyle} />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <Label>Description</Label>
                  <input className="of-input"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Tap to see the dish"
                    style={inputStyle} />
                </div>

                {/* Link to dish — searchable picker */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Link to a dish <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(optional — makes card clickable)</span></Label>
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
                      <button onClick={() => setForm(f => ({ ...f, linkedItemId: '', discountedPrice: '' }))}
                        style={{
                          padding: '5px 10px', borderRadius: 6, border: 'none',
                          background: A.subtleBg, color: A.mutedText,
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: INTER,
                        }}>Remove</button>
                    </div>
                  ) : (
                    <>
                      <input className="of-input"
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
                              <div key={item.id} className="of-item-card"
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
                      <Label>Offer price <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(shown as the discounted price)</span></Label>
                      <div style={{ position: 'relative' }}>
                        <input className="of-input"
                          type="number" min="0"
                          value={form.discountedPrice}
                          onChange={e => setForm(f => ({ ...f, discountedPrice: e.target.value }))}
                          placeholder={linkedItem.price ? `less than ${linkedItem.price}` : 'Enter offer price'}
                          style={{ ...inputStyle, paddingLeft: 32 }} />
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: A.mutedText, fontWeight: 600, pointerEvents: 'none' }}>₹</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Date range */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div>
                    <Label>Start date</Label>
                    <input className="of-input" type="date"
                      value={form.startDate}
                      onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                      style={inputStyle} />
                  </div>
                  <div>
                    <Label>End date <Required /></Label>
                    <input className="of-input" type="date"
                      value={form.endDate}
                      min={form.startDate || today}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                      style={inputStyle} />
                  </div>
                </div>
              </div>

              <DrawerFooter saving={saving} editing={!!editingId} onCancel={closeDrawer} onSave={handleSave} saveLabel="offer" />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ═══ Shared helpers ═══
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.10)', background: '#FAFAF8',
  fontSize: 13, color: '#1A1A1A', fontFamily: INTER,
  outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s',
};
function Label({ children }) { return <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: INTER }}>{children}</label>; }
function Required() { return <span style={{ color: '#D9534F', fontWeight: 700 }}>*</span>; }
function Divider() { return <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />; }
function StatTile({ label, value, color = '#EAE7E3', big = false }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(234,231,227,0.35)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: big ? 22 : 18, color, lineHeight: 1, letterSpacing: big ? '-0.5px' : '-0.3px' }}>{value}</div>
    </div>
  );
}
function LoadingCard() {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '64px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' }}>
      <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid rgba(0,0,0,0.04)', borderTopColor: '#C4A86D', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>Loading…</div>
    </div>
  );
}
function EmptyCard({ titleText, subtitleText, ctaText, onCta }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '64px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' }}>
      <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#C4A86D', opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, color: '#1A1A1A', marginBottom: 8, letterSpacing: '-0.2px' }}>{titleText}</div>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto 20px' }}>{subtitleText}</div>
      {ctaText && <button onClick={onCta} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#C4A86D', color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: INTER }}>{ctaText}</button>}
    </div>
  );
}
function DrawerHeader({ title, editing, onClose }) {
  return (
    <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.38)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{editing ? 'Edit' : 'New'}</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#1A1A1A', letterSpacing: '-0.2px' }}>{title}</div>
      </div>
      <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.04)', color: '#1A1A1A', fontSize: 18, cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
    </div>
  );
}
function DrawerFooter({ saving, editing, onCancel, onSave, saveLabel }) {
  return (
    <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <button onClick={onCancel} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.06)', background: '#FFFFFF', color: 'rgba(0,0,0,0.55)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: INTER }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#1A1A1A', color: '#EDEDED', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: INTER, opacity: saving ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {saving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#EDEDED', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
        {saving ? 'Saving…' : editing ? 'Save changes' : `Create ${saveLabel}`}
      </button>
    </div>
  );
}

AdminOffers.getLayout = (page) => page;