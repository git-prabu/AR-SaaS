import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getCombos, createCombo, updateCombo, deleteCombo, getMenuItems } from '../../lib/db';
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

const EMPTY_FORM = { name: '', description: '', comboPrice: '', itemIds: [], tag: '', isActive: true };

function formatRupee(n) {
  const v = Math.round(Number(n) || 0);
  return '₹' + v.toLocaleString('en-IN');
}

export default function AdminCombos() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [combos, setCombos] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');  // 'all' | 'visible' | 'hidden'
  const [search, setSearch] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    if (!rid) return;
    try {
      const [c, m] = await Promise.all([getCombos(rid), getMenuItems(rid)]);
      setCombos(c);
      setItems(m.filter(i => i.isActive !== false));
    } catch (e) { console.error('Combos load failed:', e); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, [rid]);

  // ═══ Stats ═══
  const stats = useMemo(() => {
    const visible = combos.filter(c => c.isActive !== false).length;
    const hidden = combos.length - visible;
    const totalValue = combos.reduce((s, c) => s + (c.comboPrice || 0), 0);
    const totalSavings = combos.reduce((s, c) => s + (c.savings || 0), 0);
    return { visible, hidden, totalValue, totalSavings };
  }, [combos]);

  const displayed = useMemo(() => {
    let list = combos;
    if (filter === 'visible') list = list.filter(c => c.isActive !== false);
    if (filter === 'hidden')  list = list.filter(c => c.isActive === false);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.tag || '').toLowerCase().includes(q));
    return list;
  }, [combos, filter, search]);

  // Items inside the item-picker, filtered by itemSearch
  const pickerItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  // Form calculations
  const formSelectedItems = form.itemIds.map(id => items.find(i => i.id === id)).filter(Boolean);
  const formOriginalTotal = formSelectedItems.reduce((s, i) => s + (i.price || 0), 0);
  const formSavings = formOriginalTotal - (Number(form.comboPrice) || 0);

  // ═══ Drawer ═══
  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setItemSearch(''); setDrawerOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '', description: c.description || '',
      comboPrice: c.comboPrice != null ? String(c.comboPrice) : '',
      itemIds: c.itemIds || [], tag: c.tag || '',
      isActive: c.isActive !== false,
    });
    setItemSearch('');
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(EMPTY_FORM); };
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const toggleFormItem = (id) =>
    setForm(f => ({ ...f, itemIds: f.itemIds.includes(id) ? f.itemIds.filter(x => x !== id) : [...f.itemIds, id] }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Combo name is required');
    if (form.itemIds.length < 2) return toast.error('Select at least 2 items for the combo');
    if (!form.comboPrice || isNaN(form.comboPrice) || Number(form.comboPrice) <= 0) return toast.error('Enter a valid combo price');

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        comboPrice: Number(form.comboPrice),
        itemIds: form.itemIds,
        tag: form.tag.trim(),
        isActive: form.isActive,
        originalPrice: formOriginalTotal,
        savings: Math.max(0, formSavings),
      };
      if (editingId) { await updateCombo(rid, editingId, payload); toast.success('Combo updated'); }
      else           { await createCombo(rid, payload);             toast.success('Combo created'); }
      closeDrawer();
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete combo "${c.name}"? This cannot be undone.`)) return;
    setDeleting(c.id);
    try { await deleteCombo(rid, c.id); toast.success('Combo deleted'); await load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleToggle = async (c) => {
    try { await updateCombo(rid, c.id, { isActive: !c.isActive }); await load(); }
    catch { toast.error('Update failed'); }
  };

  return (
    <AdminLayout>
      <Head><title>Combo Builder | Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: none; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .cb-row { transition: all 0.15s; }
          .cb-row:hover { box-shadow: 0 4px 20px rgba(38,52,49,0.06); }
          .cb-tab-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .cb-btn:hover:not(:disabled) { filter: brightness(1.08); }
          .cb-ghost:hover { background: ${A.subtleBg}; }
          .cb-input:focus { border-color: ${A.warning} !important; background: ${A.shell} !important; }
          .cb-item-card { transition: all 0.12s; }
          .cb-item-card:hover { border-color: rgba(196,168,109,0.40) !important; }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Menu</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Combo Builder</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Combo Builder
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>
                Bundle dishes at a special price — shown as a highlighted row on the live menu
              </div>
            </div>
            <button className="cb-btn" onClick={openCreate}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: A.font, letterSpacing: '0.01em', alignSelf: 'flex-start',
              }}>+ New Combo</button>
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
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>BUNDLE OFFERS</span>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
                <StatTile label="Visible" value={stats.visible} big color={stats.visible > 0 ? A.success : A.forestText} />
                <Divider />
                <StatTile label="Hidden" value={stats.hidden} />
                <Divider />
                <StatTile label="Avg price" value={combos.length > 0 ? formatRupee(stats.totalValue / combos.length) : '—'} color={A.warning} />
                <Divider />
                <StatTile label="Total savings offered" value={stats.totalSavings > 0 ? formatRupee(stats.totalSavings) : '—'} />
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
                ['all', 'All', combos.length],
                ['visible', 'Visible', stats.visible],
                ['hidden', 'Hidden', stats.hidden],
              ].map(([val, label, count]) => {
                const active = filter === val;
                return (
                  <button key={val} className={`cb-tab-pill ${active ? 'active' : ''}`}
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
            <input className="cb-input"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search combo name or tag…"
              style={{
                flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink,
                outline: 'none', transition: 'all 0.15s',
              }} />
            <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>
              {displayed.length} combo{displayed.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* List */}
        <div style={{ padding: '0 28px 80px' }}>
          {!loaded ? (
            <LoadingCard />
          ) : displayed.length === 0 ? (
            <EmptyCard
              titleText={combos.length === 0 ? 'No combos yet' : 'No combos match your filter'}
              subtitleText={combos.length === 0
                ? 'Create a bundle like "Lunch Deal: Biryani + Raita + Mocktail — ₹599". Combos appear as a special row at the top of your menu.'
                : 'Try a different filter or search term.'}
              ctaText={combos.length === 0 ? 'Create your first combo' : null}
              onCta={openCreate}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayed.map((c, idx) => {
                const comboItems = (c.itemIds || []).map(id => items.find(i => i.id === id)).filter(Boolean);
                const visible = c.isActive !== false;
                return (
                  <div key={c.id} className="cb-row"
                    style={{
                      background: A.shell, borderRadius: 14, border: A.border,
                      borderLeft: `4px solid ${visible ? A.warning : 'rgba(0,0,0,0.15)'}`,
                      boxShadow: A.shadowCard, padding: '16px 22px',
                      animation: 'fadeUp 0.22s ease both',
                      animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                      opacity: visible ? 1 : 0.7,
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
                          {c.itemIds?.length > comboItems.length && (
                            <span style={{
                              padding: '4px 10px', borderRadius: 4,
                              background: 'rgba(217,83,79,0.08)', color: A.danger,
                              fontSize: 11, fontWeight: 600,
                            }}>
                              {c.itemIds.length - comboItems.length} deleted item{c.itemIds.length - comboItems.length === 1 ? '' : 's'}
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
                            }}>Save {formatRupee(c.savings)}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                        <Toggle on={visible} onClick={() => handleToggle(c)} />
                        <button className="cb-ghost" onClick={() => openEdit(c)}
                          style={{
                            padding: '7px 14px', borderRadius: 8, border: A.border,
                            background: A.shell, color: A.ink, fontWeight: 600, fontSize: 12,
                            cursor: 'pointer', fontFamily: A.font,
                          }}>Edit</button>
                        <button onClick={() => handleDelete(c)} disabled={deleting === c.id}
                          style={{
                            padding: '7px 12px', borderRadius: 8, border: 'none',
                            background: 'rgba(217,83,79,0.08)', color: A.danger,
                            fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: A.font,
                            opacity: deleting === c.id ? 0.5 : 1,
                          }}>{deleting === c.id ? '…' : 'Delete'}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Drawer form */}
        {drawerOpen && (
          <>
            <div onClick={closeDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 90, animation: 'fadeIn 0.2s ease both',
            }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 520,
              background: A.shell, zIndex: 91,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              animation: 'slideInRight 0.28s ease both',
            }}>
              <DrawerHeader title="Combo" editing={!!editingId} onClose={closeDrawer} />

              <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>
                {/* Name + tag */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div>
                    <Label>Combo name <Required /></Label>
                    <input className="cb-input"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Lunch Deal, Family Pack"
                      style={inputStyle} />
                  </div>
                  <div>
                    <Label>Badge tag</Label>
                    <input className="cb-input"
                      value={form.tag}
                      onChange={e => setForm(f => ({ ...f, tag: e.target.value }))}
                      placeholder="Best Value"
                      style={inputStyle} />
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <Label>Short description</Label>
                  <input className="cb-input"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Perfect for 2 — starter, main, and dessert."
                    style={inputStyle} />
                </div>

                {/* Item multi-select with search */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Label>Items <Required /> <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>pick at least 2</span></Label>
                    <span style={{ fontSize: 11, fontWeight: 600, color: form.itemIds.length >= 2 ? A.success : A.danger }}>
                      {form.itemIds.length} selected
                    </span>
                  </div>
                  <input className="cb-input"
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    placeholder="Search items by name or category…"
                    style={{ ...inputStyle, marginBottom: 8 }} />
                  <div style={{
                    maxHeight: 260, overflowY: 'auto',
                    border: A.border, borderRadius: 10, padding: 6,
                    background: A.shellDarker,
                  }}>
                    {pickerItems.length === 0 ? (
                      <div style={{ padding: 20, color: A.faintText, fontSize: 13, textAlign: 'center' }}>
                        {items.length === 0 ? 'No active items available.' : 'No items match your search.'}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                        {pickerItems.map(item => {
                          const sel = form.itemIds.includes(item.id);
                          return (
                            <div key={item.id} className="cb-item-card" onClick={() => toggleFormItem(item.id)}
                              style={{
                                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                border: `1.5px solid ${sel ? A.warning : 'rgba(0,0,0,0.08)'}`,
                                background: sel ? 'rgba(196,168,109,0.08)' : A.shell,
                                display: 'flex', alignItems: 'center', gap: 10,
                              }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: 4,
                                border: `1.5px solid ${sel ? A.warning : 'rgba(0,0,0,0.2)'}`,
                                background: sel ? A.warning : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                transition: 'all 0.12s',
                              }}>
                                {sel && <span style={{ color: A.shell, fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: 11, color: A.faintText }}>
                                  {item.category || '—'}{item.price ? ` · ${formatRupee(item.price)}` : ''}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Combo price + live savings summary */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Combo price <Required /></Label>
                  <div style={{ position: 'relative' }}>
                    <input className="cb-input"
                      type="number" min="0"
                      value={form.comboPrice}
                      onChange={e => setForm(f => ({ ...f, comboPrice: e.target.value }))}
                      placeholder="599"
                      style={{ ...inputStyle, paddingLeft: 32 }} />
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: A.mutedText, fontWeight: 600, pointerEvents: 'none' }}>₹</span>
                  </div>

                  {/* Savings preview */}
                  {form.itemIds.length > 0 && (
                    <div style={{
                      marginTop: 12, padding: '12px 14px',
                      borderRadius: 10, background: A.subtleBg,
                      display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Original total</div>
                        <div style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 16, color: A.ink }}>{formatRupee(formOriginalTotal)}</div>
                      </div>
                      <div style={{ width: 1, height: 30, background: 'rgba(0,0,0,0.08)' }} />
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Customer saves</div>
                        <div style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 16, color: formSavings > 0 ? A.success : A.faintText }}>
                          {formSavings > 0 ? formatRupee(formSavings) : '—'}
                        </div>
                      </div>
                      {formOriginalTotal > 0 && formSavings > 0 && (
                        <>
                          <div style={{ width: 1, height: 30, background: 'rgba(0,0,0,0.08)' }} />
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Discount</div>
                            <div style={{ fontFamily: A.mono, fontWeight: 700, fontSize: 16, color: A.success }}>
                              {Math.round((formSavings / formOriginalTotal) * 100)}%
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Visible toggle */}
                <div style={{ padding: '14px 16px', borderRadius: 10, background: A.subtleBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, marginBottom: 2 }}>Visible on menu</div>
                    <div style={{ fontSize: 11, color: A.mutedText }}>Customers can see and order this combo</div>
                  </div>
                  <Toggle big on={form.isActive} onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} />
                </div>
              </div>

              <DrawerFooter saving={saving} editing={!!editingId} onCancel={closeDrawer} onSave={handleSave} saveLabel="combo" />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ═══ Shared helpers (same as coupons.js) ═══
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
function Toggle({ on, onClick, big = false }) {
  const w = big ? 42 : 36, h = big ? 24 : 20, ball = big ? 18 : 14;
  return (
    <div onClick={onClick} style={{ width: w, height: h, borderRadius: 99, background: on ? '#3F9E5A' : 'rgba(0,0,0,0.15)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: ball, height: ball, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: on ? w - ball - 3 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
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
      {ctaText && (
        <button onClick={onCta} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#C4A86D', color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: INTER }}>{ctaText}</button>
      )}
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

AdminCombos.getLayout = (page) => page;