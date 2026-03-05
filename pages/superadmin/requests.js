// pages/superadmin/requests.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import {
  getAllPendingRequests, getAllRestaurants, getRequests,
  updateRequestStatus, updateRestaurant,
} from '../../lib/db';
import { uploadFile, buildModelPath, buildImagePath, fileSizeMB } from '../../lib/storage';
import { db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function SuperAdminRequests() {
  const [requests,    setRequests]    = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState('pending');
  const [expanded,    setExpanded]    = useState(null);
  const [modelFiles,  setModelFiles]  = useState({}); // { reqId: File }
  const [uploading,   setUploading]   = useState(null);
  const [progress,    setProgress]    = useState(0);

  const load = async () => {
    const [rests, reqs] = await Promise.all([
      getAllRestaurants(),
      getAllPendingRequests(),
    ]);
    // Also fetch approved/rejected from all restaurants
    let allReqs = [...reqs];
    if (filter !== 'pending') {
      const extras = await Promise.all(
        rests.map(r => getRequests(r.id, filter).then(rs => rs.map(q => ({
          ...q, restaurantId: r.id, restaurantName: r.name,
        }))))
      );
      allReqs = extras.flat().sort((a, b) =>
        (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
    }
    setRestaurants(rests);
    setRequests(filter === 'pending' ? reqs : allReqs);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (req) => {
    const modelFile = modelFiles[req.id];
    if (!modelFile) {
      toast.error('Please attach a .glb 3D model first');
      return;
    }
    if (!req.restaurantId) { toast.error('Restaurant ID missing'); return; }

    const rid = req.restaurantId;
    const restaurant = restaurants.find(r => r.id === rid);
    if (!restaurant) { toast.error('Restaurant not found'); return; }

    // Enforce plan limits
    if ((restaurant.itemsUsed || 0) >= (restaurant.maxItems || 10)) {
      toast.error(`Restaurant has reached max items limit (${restaurant.maxItems})`);
      return;
    }
    const sizeMB = fileSizeMB(modelFile);
    if ((restaurant.storageUsedMB || 0) + sizeMB > (restaurant.maxStorageMB || 500)) {
      toast.error('Restaurant storage limit exceeded');
      return;
    }

    setUploading(req.id);
    setProgress(0);
    try {
      // Upload model
      const modelPath = buildModelPath(rid, modelFile.name);
      const modelURL  = await uploadFile(modelFile, modelPath, setProgress);

      // Create menu item
      const menuItemRef = doc(db, 'restaurants', rid, 'menuItems', req.id);
      await setDoc(menuItemRef, {
        name:        req.name,
        description: req.description || '',
        category:    req.category    || '',
        imageURL:    req.imageURL    || null,
        modelURL,
        ingredients: req.ingredients || [],
        calories:    req.nutritionalData?.calories || null,
        protein:     req.nutritionalData?.protein  || null,
        carbs:       req.nutritionalData?.carbs    || null,
        fats:        req.nutritionalData?.fats     || null,
        views:       0,
        arViews:     0,
        isActive:    true,
        createdAt:   serverTimestamp(),
      });

      // Update request status
      await updateRequestStatus(rid, req.id, 'approved', modelURL);

      // Update restaurant storage + item count
      await updateRestaurant(rid, {
        itemsUsed:     (restaurant.itemsUsed     || 0) + 1,
        storageUsedMB: (restaurant.storageUsedMB || 0) + sizeMB,
      });

      toast.success(`"${req.name}" approved and published!`);
      setModelFiles(f => { const n = { ...f }; delete n[req.id]; return n; });
      load();
    } catch (err) {
      toast.error('Approval failed: ' + err.message);
    } finally {
      setUploading(null);
      setProgress(0);
    }
  };

  const handleReject = async (req) => {
    if (!confirm(`Reject "${req.name}"?`)) return;
    await updateRequestStatus(req.restaurantId, req.id, 'rejected');
    toast.success('Request rejected');
    load();
  };

  return (
    <SuperAdminLayout>
      <Head><title>Requests — Super Admin</title></Head>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl">Menu Requests</h1>
          <p className="text-text-secondary text-sm mt-1">
            Review, upload 3D model, and approve items for AR listing.
          </p>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {['pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => { setFilter(s); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filter === s
                  ? 'bg-brand text-white'
                  : 'bg-bg-surface border border-bg-border text-text-secondary'
              }`}
            >
              {s} {filter === s ? `(${requests.length})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 skeleton" />)}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <div className="text-4xl mb-3">📭</div>
            <p>No {filter} requests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => {
              const isExpand = expanded === req.id;
              return (
                <div
                  key={req.id}
                  className={`bg-bg-surface border rounded-2xl overflow-hidden transition-all ${
                    req.status === 'pending' ? 'border-yellow-400/20' : 'border-bg-border'
                  }`}
                >
                  {/* Header row */}
                  <div
                    className="flex items-center gap-4 p-5 cursor-pointer"
                    onClick={() => setExpanded(isExpand ? null : req.id)}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-bg-raised flex-shrink-0">
                      {req.imageURL
                        ? <img src={req.imageURL} alt={req.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{req.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">{req.restaurantName}</div>
                    </div>
                    <StatusBadge status={req.status} />
                    <span className="text-text-muted text-xs ml-2">{isExpand ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded details */}
                  {isExpand && (
                    <div className="border-t border-bg-border px-5 pb-5 pt-4 space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Left — item info */}
                        <div className="space-y-3">
                          {req.description && (
                            <InfoRow label="Description" value={req.description} />
                          )}
                          {req.category && (
                            <InfoRow label="Category" value={req.category} />
                          )}
                          {req.ingredients?.length > 0 && (
                            <InfoRow label="Ingredients" value={req.ingredients.join(', ')} />
                          )}
                          {req.nutritionalData && (
                            <div>
                              <div className="text-xs text-text-muted mb-2">Nutritional Data</div>
                              <div className="grid grid-cols-4 gap-2">
                                {Object.entries(req.nutritionalData).map(([k, v]) => v != null && (
                                  <div key={k} className="bg-bg-raised rounded-lg p-2 text-center">
                                    <div className="text-brand font-bold text-sm">{v}</div>
                                    <div className="text-text-muted text-xs capitalize">{k}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right — 3D model upload (only for pending) */}
                        {req.status === 'pending' && (
                          <div className="space-y-3">
                            <div className="text-xs text-text-secondary font-medium">Attach 3D Model (.glb)</div>
                            <div
                              onClick={() => document.getElementById(`model-${req.id}`).click()}
                              className="border-2 border-dashed border-bg-border rounded-xl p-5 text-center cursor-pointer hover:border-brand/40 transition-all"
                            >
                              {modelFiles[req.id] ? (
                                <div>
                                  <div className="text-2xl mb-1">✅</div>
                                  <div className="text-xs text-green-400 font-medium">
                                    {modelFiles[req.id].name}
                                  </div>
                                  <div className="text-xs text-text-muted">
                                    {fileSizeMB(modelFiles[req.id]).toFixed(1)} MB
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="text-2xl mb-1">📦</div>
                                  <div className="text-xs text-text-secondary">
                                    Click to upload .glb model
                                  </div>
                                  <div className="text-xs text-text-muted mt-0.5">Max 10MB</div>
                                </div>
                              )}
                              <input
                                id={`model-${req.id}`}
                                type="file"
                                accept=".glb,.gltf"
                                className="hidden"
                                onChange={e => {
                                  const f = e.target.files[0];
                                  if (!f) return;
                                  if (fileSizeMB(f) > 10) { toast.error('Model must be under 10MB'); return; }
                                  setModelFiles(prev => ({ ...prev, [req.id]: f }));
                                }}
                              />
                            </div>

                            {uploading === req.id && progress > 0 && (
                              <div className="w-full h-1.5 bg-bg-raised rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #FF6B35, #FFB347)' }}
                                />
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprove(req)}
                                disabled={!modelFiles[req.id] || uploading === req.id}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                                style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)' }}
                              >
                                {uploading === req.id ? 'Publishing…' : '✓ Approve & Publish'}
                              </button>
                              <button
                                onClick={() => handleReject(req)}
                                disabled={!!uploading}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-red-400/10 text-red-400 border border-red-400/20 hover:bg-red-400/20 transition-all"
                              >
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
      </div>
    </SuperAdminLayout>
  );
}

SuperAdminRequests.getLayout = (page) => page;

function InfoRow({ label, value }) {
  return (
    <div>
      <div className="text-xs text-text-muted mb-0.5">{label}</div>
      <div className="text-sm text-text-secondary">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending:  'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
    approved: 'bg-green-400/10  text-green-400  border-green-400/20',
    rejected: 'bg-red-400/10    text-red-400    border-red-400/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending} capitalize`}>
      {status}
    </span>
  );
}
