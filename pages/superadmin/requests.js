import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllPendingRequests, getAllRestaurants, getRequests, updateRequestStatus, updateRestaurant, getAllMenuItemsAllRestaurants, saDb } from '../../lib/saDb';
import { uploadFile, buildModelPath, fileSizeMB } from '../../lib/saStorage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
// saDb is the superAdminDb instance — use instead of db for all SA Firestore writes
const db = saDb;
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as admin pages ═══
const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
  cardShadow: '0 2px 10px rgba(0,0,0,0.03)',
};

// Single status pill style — gold for pending, green for approved, red for rejected.
const STATUS_PILL = {
  pending:  { bg: 'rgba(196,168,109,0.12)', color: A.warningDim, border: 'rgba(196,168,109,0.30)' },
  approved: { bg: 'rgba(63,158,90,0.10)',   color: A.success,    border: 'rgba(63,158,90,0.22)'    },
  rejected: { bg: 'rgba(217,83,79,0.10)',   color: A.danger,     border: 'rgba(217,83,79,0.22)'    },
};

export default function SuperAdminRequests() {
  const [requests,   setRequests]   = useState([]);
  const [restaurants,setRestaurants]= useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState('requests'); // 'requests' | 'items'
  const [filter,     setFilter]     = useState('pending');
  const [itemFilter, setItemFilter] = useState('all');      // 'all' | 'pending_ar' | 'ar_ready'
  const [expanded,   setExpanded]   = useState(null);
  const [modelFiles, setModelFiles] = useState({});
  const [uploading,  setUploading]  = useState(null);
  const [progress,   setProgress]   = useState(0);
  const [generating, setGenerating] = useState(null); // reqId of AR being generated
  const [genStatus,  setGenStatus]  = useState({});   // { [reqId]: 'generating'|'done'|'error' }

  const load = async () => {
    setLoading(true);
    const [rests, reqs, allItems] = await Promise.all([
      getAllRestaurants(),
      getAllPendingRequests(),
      getAllMenuItemsAllRestaurants(),
    ]);
    let allReqs = [...reqs];
    if (filter !== 'pending') {
      const extras = await Promise.all(rests.map(r => getRequests(r.id, filter).then(rs => rs.map(q => ({ ...q, restaurantId: r.id, restaurantName: r.name })))));
      allReqs = extras.flat().sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    setRestaurants(rests);
    setRequests(filter === 'pending' ? reqs : allReqs);
    setMenuItems(allItems);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (req) => {
    const modelFile = modelFiles[req.id];
    if (!modelFile) { toast.error('Please attach a .glb 3D model first'); return; }
    if (!req.restaurantId) { toast.error('Restaurant ID missing'); return; }
    const rid = req.restaurantId;
    const restaurant = restaurants.find(r => r.id === rid);
    if (!restaurant) { toast.error('Restaurant not found'); return; }
    const sizeMB = fileSizeMB(modelFile);
    if ((restaurant.storageUsedMB || 0) + sizeMB > (restaurant.maxStorageMB || 500)) { toast.error('Restaurant storage limit exceeded'); return; }
    setUploading(req.id); setProgress(0);
    try {
      const modelURL = await uploadFile(modelFile, buildModelPath(rid, modelFile.name), setProgress);
      // Menu item already exists (published at submission) — just unlock AR on it
      await updateDoc(doc(db, 'restaurants', rid, 'menuItems', req.id), {
        modelURL,
        arReady: true,
        updatedAt: serverTimestamp(),
      });
      await updateRequestStatus(rid, req.id, 'approved', modelURL);
      // Only update storage — itemsUsed was incremented at submission time
      await updateRestaurant(rid, { storageUsedMB: parseFloat(((restaurant.storageUsedMB || 0) + sizeMB).toFixed(2)) });
      toast.success(`"${req.name}" AR approved and unlocked!`);
      setModelFiles(f => { const n = { ...f }; delete n[req.id]; return n; });
      load();
    } catch (err) { toast.error('Approval failed: ' + err.message); }
    finally { setUploading(null); setProgress(0); }
  };

  const handleGenerateModel = async (req) => {
    if (!req.imageURL) { toast.error('No dish photo found — upload a photo to the item first'); return; }
    setGenerating(req.id);
    setGenStatus(s => ({ ...s, [req.id]: 'generating' }));
    const toastId = toast.loading('Generating 3D model (this takes ~2 min)…');
    try {
      const res = await fetch('/api/generate-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: req.imageURL, itemName: req.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NO_API_KEY') {
          toast.error('MESHY_API_KEY not configured in .env — see Vercel environment variables', { id: toastId, duration: 6000 });
        } else {
          toast.error(data.error || 'Generation failed', { id: toastId });
        }
        setGenStatus(s => ({ ...s, [req.id]: 'error' }));
        return;
      }
      const glbRes = await fetch(data.modelUrl);
      const blob   = await glbRes.blob();
      const file   = new File([blob], `${req.name.replace(/\s+/g, '_')}_ar.glb`, { type: 'model/gltf-binary' });
      setModelFiles(f => ({ ...f, [req.id]: file }));
      setGenStatus(s => ({ ...s, [req.id]: 'done' }));
      toast.success('3D model generated! Review and click Approve & Publish.', { id: toastId, duration: 5000 });
    } catch (err) {
      toast.error('Generation error: ' + err.message, { id: toastId });
      setGenStatus(s => ({ ...s, [req.id]: 'error' }));
    } finally { setGenerating(null); }
  };

  const handleReject = async (req) => {
    if (!confirm(`Reject "${req.name}"?`)) return;
    await updateRequestStatus(req.restaurantId, req.id, 'rejected');
    toast.success('Request rejected'); load();
  };

  const pendingArCount = menuItems.filter(i => !i.arReady && !i.modelURL).length;

  return (
    <SuperAdminLayout>
      <Head><title>Requests — Super Admin</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .upload-zone:hover { border-color: ${A.warning} !important; background: ${A.shellDarker} !important; }
        `}</style>

        <div style={{ padding: '24px 28px 60px', maxWidth: 1100, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Super Admin</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Requests</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1.1 }}>Menu Requests</div>
            <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>Upload 3D model to unlock AR for items already live on the menu.</div>
          </div>

          {/* Top-level tab switcher */}
          <div style={{ display: 'inline-flex', gap: 0, marginBottom: 20, background: A.shell, border: A.border, borderRadius: 10, padding: 3, boxShadow: A.cardShadow }}>
            {[
              { key: 'requests', label: 'AR Requests' },
              { key: 'items',    label: 'Live Items'  },
            ].map(t => {
              const active = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '8px 18px', borderRadius: 7, border: 'none',
                  fontFamily: A.font, fontSize: 13, fontWeight: active ? 700 : 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? A.ink : 'transparent',
                  color: active ? A.cream : A.mutedText,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  {t.label}
                  {t.key === 'items' && pendingArCount > 0 && (
                    <span style={{
                      padding: '1px 7px', borderRadius: 10,
                      background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.20)',
                      color: active ? A.cream : A.warningDim,
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                    }}>{pendingArCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── AR REQUESTS TAB ── */}
          {activeTab === 'requests' && (<>

            {/* Filter pills (pending/approved/rejected) */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {['pending', 'approved', 'rejected'].map(s => {
                const active = filter === s;
                return (
                  <button key={s} onClick={() => { setFilter(s); setLoading(true); }} style={{
                    padding: '7px 16px', borderRadius: 20,
                    border: active ? `1px solid ${A.ink}` : A.borderStrong,
                    fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                    background: active ? A.ink : A.shell,
                    color: active ? A.cream : A.mutedText,
                    cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s',
                  }}>
                    {s} {active ? `(${requests.length})` : ''}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                <div style={{ width: 28, height: 28, border: `2.5px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : requests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: A.mutedText, background: A.shell, borderRadius: 14, border: A.border }}>
                <div style={{ fontSize: 13 }}>No {filter} requests.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {requests.map(req => {
                  const isExpand = expanded === req.id;
                  const pill = STATUS_PILL[req.status] || STATUS_PILL.pending;
                  return (
                    <div key={req.id} style={{
                      background: A.shell, borderRadius: 14, overflow: 'hidden',
                      border: req.status === 'pending' ? `1px solid rgba(196,168,109,0.25)` : A.border,
                      boxShadow: A.cardShadow,
                    }}>
                      {/* Header row */}
                      <div onClick={() => setExpanded(isExpand ? null : req.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 18px', cursor: 'pointer',
                      }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: A.subtleBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: A.faintText, fontSize: 11 }}>
                          {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '—'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: A.font, fontWeight: 600, fontSize: 14, color: A.ink }}>{req.name}</div>
                          <div style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText, marginTop: 2 }}>{req.restaurantName}</div>
                        </div>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20,
                          fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          background: pill.bg, color: pill.color, border: `1px solid ${pill.border}`,
                          flexShrink: 0,
                        }}>{req.status}</span>
                        <span style={{ color: A.faintText, fontSize: 11, marginLeft: 4 }}>{isExpand ? '▲' : '▼'}</span>
                      </div>

                      {/* Expanded */}
                      {isExpand && (
                        <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', padding: '20px 20px 22px', background: A.shellDarker }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            {/* Item info */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {[['Description', req.description], ['Category', req.category], ['Prep Time', req.prepTime], ['Ingredients', req.ingredients?.join(', ')]].filter(([, v]) => v).map(([k, v]) => (
                                <div key={k}>
                                  <div style={{ fontFamily: A.font, fontSize: 10, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
                                  <div style={{ fontFamily: A.font, fontSize: 13, color: A.ink, lineHeight: 1.5 }}>{v}</div>
                                </div>
                              ))}
                              {req.nutritionalData && (
                                <div>
                                  <div style={{ fontFamily: A.font, fontSize: 10, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Nutrition</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                                    {Object.entries(req.nutritionalData).map(([k, v]) => v != null && (
                                      <div key={k} style={{ background: A.shell, borderRadius: 8, padding: '8px', textAlign: 'center', border: A.border }}>
                                        <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 14, color: A.warningDim }}>{v}</div>
                                        <div style={{ fontFamily: A.font, fontSize: 10, color: A.faintText, textTransform: 'capitalize', marginTop: 2 }}>{k}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 3D model upload (pending only) */}
                            {req.status === 'pending' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ fontFamily: A.font, fontSize: 10, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attach 3D Model (.glb)</div>
                                <div className="upload-zone" onClick={() => document.getElementById(`model-${req.id}`).click()} style={{
                                  border: `2px dashed rgba(0,0,0,0.12)`, borderRadius: 12, padding: 20,
                                  textAlign: 'center', cursor: 'pointer', background: A.shell, transition: 'all 0.15s',
                                }}>
                                  {modelFiles[req.id] ? (
                                    <div>
                                      <div style={{ fontFamily: A.font, fontSize: 12, fontWeight: 700, color: A.success, marginBottom: 4 }}>✓ {modelFiles[req.id].name}</div>
                                      <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText }}>{fileSizeMB(modelFiles[req.id]).toFixed(1)} MB</div>
                                    </div>
                                  ) : (
                                    <div>
                                      <div style={{ fontFamily: A.font, fontSize: 12, color: A.mutedText, marginBottom: 4 }}>Click to upload .glb model</div>
                                      <div style={{ fontFamily: A.font, fontSize: 11, color: A.faintText }}>Max 10MB</div>
                                    </div>
                                  )}
                                  <input id={`model-${req.id}`} type="file" accept=".glb,.gltf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (!f) return; if (fileSizeMB(f) > 10) { toast.error('Model must be under 10MB'); return; } setModelFiles(p => ({ ...p, [req.id]: f })); }} />
                                </div>
                                {uploading === req.id && progress > 0 && (
                                  <div style={{ height: 4, background: A.subtleBg, borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: 99, background: A.warning, width: `${progress}%`, transition: 'width 0.3s' }} />
                                  </div>
                                )}
                                {/* AI Generate from Photo */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <div style={{ flex: 1, height: 1, background: A.subtleBg }} />
                                  <span style={{ fontFamily: A.font, fontSize: 10, color: A.faintText, fontWeight: 700, letterSpacing: '0.06em' }}>OR</span>
                                  <div style={{ flex: 1, height: 1, background: A.subtleBg }} />
                                </div>
                                <button onClick={() => handleGenerateModel(req)} disabled={!!generating || !!uploading} style={{
                                  width: '100%', padding: '11px 14px', borderRadius: 10,
                                  border: `1px solid rgba(196,168,109,0.35)`,
                                  background: genStatus[req.id] === 'done' ? 'rgba(63,158,90,0.08)'
                                            : genStatus[req.id] === 'error' ? 'rgba(217,83,79,0.06)'
                                            : 'rgba(196,168,109,0.08)',
                                  cursor: (!!generating || !!uploading) ? 'not-allowed' : 'pointer',
                                  opacity: (!!generating || !!uploading) ? 0.6 : 1,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                  transition: 'all 0.15s',
                                }}>
                                  <div style={{ textAlign: 'left' }}>
                                    <div style={{
                                      fontFamily: A.font, fontSize: 13, fontWeight: 700,
                                      color: genStatus[req.id] === 'done' ? A.success
                                           : genStatus[req.id] === 'error' ? A.danger
                                           : A.warningDim,
                                    }}>
                                      {generating === req.id ? 'Generating 3D Model…'
                                        : genStatus[req.id] === 'done' ? '3D Model Ready ↓ Approve to publish'
                                        : genStatus[req.id] === 'error' ? 'Generation failed — try again'
                                        : 'Generate 3D from Dish Photo'}
                                    </div>
                                    {generating !== req.id && genStatus[req.id] !== 'done' && (
                                      <div style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText, marginTop: 2 }}>
                                        {req.imageURL ? 'Uses AI to auto-create a .glb from the dish photo (~2 min)' : 'No dish photo — upload one first'}
                                      </div>
                                    )}
                                  </div>
                                </button>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <button onClick={() => handleApprove(req)} disabled={!modelFiles[req.id] || uploading === req.id} style={{
                                    flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none',
                                    background: A.success, color: A.shell,
                                    fontFamily: A.font, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    opacity: (!modelFiles[req.id] || uploading === req.id) ? 0.45 : 1,
                                  }}>
                                    {uploading === req.id ? 'Publishing…' : '✓ Approve & Publish'}
                                  </button>
                                  <button onClick={() => handleReject(req)} disabled={!!uploading} style={{
                                    padding: '11px 16px', borderRadius: 10,
                                    border: `1px solid rgba(217,83,79,0.30)`, background: 'rgba(217,83,79,0.06)',
                                    color: A.danger, fontFamily: A.font, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                  }}>
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>) /* end AR Requests tab */}

          {/* ── LIVE ITEMS TAB ── */}
          {activeTab === 'items' && (() => {
            const filtered = itemFilter === 'all'        ? menuItems
                           : itemFilter === 'pending_ar' ? menuItems.filter(i => !i.arReady && !i.modelURL)
                           :                               menuItems.filter(i =>  i.arReady || i.modelURL);
            return (
              <>
                {/* Sub-filter pills */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                  {[
                    { key: 'all',        label: 'All Items' },
                    { key: 'pending_ar', label: 'Awaiting AR' },
                    { key: 'ar_ready',   label: 'AR Active' },
                  ].map(f => {
                    const active = itemFilter === f.key;
                    const count = f.key === 'all' ? menuItems.length
                                : f.key === 'pending_ar' ? menuItems.filter(i => !i.arReady && !i.modelURL).length
                                : menuItems.filter(i => i.arReady || i.modelURL).length;
                    return (
                      <button key={f.key} onClick={() => setItemFilter(f.key)} style={{
                        padding: '7px 14px', borderRadius: 20,
                        border: active ? `1px solid ${A.ink}` : A.borderStrong,
                        fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                        cursor: 'pointer',
                        background: active ? A.ink : A.shell,
                        color: active ? A.cream : A.mutedText, transition: 'all 0.15s',
                      }}>
                        {f.label} ({count})
                      </button>
                    );
                  })}
                </div>

                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                    <div style={{ width: 28, height: 28, border: `2.5px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: A.mutedText, background: A.shell, borderRadius: 14, border: A.border }}>
                    <div style={{ fontSize: 13 }}>No items found.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                    {filtered.map(item => {
                      const arActive = item.arReady || item.modelURL;
                      return (
                        <div key={item.id + item.restaurantId} style={{
                          background: A.shell, borderRadius: 14,
                          border: A.border, boxShadow: A.cardShadow,
                          padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
                        }}>
                          {/* Image */}
                          <div style={{ width: '100%', height: 140, borderRadius: 10, overflow: 'hidden', background: A.subtleBg, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: A.faintText, fontSize: 13 }}>
                            {item.imageURL
                              ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : 'No photo'}
                            <div style={{
                              position: 'absolute', top: 8, right: 8,
                              padding: '3px 10px', borderRadius: 20,
                              fontFamily: A.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                              background: arActive ? 'rgba(63,158,90,0.92)' : 'rgba(26,26,26,0.85)',
                              color: A.shell, backdropFilter: 'blur(4px)',
                            }}>
                              {arActive ? 'AR Active' : 'Awaiting AR'}
                            </div>
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 14, color: A.ink, marginBottom: 4 }}>{item.name}</div>
                            <div style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText, marginBottom: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{
                                background: 'rgba(196,168,109,0.12)', color: A.warningDim,
                                borderRadius: 6, padding: '1px 7px', fontWeight: 600,
                              }}>
                                {item.restaurantName}
                              </span>
                              {item.category && <span>{item.category}</span>}
                              {item.price && <span style={{ fontWeight: 700, color: A.ink }}>₹{item.price}</span>}
                            </div>
                            {item.description && (
                              <p style={{ fontFamily: A.font, fontSize: 11, color: A.mutedText, lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {item.description}
                              </p>
                            )}
                          </div>

                          {/* Footer */}
                          <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontFamily: A.font, fontSize: 10, color: A.faintText }}>
                              Added {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}
                            </div>
                            <div style={{ display: 'flex', gap: 8, fontFamily: A.font, fontSize: 10, color: A.mutedText }}>
                              {item.views > 0 && <span>{item.views} views</span>}
                              {item.arViews > 0 && <span>{item.arViews} AR</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminRequests.getLayout = (page) => page;
