// pages/admin/roles.js
//
// Phase 8 (RBAC) Stage A — the Roles & Permissions matrix. The owner
// creates custom access roles (Cashier, Manager, Front-man…) and ticks,
// per role, which admin features it can use — exactly the checklist grid
// the owner sketched (features down the side, roles across the top).
//
// STAGE A is management-only: this page defines roles and you assign them
// to staff on the Staff page. The actual access (login token + database
// rules + page access) switches on feature-by-feature in the next stage,
// so nothing a staffer can currently reach changes yet.
//
// Owner-only areas (Subscription/billing, your account Security, Payment
// Gateway) are intentionally absent from the grid and can never be granted.
import Head from 'next/head';
import { useEffect, useMemo, useState, Fragment } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { createStaffRole, updateStaffRole, deleteStaffRole } from '../../lib/db';
import { PERMISSION_GROUPS, BUILTIN_ROLES } from '../../lib/permissions';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F', info: '#2D7DD2',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  cellBorder: '1px solid rgba(0,0,0,0.07)',
};

export default function AdminRoles() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;

  const [roles, setRoles] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [loading, user, router]);

  useEffect(() => {
    if (!rid) return;
    // No orderBy — a freshly-added role's serverTimestamp is briefly null,
    // which an orderBy('createdAt') query would hide. Sort client-side.
    const un = onSnapshot(collection(db, 'restaurants', rid, 'staffRoles'),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.createdAt?.seconds || 1e15) - (b.createdAt?.seconds || 1e15));
        setRoles(list);
        setLoaded(true);
      },
      () => setLoaded(true));
    return un;
  }, [rid]);

  const totalPerms = useMemo(() => PERMISSION_GROUPS.reduce((n, g) => n + g.perms.length, 0), []);

  const addRole = async () => {
    const name = newName.trim() || 'New role';
    setAdding(true);
    try {
      await createStaffRole(rid, { name, permissions: [] });
      setNewName('');
      toast.success(`Role “${name}” created`);
    } catch (e) {
      toast.error('Could not create role: ' + (e?.message || 'error'));
    } finally { setAdding(false); }
  };

  // Optimistic toggle — flip locally, then persist. onSnapshot reconciles.
  const togglePerm = (role, key) => {
    const has = (role.permissions || []).includes(key);
    const next = has ? role.permissions.filter(k => k !== key) : [...(role.permissions || []), key];
    setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: next } : r));
    updateStaffRole(rid, role.id, { permissions: next }).catch(() => {
      toast.error('Could not save — please retry');
    });
  };

  const renameRole = (role, value) => {
    const name = value.trim();
    if (!name || name === role.name) return;
    updateStaffRole(rid, role.id, { name }).catch(() => toast.error('Rename failed'));
  };

  const requestDelete = (role) => setConfirm({
    title: `Delete the “${role.name}” role?`,
    body: 'Staff assigned to it fall back to their default access. This cannot be undone.',
    confirmLabel: 'Delete role', destructive: true,
    onConfirm: async () => { await deleteStaffRole(rid, role.id); toast.success('Role deleted'); },
  });

  if (loading || !user) {
    return <AdminLayout><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></AdminLayout>;
  }

  const th = { padding: '10px 12px', borderBottom: A.cellBorder, fontSize: 12, fontWeight: 700, color: A.ink, textAlign: 'center', minWidth: 130, verticalAlign: 'top', background: A.shellDarker };
  const firstCol = { position: 'sticky', left: 0, zIndex: 2, background: A.shell, textAlign: 'left', minWidth: 190 };

  return (
    <>
      <Head><title>Roles & Permissions — HaloHelm</title></Head>
      <AdminLayout>
        <div style={{ padding: '28px 26px', maxWidth: 1100, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Roles &amp; Permissions</h1>
            <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
              Every staff member gets ONE role. <b>Kitchen</b> and <b>Waiter</b> are built in (below); create your own roles and tick what each can use. Assign a role to a person on the <b>Staff</b> page.
            </p>
          </div>

          {/* Built-in station roles — always available, not editable. They map
              to the dedicated Kitchen Display / Waiter Dashboard screens and
              appear in the staff Role picker alongside the custom roles below. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            {BUILTIN_ROLES.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: A.shellDarker, border: A.border, borderRadius: 10, minWidth: 210 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.warningDim, background: 'rgba(196,168,109,0.14)', padding: '3px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>Built-in</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: A.ink }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: A.mutedText }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Add role */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !adding) addRole(); }}
              placeholder="New role name (e.g. Cashier, Manager)"
              style={{ flex: '0 1 320px', padding: '10px 13px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9, fontSize: 14, fontFamily: A.font, outline: 'none' }} />
            <button onClick={addRole} disabled={adding}
              style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: A.ink, color: A.cream, fontSize: 13.5, fontWeight: 700, fontFamily: A.font, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
              + Add role
            </button>
          </div>

          {loaded && roles.length === 0 && (
            <EmptyState title="No roles yet" subtitle="Create your first role above (e.g. Cashier or Manager), then tick which features it can access." />
          )}

          {roles.length > 0 && (
            <div style={{ overflowX: 'auto', background: A.shell, border: A.border, borderRadius: 12, boxShadow: A.cardShadow }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...firstCol, textAlign: 'left' }}>Feature</th>
                    {roles.map(role => (
                      <th key={role.id} style={th}>
                        <input
                          key={role.id + ':' + role.name}
                          defaultValue={role.name}
                          onBlur={e => renameRole(role, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          title="Click to rename"
                          style={{ width: '100%', textAlign: 'center', border: '1px solid transparent', borderRadius: 6, padding: '4px 6px', fontSize: 13, fontWeight: 800, color: A.ink, fontFamily: A.font, background: 'transparent', outline: 'none' }}
                          onFocus={e => { e.currentTarget.style.border = '1px solid rgba(0,0,0,0.15)'; e.currentTarget.style.background = A.shell; }}
                          onBlurCapture={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent'; }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10.5, color: A.faintText, fontWeight: 600 }}>{(role.permissions || []).length}/{totalPerms}</span>
                          <button onClick={() => requestDelete(role)} title="Delete role"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: A.faintText, fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_GROUPS.map(g => (
                    <Fragment key={g.group}>
                      <tr>
                        <td colSpan={roles.length + 1} style={{ padding: '8px 12px', background: A.subtleBg, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.warningDim, position: 'sticky', left: 0 }}>
                          {g.group}
                        </td>
                      </tr>
                      {g.perms.map(p => (
                        <tr key={p.key}>
                          <td style={{ ...firstCol, padding: '9px 12px', borderBottom: A.cellBorder, fontSize: 13.5, fontWeight: 600, color: A.ink }}>{p.label}</td>
                          {roles.map(role => {
                            const on = (role.permissions || []).includes(p.key);
                            return (
                              <td key={role.id} style={{ padding: '9px 12px', borderBottom: A.cellBorder, borderLeft: A.cellBorder, textAlign: 'center' }}>
                                <input type="checkbox" checked={on} onChange={() => togglePerm(role, p.key)}
                                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: A.success }} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 12, color: A.faintText, marginTop: 14, lineHeight: 1.6 }}>
            🔒 <b>Subscription &amp; billing</b>, your <b>account security</b> (login/password), and <b>payment-gateway</b> setup stay owner-only and can’t be granted to any role.
          </div>
        </div>
      </AdminLayout>

      <ConfirmModal
        open={!!confirm} title={confirm?.title} body={confirm?.body}
        confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}
