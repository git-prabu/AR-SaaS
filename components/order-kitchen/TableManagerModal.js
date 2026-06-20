// components/order-kitchen/TableManagerModal.js
//
// Floor-plan editor in a modal (owner request, 20 Jun 2026). The new
// Orders → Floor is now the daily-use floor, but it had no way to add or
// edit tables the way the old /admin/tables "Manage Layout" mode did.
// This brings that editor onto the new floor without leaving it.
//
// It's a thin presentational shell over the SAME db CRUD the old page uses
// (createTable / updateTable / deleteTable + createArea / updateArea /
// deleteArea). Those write through the admin `db`, so this is OWNER-ONLY —
// the parent only mounts it for isAdmin. `areas` + `tables` come in as
// props (the Orders page already subscribes to them live), so edits reflect
// the moment Firestore echoes them back.

import React, { useMemo, useState } from 'react';
import {
  createArea, updateArea, deleteArea,
  createTable, updateTable, deleteTable,
} from '../../lib/db';
import ConfirmModal from '../ConfirmModal';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  danger: '#D9534F', mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)', cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', background: A.ink, color: A.cream, fontFamily: A.font, fontSize: 13, fontWeight: 600 };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, cursor: 'pointer', background: A.shell, border: A.borderStrong, color: A.ink, fontFamily: A.font, fontSize: 12, fontWeight: 600 };
const inputStyle = { padding: '9px 12px', borderRadius: 8, border: A.borderStrong, fontSize: 13, fontFamily: A.font, color: A.ink, outline: 'none', background: A.shell, boxSizing: 'border-box' };

const CODE_RE = /^[A-Za-z0-9_-]{1,12}$/;

export default function TableManagerModal({ rid, areas = [], tables = [], onClose }) {
  const [newAreaName, setNewAreaName] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [tableForm, setTableForm] = useState(null);   // { areaId, label, code, capacity }
  const [editingArea, setEditingArea] = useState(null); // { id, name }
  const [editingTable, setEditingTable] = useState(null); // { id, label, code, capacity, areaId }
  const [confirm, setConfirm] = useState(null);
  const [importCount, setImportCount] = useState('12');
  const [importing, setImporting] = useState(false);

  const tablesByArea = useMemo(() => {
    const map = {};
    for (const t of tables) { const k = t.areaId || '_unassigned'; (map[k] = map[k] || []).push(t); }
    return map;
  }, [tables]);

  // ── Area handlers ──────────────────────────────────────────────
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
    try { await updateArea(rid, editingArea.id, { name }); setEditingArea(null); toast.success('Area renamed'); }
    catch (e) { toast.error('Could not rename: ' + (e?.message || 'error')); }
  };
  const requestDeleteArea = (area) => {
    const count = (tablesByArea[area.id] || []).length;
    setConfirm({
      title: `Delete "${area.name}"?`,
      body: count > 0
        ? `This area has ${count} table${count === 1 ? '' : 's'}. They'll become unassigned (not deleted) — move them to another area afterwards.`
        : 'This area has no tables. It will be removed.',
      confirmLabel: 'Delete area', destructive: true,
      onConfirm: async () => {
        const inArea = tablesByArea[area.id] || [];
        await Promise.all(inArea.map(t => updateTable(rid, t.id, { areaId: null })));
        await deleteArea(rid, area.id);
        toast.success('Area deleted');
      },
    });
  };

  // ── Table handlers ─────────────────────────────────────────────
  const handleSaveTable = async () => {
    const f = tableForm;
    const label = (f.label || '').trim();
    const code = (f.code || '').trim();
    if (!label) { toast.error('Enter a table name'); return; }
    if (!code)  { toast.error('Enter a QR code/number'); return; }
    if (!CODE_RE.test(code)) { toast.error('Code: letters/digits/-/_ only, max 12 chars'); return; }
    if (tables.some(t => (t.code || '').toLowerCase() === code.toLowerCase())) {
      toast.error(`Code "${code}" is already used by another table`); return;
    }
    try {
      const areaTables = tablesByArea[f.areaId] || [];
      await createTable(rid, { label, code, areaId: f.areaId || null, capacity: Number(f.capacity) || 4, sortOrder: areaTables.length });
      setTableForm(null);
      toast.success(`Table "${label}" added`);
    } catch (e) { toast.error('Could not add table: ' + (e?.message || 'error')); }
  };
  const handleUpdateTable = async () => {
    const f = editingTable;
    const label = (f.label || '').trim();
    const code = (f.code || '').trim();
    if (!label) { toast.error('Enter a table name'); return; }
    if (!CODE_RE.test(code)) { toast.error('Code: letters/digits/-/_ only, max 12'); return; }
    if (tables.some(t => t.id !== f.id && (t.code || '').toLowerCase() === code.toLowerCase())) {
      toast.error(`Code "${code}" is already used`); return;
    }
    try { await updateTable(rid, f.id, { label, code, capacity: Number(f.capacity) || 4 }); setEditingTable(null); toast.success('Table updated'); }
    catch (e) { toast.error('Could not update: ' + (e?.message || 'error')); }
  };
  const requestDeleteTable = (t) => {
    setConfirm({
      title: `Delete "${t.label}"?`,
      body: 'The table is removed from the floor plan. Its QR code/number stops resolving. Past orders stay in your records.',
      confirmLabel: 'Delete table', destructive: true,
      onConfirm: async () => { await deleteTable(rid, t.id); toast.success('Table deleted'); },
    });
  };
  const handleImport = async () => {
    const n = Math.max(1, Math.min(100, Math.floor(Number(importCount) || 0)));
    if (!n) { toast.error('Enter how many tables (1–100)'); return; }
    setImporting(true);
    try {
      let mainAreaId = areas.find(a => (a.name || '').toLowerCase() === 'main')?.id;
      if (!mainAreaId) { const ref = await createArea(rid, { name: 'Main', sortOrder: 0 }); mainAreaId = ref.id; }
      const existing = new Set(tables.map(t => (t.code || '').toLowerCase()));
      let created = 0;
      for (let i = 1; i <= n; i++) {
        const code = String(i);
        if (existing.has(code)) continue;
        await createTable(rid, { label: `Table ${i}`, code, areaId: mainAreaId, capacity: 4, sortOrder: i });
        created += 1;
      }
      toast.success(created ? `Added ${created} table${created === 1 ? '' : 's'} to "Main"` : 'All those tables already exist');
    } catch (e) { toast.error('Import failed: ' + (e?.message || 'error')); }
    finally { setImporting(false); }
  };

  const isEmpty = areas.length === 0 && (tablesByArea._unassigned || []).length === 0;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4% 12px 12px', overflowY: 'auto',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          width: '100%', maxWidth: 760, background: A.cream, borderRadius: 18,
          boxShadow: '0 24px 70px rgba(0,0,0,0.45)', fontFamily: A.font, color: A.ink,
          display: 'flex', flexDirection: 'column', maxHeight: '92vh',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', borderBottom: A.border }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.faintText }}>Floor plan</div>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px', marginTop: 2 }}>Manage tables</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ ...btnGhost, padding: '7px 11px', fontSize: 15 }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
            {/* Add area */}
            {!addingArea ? (
              <button style={{ ...btnPrimary, marginBottom: 18 }} onClick={() => setAddingArea(true)}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add area
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <input autoFocus style={{ ...inputStyle, width: 240 }} placeholder="Area name (e.g. Rooftop, A/C, Bar)"
                  value={newAreaName} onChange={e => setNewAreaName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddArea()} />
                <button style={btnPrimary} onClick={handleAddArea}>Add</button>
                <button style={btnGhost} onClick={() => { setAddingArea(false); setNewAreaName(''); }}>Cancel</button>
              </div>
            )}

            {/* Empty-state quick import */}
            {isEmpty && (
              <div style={{ maxWidth: 460, margin: '6px auto', padding: '18px 20px', background: A.shell, border: A.borderStrong, borderRadius: 14, boxShadow: A.cardShadow, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Quick start</div>
                <div style={{ fontSize: 13, color: A.mutedText, marginBottom: 14, lineHeight: 1.5 }}>
                  Create a batch of numbered tables in a “Main” area — rename, move, or split them into areas afterwards:
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min="1" max="100" style={{ ...inputStyle, width: 90, textAlign: 'center' }} value={importCount} onChange={e => setImportCount(e.target.value)} />
                  <button style={{ ...btnPrimary, opacity: importing ? 0.6 : 1 }} disabled={importing} onClick={handleImport}>
                    {importing ? 'Adding…' : `Create ${Math.max(1, Math.min(100, Math.floor(Number(importCount) || 12)))} tables`}
                  </button>
                </div>
              </div>
            )}

            {/* Areas + their tables */}
            {areas.map(area => {
              const at = tablesByArea[area.id] || [];
              return (
                <div key={area.id} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    {editingArea?.id === area.id ? (
                      <>
                        <input autoFocus style={{ ...inputStyle, width: 200 }} value={editingArea.name}
                          onChange={e => setEditingArea({ ...editingArea, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleRenameArea()} />
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
                      <button onClick={() => setTableForm({ areaId: area.id, label: '', code: '', capacity: 4 })}
                        style={{ background: 'transparent', border: '1.5px dashed rgba(0,0,0,0.16)', borderRadius: 12, padding: 14, cursor: 'pointer', color: A.mutedText, fontFamily: A.font, fontSize: 13, fontWeight: 600, minHeight: 86, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span style={{ fontSize: 16 }}>+</span> Add table
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unassigned tables */}
            {(tablesByArea._unassigned || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', color: A.danger }}>Unassigned</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                  {tablesByArea._unassigned.map(t => (
                    <div key={t.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: 14, boxShadow: A.cardShadow }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: A.mutedText, marginTop: 3 }}>
                        <span style={{ fontFamily: 'monospace', background: A.subtleBg, padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                      </div>
                      {areas.length > 0 && (
                        <select defaultValue="" onChange={async (e) => { if (e.target.value) { await updateTable(rid, t.id, { areaId: e.target.value }); toast.success('Moved'); } }}
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
        </div>
      </div>

      <ConfirmModal
        open={!!confirm} title={confirm?.title} body={confirm?.body}
        confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}
