// pages/admin/roles-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/roles on the dark "ok-root"
// theme (via <OkShell>). Owner-only. Logic copied verbatim from roles.js —
// only the render is new. Original untouched.
import Head from 'next/head';
import { useEffect, useMemo, useState, Fragment } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { createStaffRole, updateStaffRole, deleteStaffRole } from '../../lib/db';
import { PERMISSION_GROUPS, BUILTIN_ROLES } from '../../lib/permissions';
import toast from 'react-hot-toast';

export default function RolesV2() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [roles, setRoles] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [loading, user, router]);

  useEffect(() => {
    if (!rid) return;
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

  const togglePerm = (role, key) => {
    const has = (role.permissions || []).includes(key);
    const next = has ? role.permissions.filter(k => k !== key) : [...(role.permissions || []), key];
    setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: next } : r));
    updateStaffRole(rid, role.id, { permissions: next }).catch(() => { toast.error('Could not save — please retry'); });
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
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Roles &amp; Permissions — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  const th = { padding: '10px 12px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--tx)', textAlign: 'center', minWidth: 130, verticalAlign: 'top', background: 'var(--card-2)' };
  const firstCol = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--card)', textAlign: 'left', minWidth: 190 };
  const inputBox = { width: '100%', padding: '10px 13px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', background: 'var(--card-2)', color: 'var(--tx)' };

  return (
    <>
      <Head><title>Roles &amp; Permissions — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Team · access control" title="Roles & Permissions" brand={restaurantName}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--tx-2)', margin: '0 0 18px', lineHeight: 1.5, maxWidth: 720 }}>
          Every staff member gets ONE role. <b style={{ color: 'var(--tx)' }}>Kitchen</b> and <b style={{ color: 'var(--tx)' }}>Waiter</b> are built in (below); create your own roles and tick what each can use. Assign a role to a person on the <b style={{ color: 'var(--tx)' }}>Staff</b> page.
        </p>

        {/* Built-in roles */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
          {BUILTIN_ROLES.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, minWidth: 210 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', background: 'rgba(196,168,109,0.14)', padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>Built-in</span>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700, color: 'var(--tx)' }}>{b.name}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--tx-3)' }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Add role */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !adding) addRole(); }}
            placeholder="New role name (e.g. Cashier, Manager)" style={{ ...inputBox, flex: '0 1 320px' }} />
          <button onClick={addRole} disabled={adding} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>+ Add role</button>
        </div>

        {loaded && roles.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🔑</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No roles yet</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Create your first role above (e.g. Cashier or Manager), then tick which features it can access.</div>
          </div>
        )}

        {roles.length > 0 && (
          <div style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...firstCol, textAlign: 'left' }}>Feature</th>
                  {roles.map(role => (
                    <th key={role.id} style={th}>
                      <input key={role.id + ':' + role.name} defaultValue={role.name}
                        onBlur={e => renameRole(role, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        title="Click to rename"
                        style={{ width: '100%', textAlign: 'center', border: '1px solid transparent', borderRadius: 6, padding: '4px 6px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', background: 'transparent', outline: 'none' }}
                        onFocus={e => { e.currentTarget.style.border = '1px solid var(--line)'; e.currentTarget.style.background = 'var(--card-2)'; }}
                        onBlurCapture={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent'; }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600 }}>{(role.permissions || []).length}/{totalPerms}</span>
                        <button onClick={() => requestDelete(role)} title="Delete role" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-3)', fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map(g => (
                  <Fragment key={g.group}>
                    <tr>
                      <td colSpan={roles.length + 1} style={{ padding: '8px 12px', background: 'var(--card-3)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', position: 'sticky', left: 0 }}>
                        {g.group}
                      </td>
                    </tr>
                    {g.perms.map(p => (
                      <tr key={p.key}>
                        <td style={{ ...firstCol, padding: '9px 12px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--tx)' }}>{p.label}</td>
                        {roles.map(role => {
                          const on = (role.permissions || []).includes(p.key);
                          return (
                            <td key={role.id} style={{ padding: '9px 12px', borderBottom: '1px solid var(--line)', borderLeft: '1px solid var(--line)', textAlign: 'center' }}>
                              <input type="checkbox" checked={on} onChange={() => togglePerm(role, p.key)} style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--success)' }} />
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

        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginTop: 14, lineHeight: 1.6 }}>
          🔒 <b style={{ color: 'var(--tx-2)' }}>Subscription &amp; billing</b>, your <b style={{ color: 'var(--tx-2)' }}>account security</b> (login/password), and <b style={{ color: 'var(--tx-2)' }}>payment-gateway</b> setup stay owner-only and can’t be granted to any role.
        </div>

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

RolesV2.getLayout = (page) => page;
