// pages/admin/tables.js
//
// Table View — the floor-plan POS screen (Phase 0).
//
// STEP 2 (this commit): "Manage Layout" mode only — admins add/edit/
// delete Areas (A/C, Rooftop, Bar…) and the Tables inside each. The
// data lands in restaurants/{rid}/areas + /tables (see lib/db.js).
//
// STEP 4 (next): a "Live View" mode is added to THIS page — the same
// areas/tables rendered as a colour-coded status grid (blank / running
// / KOT / printed / paid) derived from tableBills + orders, with
// per-table quick actions. The mode toggle is already scaffolded below
// so step 4 only has to fill in the live grid.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  createArea, updateArea, deleteArea,
  createTable, updateTable, deleteTable,
} from '../../lib/db';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as the other admin pages ═══
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
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
  background: A.ink, color: A.cream, fontFamily: A.font, fontSize: 13, fontWeight: 600,
};
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
  background: A.shell, border: A.borderStrong, color: A.ink, fontFamily: A.font, fontSize: 12, fontWeight: 600,
};
const inputStyle = {
  padding: '9px 12px', borderRadius: 8, border: A.borderStrong,
  fontSize: 13, fontFamily: A.font, color: A.ink, outline: 'none', background: A.shell, boxSizing: 'border-box',
};

export default function AdminTables() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;

  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // Inline-form state
  const [newAreaName, setNewAreaName] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [tableForm, setTableForm] = useState(null); // { areaId, label, code, capacity } | null
  const [editingArea, setEditingArea] = useState(null); // { id, name } | null
  const [editingTable, setEditingTable] = useState(null); // { id, label, code, capacity, areaId } | null

  // Redirect to login if unauthenticated once auth resolves.
  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [loading, user, router]);

  // Live subscriptions to areas + tables.
  useEffect(() => {
    if (!rid) return;
    let n = 0;
    const done = () => { if (++n >= 2) setDataLoaded(true); };
    const ua = onSnapshot(
      query(collection(db, 'restaurants', rid, 'areas'), orderBy('sortOrder', 'asc')),
      snap => { setAreas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); },
      () => done()
    );
    const ut = onSnapshot(
      query(collection(db, 'restaurants', rid, 'tables'), orderBy('sortOrder', 'asc')),
      snap => { setTables(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); },
      () => done()
    );
    return () => { ua(); ut(); };
  }, [rid]);

  const tablesByArea = useMemo(() => {
    const map = {};
    for (const t of tables) {
      const k = t.areaId || '_unassigned';
      (map[k] = map[k] || []).push(t);
    }
    return map;
  }, [tables]);

  // ── Area handlers ───────────────────────────────────────────
  const handleAddArea = async () => {
    const name = newAreaName.trim();
    if (!name) { toast.error('Enter an area name'); return; }
    try {
      await createArea(rid, { name, sortOrder: areas.length });
      setNewAreaName(''); setAddingArea(false);
      toast.success(`Area "${name}" added`);
    } catch (e) { toast.error('Could not add area: ' + (e?.message || 'error')); }
  };

  const handleRenameArea = async () => {
    const name = (editingArea?.name || '').trim();
    if (!name) { toast.error('Enter an area name'); return; }
    try {
      await updateArea(rid, editingArea.id, { name });
      setEditingArea(null);
      toast.success('Area renamed');
    } catch (e) { toast.error('Could not rename: ' + (e?.message || 'error')); }
  };

  const requestDeleteArea = (area) => {
    const count = (tablesByArea[area.id] || []).length;
    setConfirm({
      title: `Delete "${area.name}"?`,
      body: count > 0
        ? `This area has ${count} table${count === 1 ? '' : 's'}. They'll become unassigned (not deleted). You can move them to another area afterwards.`
        : 'This area has no tables. It will be removed.',
      confirmLabel: 'Delete area',
      destructive: true,
      onConfirm: async () => {
        // Unassign tables in this area first so they aren't orphaned to a
        // dead areaId, then delete the area doc.
        const inArea = tablesByArea[area.id] || [];
        await Promise.all(inArea.map(t => updateTable(rid, t.id, { areaId: null })));
        await deleteArea(rid, area.id);
        toast.success('Area deleted');
      },
    });
  };

  // ── Table handlers ──────────────────────────────────────────
  const handleSaveTable = async () => {
    const f = tableForm;
    const label = (f.label || '').trim();
    const code = (f.code || '').trim();
    if (!label) { toast.error('Enter a table name'); return; }
    if (!code)  { toast.error('Enter a QR code/number'); return; }
    // Code must be URL-safe-ish (it becomes the QR path segment)
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) {
      toast.error('Code: letters/digits/-/_ only, max 12 chars');
      return;
    }
    // Prevent duplicate codes (they map to one tableSessions doc each)
    if (tables.some(t => (t.code || '').toLowerCase() === code.toLowerCase())) {
      toast.error(`Code "${code}" is already used by another table`);
      return;
    }
    try {
      const areaTables = tablesByArea[f.areaId] || [];
      await createTable(rid, {
        label, code, areaId: f.areaId || null,
        capacity: Number(f.capacity) || 4,
        sortOrder: areaTables.length,
      });
      setTableForm(null);
      toast.success(`Table "${label}" added`);
    } catch (e) { toast.error('Could not add table: ' + (e?.message || 'error')); }
  };

  const handleUpdateTable = async () => {
    const f = editingTable;
    const label = (f.label || '').trim();
    const code = (f.code || '').trim();
    if (!label) { toast.error('Enter a table name'); return; }
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) { toast.error('Code: letters/digits/-/_ only, max 12'); return; }
    if (tables.some(t => t.id !== f.id && (t.code || '').toLowerCase() === code.toLowerCase())) {
      toast.error(`Code "${code}" is already used`); return;
    }
    try {
      await updateTable(rid, f.id, { label, code, capacity: Number(f.capacity) || 4 });
      setEditingTable(null);
      toast.success('Table updated');
    } catch (e) { toast.error('Could not update: ' + (e?.message || 'error')); }
  };

  const requestDeleteTable = (t) => {
    setConfirm({
      title: `Delete "${t.label}"?`,
      body: 'The table is removed from the floor plan. Its QR code/number stops resolving. Any past orders stay in your records.',
      confirmLabel: 'Delete table',
      destructive: true,
      onConfirm: async () => { await deleteTable(rid, t.id); toast.success('Table deleted'); },
    });
  };

  // ── Render ──────────────────────────────────────────────────
  if (loading || !user) {
    return <AdminLayout><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></AdminLayout>;
  }

  const totalTables = tables.length;

  return (
    <>
      <Head><title>Table View — HaloHelm</title></Head>
      <AdminLayout>
        <div style={{ padding: '28px 26px', maxWidth: 1100, margin: '0 auto', fontFamily: A.font, color: A.ink }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Table View</h1>
              <p style={{ fontSize: 14, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5, maxWidth: 560 }}>
                Build your floor plan — areas and the tables inside them. Each table's <strong>code</strong> is its QR identity
                (it powers the <code style={{ background: A.subtleBg, padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>/r/{'{'}subdomain{'}'}/{'{'}code{'}'}</code> QR link).
              </p>
            </div>
            <div style={{ fontSize: 12, color: A.faintText, fontWeight: 600, whiteSpace: 'nowrap', paddingTop: 6 }}>
              {areas.length} area{areas.length === 1 ? '' : 's'} · {totalTables} table{totalTables === 1 ? '' : 's'}
            </div>
          </div>

          {/* A subtle note that the live status grid is coming */}
          <div style={{ margin: '14px 0 24px', padding: '10px 14px', background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.28)', borderRadius: 10, fontSize: 12.5, color: A.warningDim, fontWeight: 600 }}>
            Manage Layout mode. The live colour-coded status grid (running / KOT / printed / paid) plugs into this same screen next.
          </div>

          {/* Add area control */}
          {!addingArea ? (
            <button style={{ ...btnPrimary, marginBottom: 22 }} onClick={() => setAddingArea(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add area
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginBottom: 22, alignItems: 'center', flexWrap: 'wrap' }}>
              <input autoFocus style={{ ...inputStyle, width: 240 }} placeholder="Area name (e.g. Rooftop, A/C, Bar)"
                value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddArea()} />
              <button style={btnPrimary} onClick={handleAddArea}>Add</button>
              <button style={btnGhost} onClick={() => { setAddingArea(false); setNewAreaName(''); }}>Cancel</button>
            </div>
          )}

          {/* Empty state */}
          {dataLoaded && areas.length === 0 && (tablesByArea._unassigned || []).length === 0 && (
            <EmptyState
              title="No areas yet"
              subtitle="Start by adding an area like “A/C”, “Rooftop”, or “Bar”, then add the tables inside it."
            />
          )}

          {/* Areas + their tables */}
          {areas.map(area => {
            const at = tablesByArea[area.id] || [];
            return (
              <div key={area.id} style={{ marginBottom: 26 }}>
                {/* Area header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  {editingArea?.id === area.id ? (
                    <>
                      <input autoFocus style={{ ...inputStyle, width: 200 }} value={editingArea.name}
                        onChange={e => setEditingArea({ ...editingArea, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handleRenameArea()} />
                      <button style={btnPrimary} onClick={handleRenameArea}>Save</button>
                      <button style={btnGhost} onClick={() => setEditingArea(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.2px' }}>{area.name}</h2>
                      <span style={{ fontSize: 12, color: A.faintText, fontWeight: 600 }}>{at.length} table{at.length === 1 ? '' : 's'}</span>
                      <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => setEditingArea({ id: area.id, name: area.name })}>Rename</button>
                      <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11, color: A.danger, borderColor: 'rgba(217,83,79,0.30)' }} onClick={() => requestDeleteArea(area)}>Delete</button>
                    </>
                  )}
                </div>

                {/* Tables grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                  {at.map(t => (
                    <div key={t.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: 14, boxShadow: A.cardShadow }}>
                      {editingTable?.id === t.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <input style={inputStyle} placeholder="Name" value={editingTable.label} onChange={e => setEditingTable({ ...editingTable, label: e.target.value })} />
                          <input style={inputStyle} placeholder="Code" value={editingTable.code} onChange={e => setEditingTable({ ...editingTable, code: e.target.value })} />
                          <input style={inputStyle} type="number" min="1" placeholder="Seats" value={editingTable.capacity} onChange={e => setEditingTable({ ...editingTable, capacity: e.target.value })} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }} onClick={handleUpdateTable}>Save</button>
                            <button style={btnGhost} onClick={() => setEditingTable(null)}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                          <div style={{ fontSize: 12, color: A.mutedText, marginTop: 3 }}>
                            <span style={{ fontFamily: 'monospace', background: A.subtleBg, padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                            <span style={{ marginLeft: 8 }}>{t.capacity || 4} seats</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => setEditingTable({ id: t.id, label: t.label, code: t.code, capacity: t.capacity || 4, areaId: t.areaId })}>Edit</button>
                            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11, color: A.danger, borderColor: 'rgba(217,83,79,0.30)' }} onClick={() => requestDeleteTable(t)}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add-table tile */}
                  {tableForm?.areaId === area.id ? (
                    <div style={{ background: A.shellDarker, border: A.borderStrong, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <input autoFocus style={inputStyle} placeholder="Name (e.g. Table 1)" value={tableForm.label} onChange={e => setTableForm({ ...tableForm, label: e.target.value })} />
                      <input style={inputStyle} placeholder="Code (e.g. 1, A1)" value={tableForm.code} onChange={e => setTableForm({ ...tableForm, code: e.target.value })} />
                      <input style={inputStyle} type="number" min="1" placeholder="Seats" value={tableForm.capacity} onChange={e => setTableForm({ ...tableForm, capacity: e.target.value })} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }} onClick={handleSaveTable}>Add</button>
                        <button style={btnGhost} onClick={() => setTableForm(null)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setTableForm({ areaId: area.id, label: '', code: '', capacity: 4 })}
                      style={{ background: 'transparent', border: `1.5px dashed rgba(0,0,0,0.16)`, borderRadius: 12, padding: 14, cursor: 'pointer', color: A.mutedText, fontFamily: A.font, fontSize: 13, fontWeight: 600, minHeight: 86, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>+</span> Add table
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Unassigned tables (e.g. orphaned after an area delete) */}
          {(tablesByArea._unassigned || []).length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', color: A.danger }}>Unassigned</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {tablesByArea._unassigned.map(t => (
                  <div key={t.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: 14, boxShadow: A.cardShadow }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: A.mutedText, marginTop: 3 }}>
                      <span style={{ fontFamily: 'monospace', background: A.subtleBg, padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                    </div>
                    {/* Move-to-area picker */}
                    {areas.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={async (e) => { if (e.target.value) { await updateTable(rid, t.id, { areaId: e.target.value }); toast.success('Moved'); } }}
                        style={{ ...inputStyle, marginTop: 10, width: '100%' }}>
                        <option value="" disabled>Move to area…</option>
                        {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                    <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11, color: A.danger, borderColor: 'rgba(217,83,79,0.30)', marginTop: 8 }} onClick={() => requestDeleteTable(t)}>Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AdminLayout>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}
