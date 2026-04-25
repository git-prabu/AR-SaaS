import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, updateRestaurant } from '../../lib/db';
import toast from 'react-hot-toast';

// ═══ Aspire palette (same tokens as the rest of the admin chrome) ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  successDim: '#2E7E45',
  danger: '#D9534F',
  dangerDim: '#A03A37',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// Reusable input/label styles
const labelStyle = {
  display: 'block',
  fontSize: 11, fontWeight: 700,
  color: 'rgba(0,0,0,0.55)',
  letterSpacing: '0.05em', textTransform: 'uppercase',
  marginBottom: 6,
};
const inputStyle = {
  width: '100%',
  padding: '10px 13px',
  background: '#F8F8F8',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 9,
  fontSize: 13,
  color: '#1A1A1A',
  fontFamily: INTER,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, background 0.15s',
};

// ═══ Soft format validation — returns warning text if value looks malformed ═══
// Never blocks save; just shows a hint under the field.
const validators = {
  // GSTIN: 15 chars total — 2 digits (state code) + 5 letters (PAN prefix) + 4 digits + 1 letter (PAN entity) + 1 alphanumeric + Z + 1 alphanumeric (check)
  gstin: (v) => {
    if (!v) return null;
    const s = v.trim().toUpperCase();
    if (s.length !== 15) return `GSTIN should be 15 characters (current: ${s.length})`;
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s)) return 'Format should be: 2 digits + 5 letters + 4 digits + letter + alphanum + Z + alphanum';
    return null;
  },
  // FSSAI license: 14 digits
  fssai: (v) => {
    if (!v) return null;
    const s = v.trim();
    if (!/^\d+$/.test(s)) return 'FSSAI number should contain only digits';
    if (s.length !== 14) return `FSSAI license is usually 14 digits (current: ${s.length})`;
    return null;
  },
  // Indian phone: 10 digits (optionally with +91 prefix)
  phone: (v) => {
    if (!v) return null;
    const s = v.trim().replace(/\s+/g, '').replace(/^\+91/, '').replace(/^0/, '');
    if (!/^\d+$/.test(s)) return 'Phone should contain only digits';
    if (s.length !== 10) return `Indian mobile numbers are 10 digits (current: ${s.length})`;
    if (!/^[6-9]/.test(s)) return 'Indian mobile numbers usually start with 6, 7, 8, or 9';
    return null;
  },
  // HSN/SAC: 4 / 6 / 8 digits (4 = simplest, 6 = standard, 8 = detailed)
  hsn: (v) => {
    if (!v) return null;
    const s = v.trim();
    if (!/^\d+$/.test(s)) return 'HSN/SAC code should contain only digits';
    if (![4, 6, 8].includes(s.length)) return 'HSN/SAC codes are usually 4, 6, or 8 digits';
    return null;
  },
};

// Tiny inline-warning component
function Hint({ text, type = 'warn' }) {
  if (!text) return null;
  const colors = {
    warn: { bg: 'rgba(196,168,109,0.08)', border: 'rgba(196,168,109,0.30)', text: A.warningDim, icon: '⚠' },
    info: { bg: 'rgba(0,0,0,0.03)',       border: 'rgba(0,0,0,0.10)',       text: A.mutedText,  icon: 'ℹ' },
  };
  const c = colors[type];
  return (
    <div style={{
      marginTop: 6, padding: '5px 10px', borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`,
      fontSize: 11, color: c.text, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      <span>{c.icon}</span>
      <span>{text}</span>
    </div>
  );
}

export default function AdminSettings() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantNameFallback = userData?.restaurantName || 'Your Restaurant';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ─── Form state — covers original 8 fields + 4 new ones ─────────────
  const [form, setForm] = useState({
    // GST & billing
    gstPercent: '',
    serviceChargePercent: '',
    gstNumber: '',
    // Restaurant Info on Bill
    restaurantName: '',
    address: '',
    phone: '',
    fssaiNo: '',
    // UPI
    upiId: '',
    // NEW — Restaurant Profile
    cuisine: '',
    city: '',
    // NEW — Bill Customization
    billFooter: '',
    hsnCode: '',
    // NEW — Daily summary email override (blank = send to admin's signup email)
    notificationsEmail: '',
  });

  // Snapshot for change-detection: subdomain (read-only) + initial form values
  const [subdomain, setSubdomain] = useState('');
  // initialForm is the last-saved baseline. Stored in STATE (not a ref) so
  // updating it after save triggers a re-render and isDirty recomputes.
  const [initialForm, setInitialForm] = useState(null);

  // ─── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => {
      if (!r) { setLoading(false); return; }
      const next = {
        gstPercent: r.gstPercent !== undefined ? String(r.gstPercent) : '5',
        serviceChargePercent: r.serviceChargePercent !== undefined ? String(r.serviceChargePercent) : '0',
        gstNumber: r.gstNumber || '',
        restaurantName: r.name || '',
        address: r.address || '',
        phone: r.phone || '',
        fssaiNo: r.fssaiNo || '',
        upiId: r.upiId || '',
        cuisine: r.cuisine || '',
        city: r.city || '',
        billFooter: r.billFooter || '',
        hsnCode: r.hsnCode || '9963',  // Default to 9963 (SAC for restaurant services)
        notificationsEmail: r.notificationsEmail || '',
      };
      setForm(next);
      setInitialForm(next);
      setSubdomain(r.subdomain || '');
      setLoading(false);
    }).catch(err => {
      console.error('settings load error:', err);
      setLoading(false);
    });
  }, [rid]);

  // Helper: update one field in the form
  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  // ─── Dirty check — has anything changed since last load/save? ─────
  // Compare normalized values (trimmed) so trailing whitespace doesn't
  // falsely flag the form as dirty.
  const isDirty = useMemo(() => {
    if (!initialForm) return false;
    return Object.keys(form).some(k => {
      const a = (form[k] ?? '').toString().trim();
      const b = (initialForm[k] ?? '').toString().trim();
      return a !== b;
    });
  }, [form, initialForm]);

  // ─── Validation hints (soft — never block save) ─────────────────────
  const hints = useMemo(() => ({
    gstNumber: validators.gstin(form.gstNumber),
    fssaiNo:   validators.fssai(form.fssaiNo),
    phone:     validators.phone(form.phone),
    hsnCode:   validators.hsn(form.hsnCode),
  }), [form.gstNumber, form.fssaiNo, form.phone, form.hsnCode]);

  // ─── Save handler ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!rid) return;
    const gst = parseFloat(form.gstPercent);
    const sc = parseFloat(form.serviceChargePercent);
    if (isNaN(gst) || gst < 0 || gst > 100) { toast.error('GST must be between 0 and 100'); return; }
    if (isNaN(sc) || sc < 0 || sc > 30) { toast.error('Service charge must be between 0 and 30'); return; }
    setSaving(true);
    try {
      // Use the same key names as the existing schema (e.g. `name` not `restaurantName`)
      // so this is byte-compatible with what the customer page reads.
      await updateRestaurant(rid, {
        gstPercent: gst,
        serviceChargePercent: sc,
        gstNumber: form.gstNumber.trim(),
        name: form.restaurantName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        fssaiNo: form.fssaiNo.trim(),
        upiId: form.upiId.trim(),
        cuisine: form.cuisine.trim(),
        city: form.city.trim(),
        billFooter: form.billFooter.trim(),
        hsnCode: form.hsnCode.trim(),
        notificationsEmail: form.notificationsEmail.trim(),
      });
      toast.success('Settings saved!');
      // Build the same normalized snapshot we just persisted, then update
      // BOTH form (so the inputs show trimmed values) and initialForm (so
      // the dirty check returns false). Both are state, so this triggers
      // a re-render and the unsaved-changes bar disappears.
      const saved = {
        ...form,
        gstPercent: String(gst),
        serviceChargePercent: String(sc),
        gstNumber: form.gstNumber.trim(),
        restaurantName: form.restaurantName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        fssaiNo: form.fssaiNo.trim(),
        upiId: form.upiId.trim(),
        cuisine: form.cuisine.trim(),
        city: form.city.trim(),
        billFooter: form.billFooter.trim(),
        hsnCode: form.hsnCode.trim(),
        notificationsEmail: form.notificationsEmail.trim(),
      };
      setForm(saved);
      setInitialForm(saved);
    } catch (e) { toast.error('Failed to save: ' + e.message); }
    finally { setSaving(false); }
  };

  // ─── Discard handler — revert to the last loaded/saved state ────────
  const handleDiscard = () => {
    if (initialForm) setForm(initialForm);
  };

  const handleCopySubdomain = () => {
    if (!subdomain) return;
    navigator.clipboard.writeText(`https://ar-saa-s-kbzn.vercel.app/restaurant/${subdomain}`);
    toast.success('Menu URL copied!');
  };

  // ─── Derived stats for the matte-black card ─────────────────────────
  const stats = useMemo(() => ({
    gst: parseFloat(form.gstPercent) || 0,
    serviceCharge: parseFloat(form.serviceChargePercent) || 0,
    upiActive: form.upiId.trim().length > 0,
    gstActive: form.gstNumber.trim().length > 0,
  }), [form.gstPercent, form.serviceChargePercent, form.upiId, form.gstNumber]);

  // ─── Live bill preview values — mirror what the customer bill renderer uses ─
  // These re-render every time the form changes, no save needed.
  const billPreview = useMemo(() => {
    const now = new Date();
    return {
      name: form.restaurantName || 'Your Restaurant',
      address: form.address,
      phone: form.phone,
      gstin: form.gstNumber,
      fssai: form.fssaiNo,
      hsn: form.hsnCode,
      footer: form.billFooter || 'Thank you! Visit again',
      upiId: form.upiId,
      // Sample bill data — fixed values just for preview
      table: '5',
      orderNumber: 142,
      date: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: [
        { name: 'Butter Chicken', qty: 2, total: 560 },
        { name: 'Garlic Naan', qty: 4, total: 200 },
      ],
      // Calculated breakdown
      get subtotal() { return this.items.reduce((s, i) => s + i.total, 0); },
      get sc() {
        const pct = parseFloat(form.serviceChargePercent) || 0;
        return parseFloat((this.subtotal * pct / 100).toFixed(2));
      },
      get cgst() {
        const pct = parseFloat(form.gstPercent) || 0;
        return parseFloat(((this.subtotal + this.sc) * pct / 200).toFixed(2));
      },
      get sgst() { return this.cgst; },
      get preRound() { return this.subtotal + this.sc + this.cgst + this.sgst; },
      get total() { return Math.round(this.preRound); },
      get roundOff() { return parseFloat((this.total - this.preRound).toFixed(2)); },
    };
  }, [form.restaurantName, form.address, form.phone, form.gstNumber, form.fssaiNo, form.hsnCode, form.billFooter, form.upiId, form.gstPercent, form.serviceChargePercent]);

  const gstPctNum = parseFloat(form.gstPercent) || 0;
  const scPctNum = parseFloat(form.serviceChargePercent) || 0;

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <AdminLayout>
      <Head><title>Settings — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, paddingBottom: isDirty ? 80 : 0 }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          .ar-input { transition: border-color 0.15s, background 0.15s; }
          .ar-input:focus { outline: none; border-color: ${A.warning} !important; background: ${A.shell} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.10); }
          .ar-input::placeholder { color: ${A.faintText}; }
          .ar-action-btn:hover:not(:disabled) { transform: translateY(-1px); }
        `}</style>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Setup</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Settings</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              {form.restaurantName || restaurantNameFallback} <span style={{ color: A.mutedText, fontWeight: 500 }}>Settings</span>
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
              Manage GST, billing details, restaurant profile, and what appears on customer bills.
            </div>
          </div>

          {/* ═══ BILLING SETUP — matte-black signature stat card ═══ */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>BILLING SETUP</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                {loading ? 'Loading…' : 'Live · applies to all new bills'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'GST',            value: `${stats.gst}%`,           color: stats.gst > 0 ? A.warning : A.forestText },
                { label: 'SERVICE CHARGE', value: `${stats.serviceCharge}%`, color: stats.serviceCharge > 0 ? A.warning : A.forestText },
                { label: 'GSTIN',          value: stats.gstActive ? 'On' : '—', color: stats.gstActive ? A.success : A.forestTextFaint },
                { label: 'UPI PAYMENT',    value: stats.upiActive ? 'On' : 'Off', color: stats.upiActive ? A.success : A.forestTextFaint },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg,
                  border: A.forestBorder,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>
                    {s.label}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px', color: s.color }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ MAIN CONTENT — 2 columns: forms left, live bill right ═══ */}
        <div style={{ padding: '0 28px 60px' }}>
          {loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading settings…</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>

              {/* ─── LEFT COLUMN: FORMS ─── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* SECTION 1: GST & Billing */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="GST & BILLING" />
                  <div style={sectionDescStyle}>
                    These values appear on every customer bill. CGST & SGST will each be half of the GST %.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>GST % (Total)</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="ar-input"
                          type="number" min="0" max="100" step="0.5"
                          value={form.gstPercent} onChange={update('gstPercent')}
                          style={inputStyle} placeholder="e.g. 5"
                        />
                        <span style={pctSuffixStyle}>%</span>
                      </div>
                      {form.gstPercent && !isNaN(parseFloat(form.gstPercent)) && parseFloat(form.gstPercent) > 0 && (
                        <div style={{ fontSize: 11, color: A.faintText, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                          CGST {(parseFloat(form.gstPercent) / 2).toFixed(1)}% + SGST {(parseFloat(form.gstPercent) / 2).toFixed(1)}%
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Service Charge %</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="ar-input"
                          type="number" min="0" max="30" step="0.5"
                          value={form.serviceChargePercent} onChange={update('serviceChargePercent')}
                          style={inputStyle} placeholder="0 to disable"
                        />
                        <span style={pctSuffixStyle}>%</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>GST Number (GSTIN)</label>
                    <input
                      className="ar-input"
                      value={form.gstNumber} onChange={update('gstNumber')}
                      style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      placeholder="e.g. 34FXKPK3964F1Z7" maxLength={15}
                    />
                    <Hint text={hints.gstNumber} />
                    {!hints.gstNumber && (
                      <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                        Optional. If blank, GSTIN won't appear on bills.
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 2: Restaurant Info on Bill */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="RESTAURANT INFO ON BILL" />
                  <div style={sectionDescStyle}>
                    Shown at the top of printed bills and digital receipts.
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Restaurant Name</label>
                    <input className="ar-input" value={form.restaurantName} onChange={update('restaurantName')} style={inputStyle} placeholder="Your restaurant name" />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Address</label>
                    <textarea className="ar-input" value={form.address} onChange={update('address')} rows={2} style={{ ...inputStyle, resize: 'none', minHeight: 64, paddingTop: 10 }} placeholder="Full address for the bill header" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input className="ar-input" value={form.phone} onChange={update('phone')} style={inputStyle} placeholder="e.g. 9994623456" />
                      <Hint text={hints.phone} />
                    </div>
                    <div>
                      <label style={labelStyle}>FSSAI Lic. No.</label>
                      <input className="ar-input" value={form.fssaiNo} onChange={update('fssaiNo')} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} placeholder="e.g. 22420539000181" maxLength={14} />
                      <Hint text={hints.fssaiNo} />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Restaurant Profile (NEW) */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="RESTAURANT PROFILE" />
                  <div style={sectionDescStyle}>
                    Public details about your restaurant. Cuisine helps Google find you in local search.
                  </div>

                  {/* Subdomain — read-only (changing it would break printed QR codes) */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Subdomain (Customer URL) — Read-only</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{
                        flex: 1, padding: '10px 13px',
                        background: 'rgba(0,0,0,0.03)',
                        border: '1px dashed rgba(0,0,0,0.10)',
                        borderRadius: 9,
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: A.mutedText,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {subdomain || '—'}
                      </div>
                      <button onClick={handleCopySubdomain} disabled={!subdomain} style={{
                        padding: '0 14px', borderRadius: 9,
                        border: 'none', background: A.ink, color: A.cream,
                        fontSize: 11, fontWeight: 700, cursor: subdomain ? 'pointer' : 'not-allowed',
                        opacity: subdomain ? 1 : 0.4,
                        fontFamily: A.font,
                      }}>Copy URL</button>
                    </div>
                    <div style={{ fontSize: 11, color: A.faintText, marginTop: 6, lineHeight: 1.5 }}>
                      Your customer menu lives at <strong style={{ color: A.mutedText }}>/restaurant/{subdomain || 'your-subdomain'}</strong>. Locked because changing it would break printed QR codes.
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={labelStyle}>Cuisine Type</label>
                      <input className="ar-input" value={form.cuisine} onChange={update('cuisine')} style={inputStyle} placeholder="e.g. South Indian, Continental" />
                      <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                        Helps Google index your restaurant in local search.
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>City</label>
                      <input className="ar-input" value={form.city} onChange={update('city')} style={inputStyle} placeholder="e.g. Pondicherry" />
                      <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                        Used in analytics and local search.
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Bill Customization (NEW) */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="BILL CUSTOMIZATION" />
                  <div style={sectionDescStyle}>
                    Customize what appears at the bottom of customer bills. HSN/SAC code is required for GST compliance.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>HSN / SAC Code</label>
                      <input className="ar-input" value={form.hsnCode} onChange={update('hsnCode')} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} placeholder="9963" maxLength={8} />
                      <Hint text={hints.hsnCode} />
                      {!hints.hsnCode && (
                        <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                          Default <strong>9963</strong> = restaurant services (SAC).
                        </div>
                      )}
                    </div>
                    <div>{/* spacer — keeps the grid aligned */}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Bill Footer Message</label>
                    <input
                      className="ar-input"
                      value={form.billFooter} onChange={update('billFooter')}
                      style={inputStyle}
                      placeholder="Thank you! Visit again"
                      maxLength={80}
                    />
                    <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                      Shown at the bottom of every printed bill. Leave blank to use the default.
                    </div>
                  </div>
                </div>

                {/* SECTION 5: UPI Payment */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="UPI PAYMENT" rightBadge={stats.upiActive ? 'Active' : null} />
                  <div style={sectionDescStyle}>
                    Allow customers to pay directly via UPI from their phone. Leave blank to hide UPI option on the bill.
                  </div>

                  <div>
                    <label style={labelStyle}>UPI ID</label>
                    <input
                      className="ar-input"
                      value={form.upiId} onChange={update('upiId')}
                      style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                      placeholder="e.g. yourrestaurant@ybl or 9876543210@paytm"
                    />
                    <div style={{ fontSize: 11, color: A.faintText, marginTop: 6, lineHeight: 1.5 }}>
                      Your UPI ID from GPay, PhonePe, Paytm, or any UPI app. Customers will be able to pay you directly.
                    </div>
                  </div>
                </div>

                {/* SECTION 6: Daily summary email */}
                {/* Where the midnight-IST daily summary email goes for THIS
                    restaurant. Blank = falls back to the admin's signup email
                    (the address used on /admin/login). Useful when the owner
                    wants reports going to their personal inbox instead of the
                    operational login. */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="DAILY SUMMARY EMAIL" />
                  <div style={sectionDescStyle}>
                    Each night at midnight IST, you'll receive an email summarizing the day's orders, revenue, and top dishes. Override the recipient below — leave blank to use your login email.
                  </div>

                  <div>
                    <label style={labelStyle}>Notifications email</label>
                    <input
                      className="ar-input"
                      type="email"
                      value={form.notificationsEmail} onChange={update('notificationsEmail')}
                      style={inputStyle}
                      placeholder="owner@yourdomain.com (blank = use login email)"
                    />
                    <div style={{ fontSize: 11, color: A.faintText, marginTop: 6, lineHeight: 1.5 }}>
                      Where the daily report lands. Doesn't change your login email.
                    </div>
                  </div>
                </div>

                {/* Inline save button (visible when no dirty bar shown — for symmetry) */}
                {!isDirty && (
                  <button onClick={handleSave} disabled={saving} style={inlineSaveBtnStyle(saving)}>
                    {saving ? (
                      <>
                        <span style={{ width: 13, height: 13, border: `2.5px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        Saving…
                      </>
                    ) : 'Save Settings'}
                  </button>
                )}
              </div>

              {/* ─── RIGHT COLUMN: LIVE BILL PREVIEW (sticky) ─── */}
              <div>
                <div style={{
                  background: A.shell, borderRadius: 14,
                  border: A.border, padding: '20px 22px',
                  boxShadow: A.cardShadow,
                  position: 'sticky', top: 24,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>BILL PREVIEW</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
                    <span style={{ fontSize: 10, color: A.faintText, fontWeight: 500 }}>Live</span>
                  </div>

                  {/* Receipt — monospace, mirrors the real customer bill exactly */}
                  <div style={{
                    background: '#FFFEF8',
                    borderRadius: 10, border: '1px dashed rgba(0,0,0,0.15)',
                    padding: '18px 18px',
                    fontSize: 11, color: '#1A1A1A',
                    fontFamily: "'Courier New', 'JetBrains Mono', monospace",
                    lineHeight: 1.7,
                  }}>
                    {/* Header */}
                    <div style={{ fontWeight: 700, fontSize: 13, textAlign: 'center' }}>{billPreview.name}</div>
                    {billPreview.address && (
                      <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>{billPreview.address}</div>
                    )}
                    {billPreview.phone && (
                      <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>Phone: {billPreview.phone}</div>
                    )}
                    {billPreview.gstin && (
                      <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>GSTIN: {billPreview.gstin}</div>
                    )}

                    <div style={billDividerStyle} />

                    {/* Order metadata */}
                    <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>Table: {billPreview.table}</div>
                    <div style={{ textAlign: 'center', fontSize: 10, color: '#555' }}>{billPreview.date} {billPreview.time}</div>
                    <div style={{ textAlign: 'center', fontSize: 10, color: '#555', marginTop: 2 }}>Order #{billPreview.orderNumber}</div>

                    <div style={billDividerStyle} />

                    {/* Items */}
                    {billPreview.items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{it.name} x{it.qty}</span>
                        <span>Rs.{it.total.toFixed(0)}</span>
                      </div>
                    ))}

                    <div style={billDividerStyle} />

                    {/* HSN/SAC */}
                    {billPreview.hsn && (
                      <div style={{ textAlign: 'center', fontSize: 9, color: '#777', marginBottom: 4 }}>
                        HSN/SAC: {billPreview.hsn}
                      </div>
                    )}

                    {/* Totals breakdown */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333' }}>
                      <span>Subtotal</span><span>Rs.{billPreview.subtotal.toFixed(2)}</span>
                    </div>
                    {scPctNum > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333' }}>
                        <span>Service Charge ({scPctNum}%)</span><span>Rs.{billPreview.sc.toFixed(2)}</span>
                      </div>
                    )}
                    {gstPctNum > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333' }}>
                          <span>C.G.S.T {(gstPctNum / 2).toFixed(1)}%</span><span>Rs.{billPreview.cgst.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333' }}>
                          <span>S.G.S.T {(gstPctNum / 2).toFixed(1)}%</span><span>Rs.{billPreview.sgst.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {billPreview.roundOff !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#333' }}>
                        <span>Round off</span><span>{billPreview.roundOff > 0 ? '+' : ''}Rs.{billPreview.roundOff.toFixed(2)}</span>
                      </div>
                    )}

                    <div style={billDividerStyle} />

                    {/* Grand total */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontWeight: 700, fontSize: 13, paddingTop: 4,
                    }}>
                      <span>GRAND TOTAL</span><span>Rs.{billPreview.total}</span>
                    </div>

                    <div style={billDividerStyle} />

                    {/* Payment + footer */}
                    <div style={{ textAlign: 'center', fontSize: 10, marginTop: 4 }}>Payment: Cash</div>
                    {billPreview.fssai && (
                      <div style={{ textAlign: 'center', fontSize: 10, marginTop: 6, color: '#555' }}>
                        FSSAI Lic. No. {billPreview.fssai}
                      </div>
                    )}
                    <div style={{ textAlign: 'center', fontSize: 10, marginTop: 8 }}>{billPreview.footer}</div>
                    <div style={{ textAlign: 'center', fontSize: 9, marginTop: 4, color: '#777' }}>Powered by Advert Radical</div>
                  </div>

                  <div style={{ fontSize: 11, color: A.faintText, marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
                    Sample bill (Table 5 · Order #142). Updates as you type. Save to apply.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ STICKY UNSAVED CHANGES BAR (only when dirty) ═══ */}
        {isDirty && !loading && (
          <div style={{
            position: 'fixed', bottom: 0, left: 240, right: 0, zIndex: 30,
            background: A.shell,
            borderTop: A.border,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.05)',
            padding: '12px 28px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            animation: 'slideUp 0.18s ease',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: A.warning, animation: 'pulse 1.5s ease infinite',
              boxShadow: '0 0 6px rgba(196,168,109,0.6)',
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: A.ink }}>Unsaved changes</span>
            <span style={{ fontSize: 12, color: A.mutedText }}>
              Save your changes to apply them to the next customer bills.
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={handleDiscard} disabled={saving} className="ar-action-btn" style={{
              padding: '9px 18px', borderRadius: 9,
              border: A.border, background: A.shell, color: A.mutedText,
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: A.font, transition: 'all 0.15s',
            }}>
              Discard
            </button>
            <button onClick={handleSave} disabled={saving} className="ar-action-btn" style={{
              padding: '9px 22px', borderRadius: 9,
              border: 'none', background: saving ? A.mutedText : A.ink, color: A.cream,
              fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: A.font, transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {saving ? (
                <>
                  <span style={{ width: 12, height: 12, border: `2.5px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Saving…
                </>
              ) : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// ═══ Reusable visual components / styles ═══
function SectionHeader({ label, rightBadge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
      {rightBadge && (
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: 'rgba(63,158,90,0.10)', color: A.success,
          border: '1px solid rgba(63,158,90,0.30)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>{rightBadge}</span>
      )}
    </div>
  );
}

const sectionCardStyle = {
  background: A.shell, borderRadius: 14,
  border: A.border, padding: '20px 22px',
  boxShadow: A.cardShadow,
};
const sectionDescStyle = {
  fontSize: 12, color: A.mutedText, marginBottom: 16, lineHeight: 1.5,
};
const pctSuffixStyle = {
  position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
  fontSize: 13, color: A.mutedText, fontWeight: 700,
};
const billDividerStyle = {
  borderTop: '1px dashed rgba(0,0,0,0.25)', margin: '8px 0',
};
const inlineSaveBtnStyle = (saving) => ({
  width: '100%', padding: '13px',
  borderRadius: 10, border: 'none',
  background: saving ? A.mutedText : A.ink,
  color: A.cream,
  fontWeight: 700, fontSize: 14,
  fontFamily: A.font,
  cursor: saving ? 'not-allowed' : 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  transition: 'all 0.15s',
});

AdminSettings.getLayout = (page) => page;