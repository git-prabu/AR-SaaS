// pages/admin/notifications.js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getWaiterCalls, resolveWaiterCall, deleteWaiterCall } from '../../lib/db';
import toast from 'react-hot-toast';

const REASON_MAP = {
  water:      { emoji: '💧', label: 'Need Water',      color: '#4A80C0', bg: 'rgba(74,128,192,0.1)' },
  bill:       { emoji: '🧾', label: 'Need Bill',       color: '#8A5AC4', bg: 'rgba(138,90,196,0.1)' },
  assistance: { emoji: '🙋', label: 'Need Assistance', color: '#E05A3A', bg: 'rgba(224,90,58,0.1)'  },
  order:      { emoji: '📋', label: 'Ready to Order',  color: '#5A9A78', bg: 'rgba(90,154,120,0.1)' },
};

const S = {
  card: { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:   { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:  { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
};

function timeAgo(seconds) {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export default function AdminNotifications() {
  const { userData }                  = useAuth();
  const [calls,     setCalls]         = useState([]);
  const [loading,   setLoading]       = useState(true);
  const [resolving, setResolving]     = useState(null);
  const [tab,       setTab]           = useState('pending'); // 'pending' | 'resolved'
  const prevCountRef                  = useRef(0);
  const audioRef                      = useRef(null);
  const rid = userData?.restaurantId;

  const load = async (silent = false) => {
    if (!rid) return;
    if (!silent) setLoading(true);
    try {
      const data = await getWaiterCalls(rid);
      const pending = data.filter(c => c.status === 'pending');
      // Play sound if new pending calls appeared
      if (silent && pending.length > prevCountRef.current) {
        audioRef.current?.play().catch(() => {});
        toast('🔔 New waiter call!', { icon: '🔔', duration: 4000 });
      }
      prevCountRef.current = pending.length;
      setCalls(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [rid]);

  // Poll every 15 seconds for new calls
  useEffect(() => {
    if (!rid) return;
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [rid]);

  const handleResolve = async (call) => {
    setResolving(call.id);
    try {
      await resolveWaiterCall(rid, call.id);
      toast.success('Marked as resolved');
      await load(true);
    } catch { toast.error('Failed to resolve'); }
    finally { setResolving(null); }
  };

  const handleDelete = async (call) => {
    if (!confirm('Delete this call record?')) return;
    try {
      await deleteWaiterCall(rid, call.id);
      toast.success('Deleted');
      await load(true);
    } catch { toast.error('Failed to delete'); }
  };

  const pending  = calls.filter(c => c.status === 'pending');
  const resolved = calls.filter(c => c.status === 'resolved');
  const shown    = tab === 'pending' ? pending : resolved;

  return (
    <AdminLayout>
      <Head><title>Notifications — Advert Radical</title></Head>

      {/* Inaudible ping sound via oscillator — no file needed */}
      <audio ref={audioRef} style={{ display:'none' }}>
        <source src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" />
      </audio>

      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>🔔 Notifications</h1>
              <p style={S.sub}>Live waiter call requests from your customers. Auto-refreshes every 15 seconds.</p>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {pending.length > 0 && (
                <div style={{ padding:'8px 16px', borderRadius:12, background:'rgba(224,90,58,0.12)', border:'1px solid rgba(224,90,58,0.25)', fontSize:13, fontWeight:700, color:'#C04A28' }}>
                  ⚡ {pending.length} pending
                </div>
              )}
              <button onClick={() => load()} style={{ padding:'8px 16px', borderRadius:12, border:'1.5px solid rgba(42,31,16,0.12)', background:'#fff', fontSize:13, fontWeight:600, color:'rgba(42,31,16,0.6)', cursor:'pointer' }}>
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            {[['pending','Pending',pending.length],['resolved','Resolved',resolved.length]].map(([id,label,count]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ padding:'9px 20px', borderRadius:30, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background: tab===id ? '#1E1B18' : '#fff', color: tab===id ? '#FFF5E8' : 'rgba(42,31,16,0.55)', boxShadow: tab===id ? '0 2px 8px rgba(30,27,24,0.18)' : '0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                {label} {count > 0 && <span style={{ marginLeft:6, background: tab===id ? 'rgba(255,255,255,0.2)' : 'rgba(42,31,16,0.08)', borderRadius:99, padding:'1px 7px', fontSize:11 }}>{count}</span>}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : shown.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>{tab==='pending' ? '✅' : '📭'}</div>
              <p style={{ fontSize:15, fontWeight:600 }}>{tab==='pending' ? 'All clear — no pending requests' : 'No resolved calls yet'}</p>
              <p style={{ fontSize:13, marginTop:6 }}>{tab==='pending' ? 'New waiter calls will appear here automatically.' : 'Resolved calls will be archived here.'}</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {shown.map(call => {
                const info = REASON_MAP[call.reason] || { emoji:'🔔', label: call.reason, color:'#8B6010', bg:'rgba(139,96,16,0.1)' };
                const secs = call.createdAt?.seconds || 0;
                return (
                  <div key={call.id} style={{ ...S.card, padding:'18px 22px', display:'flex', alignItems:'center', gap:16, animation:'fadeIn 0.25s ease' }}>
                    {/* Reason badge */}
                    <div style={{ width:52, height:52, borderRadius:16, background:info.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>
                      {info.emoji}
                    </div>

                    {/* Details */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18' }}>{info.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:info.bg, color:info.color }}>{info.label}</span>
                        {call.status === 'resolved' && (
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(90,154,120,0.12)', color:'#1A5A38' }}>✓ Resolved</span>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:16, marginTop:5, flexWrap:'wrap' }}>
                        {call.tableNumber && call.tableNumber !== 'Not specified' && (
                          <span style={{ fontSize:12, color:'rgba(42,31,16,0.55)' }}>🪑 Table: <strong>{call.tableNumber}</strong></span>
                        )}
                        <span style={{ fontSize:12, color:'rgba(42,31,16,0.4)' }}>🕐 {timeAgo(secs)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                      {call.status === 'pending' && (
                        <button onClick={() => handleResolve(call)} disabled={resolving===call.id}
                          style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:12, fontWeight:700, cursor:'pointer', opacity:resolving===call.id?0.6:1, transition:'all 0.15s' }}>
                          {resolving===call.id ? '…' : '✓ Done'}
                        </button>
                      )}
                      <button onClick={() => handleDelete(call)}
                        style={{ padding:'8px 10px', borderRadius:10, border:'1.5px solid rgba(244,160,176,0.4)', background:'rgba(244,160,176,0.08)', color:'#8B1A2A', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* How it works hint */}
          <div style={{ marginTop:28, padding:'16px 20px', borderRadius:14, background:'rgba(247,155,61,0.07)', border:'1px solid rgba(247,155,61,0.2)', fontSize:12, color:'rgba(42,31,16,0.55)' }}>
            <strong style={{ color:'#1E1B18' }}>How it works:</strong> Customers tap the 🔔 button on your menu page, choose a reason, and their request appears here instantly. Keep this page open on a tablet at your restaurant for live monitoring.
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

AdminNotifications.getLayout = (page) => page;
