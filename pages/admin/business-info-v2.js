// pages/admin/business-info-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/business-info on the dark
// "ok-root" theme (via <OkShell>). Logic (form state, validators, save/
// discard, logo upload/remove with storage tracking, bill settings + live
// bill-preview iframe via buildBillHtml) copied verbatim — only the chrome is
// re-themed. The bill preview iframe stays a white thermal receipt (that's the
// real printed output). Original /admin/business-info untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { getRestaurantById, updateRestaurant, bumpStorageUsed } from '../../lib/db';
import { uploadImage, fileSizeMB, deleteFile, buildImagePath, extractStoragePath } from '../../lib/storage';
import { buildBillHtml, DEFAULT_BILL_SETTINGS } from '../../lib/printKot';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 13px', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' };
const sectionCardStyle = { background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '20px 22px' };
const sectionDescStyle = { fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 16, lineHeight: 1.5 };
const pctSuffixStyle = { position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--tx-3)', fontWeight: 700 };

const validators = {
  gstin: (v) => { if (!v) return null; const s = v.trim().toUpperCase(); if (s.length !== 15) return `GSTIN should be 15 characters (current: ${s.length})`; if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s)) return 'Format should be: 2 digits + 5 letters + 4 digits + letter + alphanum + Z + alphanum'; return null; },
  fssai: (v) => { if (!v) return null; const s = v.trim(); if (!/^\d+$/.test(s)) return 'FSSAI number should contain only digits'; if (s.length !== 14) return `FSSAI license is usually 14 digits (current: ${s.length})`; return null; },
  phone: (v) => { if (!v) return null; const s = v.trim().replace(/\s+/g, '').replace(/^\+91/, '').replace(/^0/, ''); if (!/^\d+$/.test(s)) return 'Phone should contain only digits'; if (s.length !== 10) return `Indian mobile numbers are 10 digits (current: ${s.length})`; if (!/^[6-9]/.test(s)) return 'Indian mobile numbers usually start with 6, 7, 8, or 9'; return null; },
  hsn: (v) => { if (!v) return null; const s = v.trim(); if (!/^\d+$/.test(s)) return 'HSN/SAC code should contain only digits'; if (![4, 6, 8].includes(s.length)) return 'HSN/SAC codes are usually 4, 6, or 8 digits'; return null; },
};

function Hint({ text }) {
  if (!text) return null;
  return <div style={{ marginTop: 6, padding: '5px 10px', borderRadius: 6, background: 'rgba(196,168,109,0.10)', border: '1px solid rgba(196,168,109,0.30)', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gold)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><span>⚠</span><span>{text}</span></div>;
}
function SectionHeader({ label, rightBadge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
      {rightBadge && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(63,170,99,0.12)', color: 'var(--success)', border: '1px solid rgba(63,170,99,0.30)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{rightBadge}</span>}
    </div>
  );
}

export default function BusinessInfoV2() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantNameFallback = userData?.restaurantName || 'Your Restaurant';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ gstPercent: '', serviceChargePercent: '', gstNumber: '', restaurantName: '', address: '', phone: '', fssaiNo: '', upiId: '', cuisine: '', city: '', googlePlaceId: '', billFooter: '', hsnCode: '', notificationsEmail: '' });
  const [subdomain, setSubdomain] = useState('');
  const [initialForm, setInitialForm] = useState(null);
  const [billSettings, setBillSettings] = useState({ ...DEFAULT_BILL_SETTINGS });
  const [initialBillSettings, setInitialBillSettings] = useState(null);
  const setBS = (key) => (val) => setBillSettings(s => ({ ...s, [key]: val }));
  const [logoUrl, setLogoUrl] = useState('');
  const [logoSize, setLogoSize] = useState(0);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoProgress, setLogoProgress] = useState(0);
  const logoInputRef = useRef(null);

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => {
      if (!r) { setLoading(false); return; }
      const next = {
        gstPercent: r.gstPercent !== undefined ? String(r.gstPercent) : '5',
        serviceChargePercent: r.serviceChargePercent !== undefined ? String(r.serviceChargePercent) : '0',
        gstNumber: r.gstNumber || '', restaurantName: r.name || '', address: r.address || '', phone: r.phone || '', fssaiNo: r.fssaiNo || '', upiId: r.upiId || '', cuisine: r.cuisine || '', city: r.city || '', googlePlaceId: r.googlePlaceId || '', billFooter: r.billFooter || '', hsnCode: r.hsnCode || '9963', notificationsEmail: r.notificationsEmail || '',
      };
      setForm(next); setInitialForm(next); setSubdomain(r.subdomain || '');
      setLogoUrl(r.logoUrl || ''); setLogoSize(Number(r.logoSize) || 0);
      const bs = { ...DEFAULT_BILL_SETTINGS, ...(r.billSettings || {}) };
      setBillSettings(bs); setInitialBillSettings(bs);
      setLoading(false);
    }).catch(err => { console.error('settings load error:', err); setLoading(false); });
  }, [rid]);

  const update = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const isDirty = useMemo(() => {
    if (!initialForm) return false;
    const formDirty = Object.keys(form).some(k => ((form[k] ?? '').toString().trim()) !== ((initialForm[k] ?? '').toString().trim()));
    const bsDirty = initialBillSettings ? JSON.stringify(billSettings) !== JSON.stringify(initialBillSettings) : false;
    return formDirty || bsDirty;
  }, [form, initialForm, billSettings, initialBillSettings]);

  const hints = useMemo(() => ({ gstNumber: validators.gstin(form.gstNumber), fssaiNo: validators.fssai(form.fssaiNo), phone: validators.phone(form.phone), hsnCode: validators.hsn(form.hsnCode) }), [form.gstNumber, form.fssaiNo, form.phone, form.hsnCode]);

  const handleSave = async () => {
    if (!rid) return;
    const gst = parseFloat(form.gstPercent);
    const sc = parseFloat(form.serviceChargePercent);
    if (isNaN(gst) || gst < 0 || gst > 100) { toast.error('GST must be between 0 and 100'); return; }
    if (isNaN(sc) || sc < 0 || sc > 30) { toast.error('Service charge must be between 0 and 30'); return; }
    setSaving(true);
    try {
      await updateRestaurant(rid, { gstPercent: gst, serviceChargePercent: sc, gstNumber: form.gstNumber.trim(), name: form.restaurantName.trim(), address: form.address.trim(), phone: form.phone.trim(), fssaiNo: form.fssaiNo.trim(), cuisine: form.cuisine.trim(), city: form.city.trim(), googlePlaceId: form.googlePlaceId.trim(), billFooter: form.billFooter.trim(), hsnCode: form.hsnCode.trim(), notificationsEmail: form.notificationsEmail.trim(), billSettings });
      toast.success('Settings saved!');
      const saved = { ...form, gstPercent: String(gst), serviceChargePercent: String(sc), gstNumber: form.gstNumber.trim(), restaurantName: form.restaurantName.trim(), address: form.address.trim(), phone: form.phone.trim(), fssaiNo: form.fssaiNo.trim(), cuisine: form.cuisine.trim(), city: form.city.trim(), googlePlaceId: form.googlePlaceId.trim(), billFooter: form.billFooter.trim(), hsnCode: form.hsnCode.trim(), notificationsEmail: form.notificationsEmail.trim() };
      setForm(saved); setInitialForm(saved); setInitialBillSettings(billSettings);
    } catch (e) { toast.error('Failed to save: ' + e.message); }
    finally { setSaving(false); }
  };
  const handleDiscard = () => { if (initialForm) setForm(initialForm); if (initialBillSettings) setBillSettings(initialBillSettings); };
  const handleCopySubdomain = () => { if (!subdomain) return; const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://halohelm.com'; navigator.clipboard.writeText(`${base}/restaurant/${subdomain}`); toast.success('Menu URL copied!'); };

  const handleLogoUpload = async (file) => {
    if (!file || !rid) return;
    if (!file.type.startsWith('image/')) { toast.error('Logo must be an image file.'); return; }
    if (fileSizeMB(file) > 2) { toast.error('Logo must be under 2 MB.'); return; }
    setLogoBusy(true); setLogoProgress(0);
    const oldUrl = logoUrl; const oldSize = logoSize;
    try {
      const path = buildImagePath(rid, `logo_${file.name}`);
      const url = await uploadImage(file, path, (pct) => setLogoProgress(pct), { maxWidth: 256, maxHeight: 256, quality: 0.85 });
      const newSize = fileSizeMB(file);
      await updateRestaurant(rid, { logoUrl: url, logoSize: newSize });
      setLogoUrl(url); setLogoSize(newSize);
      try { await bumpStorageUsed(rid, newSize - oldSize); } catch { /* best-effort */ }
      if (oldUrl) { const oldPath = extractStoragePath(oldUrl); if (oldPath) deleteFile(oldPath).catch(() => {}); }
      toast.success(oldUrl ? 'Logo updated!' : 'Logo uploaded!');
    } catch (e) { console.error('logo upload failed:', e); toast.error('Upload failed: ' + (e?.message || 'unknown')); }
    finally { setLogoBusy(false); setLogoProgress(0); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };
  const handleLogoRemove = async () => {
    if (!rid || !logoUrl) return;
    setLogoBusy(true);
    const oldUrl = logoUrl; const oldSize = logoSize;
    try {
      await updateRestaurant(rid, { logoUrl: null, logoSize: 0 });
      setLogoUrl(''); setLogoSize(0);
      if (oldSize > 0) { try { await bumpStorageUsed(rid, -oldSize); } catch { /* best-effort */ } }
      if (oldUrl) { const oldPath = extractStoragePath(oldUrl); if (oldPath) deleteFile(oldPath).catch(() => {}); }
      toast.success('Logo removed.');
    } catch (e) { console.error('logo remove failed:', e); toast.error('Could not remove logo: ' + (e?.message || 'unknown')); }
    finally { setLogoBusy(false); }
  };

  const stats = useMemo(() => ({ gst: parseFloat(form.gstPercent) || 0, serviceCharge: parseFloat(form.serviceChargePercent) || 0, gstActive: form.gstNumber.trim().length > 0 }), [form.gstPercent, form.serviceChargePercent, form.gstNumber]);

  const previewQrRef = useRef(null);
  const [previewQr, setPreviewQr] = useState(null);
  useEffect(() => {
    if (!billSettings.showUpiQr || !form.upiId.trim()) { setPreviewQr(null); return; }
    if (previewQrRef.current) { setPreviewQr(previewQrRef.current); return; }
    let alive = true;
    QRCode.toDataURL('upi://pay?pa=preview@upi&pn=Preview&am=100&cu=INR', { margin: 1, width: 200 }).then(url => { previewQrRef.current = url; if (alive) setPreviewQr(url); }).catch(() => {});
    return () => { alive = false; };
  }, [billSettings.showUpiQr, form.upiId]);

  const previewSrcDoc = useMemo(() => {
    const gstPct = parseFloat(form.gstPercent) || 0;
    const scPct = parseFloat(form.serviceChargePercent) || 0;
    const mk = (orderNumber, items) => {
      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const serviceCharge = +(subtotal * scPct / 100).toFixed(2);
      const cgst = +((subtotal * (gstPct / 2)) / 100).toFixed(2);
      const sgst = cgst;
      const preRound = subtotal + serviceCharge + cgst + sgst;
      const total = Math.round(preRound);
      return { orderNumber, items, subtotal, serviceCharge, cgst, sgst, roundOff: +(total - preRound).toFixed(2), total, paymentStatus: billSettings.showUpiQr ? 'unpaid' : 'paid_cash', orderType: 'dinein' };
    };
    const o1 = mk(83, [{ name: 'Veg Ramyeon', qty: 1, price: 275 }, { name: 'Chicken Katsu Ramyeon', qty: 1, price: 375 }, { name: 'Tofu Katsu Ramyeon', qty: 1, price: 375 }]);
    const o2 = mk(92, [{ name: 'Korean Tofu Bao', qty: 1, price: 200 }, { name: 'Iced Milo', qty: 1, price: 180 }]);
    const previewRestaurant = { name: form.restaurantName || 'Your Restaurant', address: form.address, phone: form.phone, gstNumber: form.gstNumber, fssaiNo: form.fssaiNo, hsnCode: form.hsnCode, gstPercent: gstPct, billFooter: form.billFooter, upiId: form.upiId, logoUrl, billSettings };
    const html = buildBillHtml([o1, o2], { restaurant: previewRestaurant, tableLabel: '5', cashier: 'Ganga', billNumber: 142, customerName: '', upiQrDataUrl: previewQr });
    return html.replace('</head>', '<style>.print-chrome{display:none!important}body{padding-bottom:10px!important}</style></head>');
  }, [form, billSettings, logoUrl, previewQr]);

  const headRight = !isDirty ? (
    <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save changes'}</button>
  ) : null;

  return (
    <>
      <Head><title>Business Info — HaloHelm</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes ok-pulse{0%,100%{opacity:1}50%{opacity:.35}} .biz-input:focus{outline:none;border-color:var(--gold)!important;background:var(--card)!important}`}</style>
      <OkShell active={null} eyebrow="Setup · GST, billing & profile" title="Business Info" brand={form.restaurantName || restaurantNameFallback} headRight={headRight}>
        <div style={{ paddingBottom: isDirty ? 70 : 0 }}>
          {/* Billing setup stat card */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', animation: 'ok-pulse 2s ease infinite' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Billing setup</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{loading ? 'Loading…' : 'Live · applies to all new bills'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[{ label: 'GST', value: `${stats.gst}%`, color: stats.gst > 0 ? 'var(--gold)' : 'var(--tx)' }, { label: 'Service charge', value: `${stats.serviceCharge}%`, color: stats.serviceCharge > 0 ? 'var(--gold)' : 'var(--tx)' }, { label: 'GSTIN', value: stats.gstActive ? 'On' : '—', color: stats.gstActive ? 'var(--success)' : 'var(--tx-3)' }].map(s => (
                <div key={s.label} style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
              <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading settings…</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14 }} className="biz-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* GST & billing */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="GST & billing" />
                  <div style={sectionDescStyle}>These values appear on every customer bill. CGST & SGST will each be half of the GST %.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>GST % (Total)</label>
                      <div style={{ position: 'relative' }}><input className="biz-input" type="number" min="0" max="100" step="0.5" value={form.gstPercent} onChange={update('gstPercent')} style={inputStyle} placeholder="e.g. 5" /><span style={pctSuffixStyle}>%</span></div>
                      {form.gstPercent && !isNaN(parseFloat(form.gstPercent)) && parseFloat(form.gstPercent) > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', marginTop: 6 }}>CGST {(parseFloat(form.gstPercent) / 2).toFixed(1)}% + SGST {(parseFloat(form.gstPercent) / 2).toFixed(1)}%</div>}
                    </div>
                    <div>
                      <label style={labelStyle}>Service Charge %</label>
                      <div style={{ position: 'relative' }}><input className="biz-input" type="number" min="0" max="30" step="0.5" value={form.serviceChargePercent} onChange={update('serviceChargePercent')} style={inputStyle} placeholder="0 to disable" /><span style={pctSuffixStyle}>%</span></div>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>GST Number (GSTIN)</label>
                    <input className="biz-input" value={form.gstNumber} onChange={update('gstNumber')} style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.05em' }} placeholder="e.g. 34FXKPK3964F1Z7" maxLength={15} />
                    <Hint text={hints.gstNumber} />
                    {!hints.gstNumber && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 4 }}>Optional. If blank, GSTIN won't appear on bills.</div>}
                  </div>
                </div>

                {/* Restaurant info */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="Restaurant info on bill" />
                  <div style={sectionDescStyle}>Shown at the top of printed bills and digital receipts.</div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Restaurant Name</label><input className="biz-input" value={form.restaurantName} onChange={update('restaurantName')} style={inputStyle} placeholder="Your restaurant name" /></div>
                  <div style={{ marginBottom: 14 }}><label style={labelStyle}>Address</label><textarea className="biz-input" value={form.address} onChange={update('address')} rows={2} style={{ ...inputStyle, resize: 'none', minHeight: 64, paddingTop: 10 }} placeholder="Full address for the bill header" /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={labelStyle}>Phone</label><input className="biz-input" value={form.phone} onChange={update('phone')} style={inputStyle} placeholder="e.g. 9994623456" /><Hint text={hints.phone} /></div>
                    <div><label style={labelStyle}>FSSAI Lic. No.</label><input className="biz-input" value={form.fssaiNo} onChange={update('fssaiNo')} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} placeholder="e.g. 22420539000181" maxLength={14} /><Hint text={hints.fssaiNo} /></div>
                  </div>
                </div>

                {/* Restaurant profile */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="Restaurant profile" />
                  <div style={sectionDescStyle}>Public details about your restaurant. Cuisine helps Google find you in local search.</div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Logo <span style={{ color: 'var(--tx-3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>· optional</span></label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 64, height: 64, borderRadius: 14, flexShrink: 0, background: logoUrl ? 'var(--card-2)' : 'linear-gradient(145deg,#B8472D,#F4C06A)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {logoUrl ? <img src={logoUrl} alt="Restaurant logo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={{ fontSize: 28 }}>🍽️</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => logoInputRef.current?.click()} disabled={logoBusy} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: logoBusy ? 'not-allowed' : 'pointer', opacity: logoBusy ? 0.6 : 1 }}>{logoBusy && logoProgress > 0 ? `Uploading ${logoProgress}%` : (logoUrl ? 'Replace logo' : 'Upload logo')}</button>
                          {logoUrl && !logoBusy && <button type="button" onClick={handleLogoRemove} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(217,83,79,0.30)', background: 'rgba(217,83,79,0.08)', color: 'var(--danger)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 8, lineHeight: 1.5 }}>Shows next to your restaurant name on the customer menu. Square images work best. Max 2 MB; we resize to 256×256.</div>
                      </div>
                      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} style={{ display: 'none' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Subdomain (Customer URL) — Read-only</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, padding: '10px 13px', background: 'var(--card-2)', border: '1px dashed var(--line)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--tx-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subdomain || '—'}</div>
                      <button onClick={handleCopySubdomain} disabled={!subdomain} style={{ padding: '0 14px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, cursor: subdomain ? 'pointer' : 'not-allowed', opacity: subdomain ? 1 : 0.4 }}>Copy URL</button>
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 6, lineHeight: 1.5 }}>Your customer menu lives at <strong style={{ color: 'var(--tx-2)' }}>/restaurant/{subdomain || 'your-subdomain'}</strong>. Locked because changing it would break printed QR codes.</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={labelStyle}>Cuisine Type</label><input className="biz-input" value={form.cuisine} onChange={update('cuisine')} style={inputStyle} placeholder="e.g. South Indian, Continental" /></div>
                    <div><label style={labelStyle}>City</label><input className="biz-input" value={form.city} onChange={update('city')} style={inputStyle} placeholder="e.g. Pondicherry" /></div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <label style={labelStyle}>Google Place ID <span style={{ color: 'var(--tx-3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>· optional</span></label>
                    <input className="biz-input" value={form.googlePlaceId} onChange={update('googlePlaceId')} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4" />
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 6, lineHeight: 1.5 }}>Powers the <strong style={{ color: 'var(--tx-2)' }}>“Leave a Google review”</strong> button on your feedback page. Leave blank to hide it.</div>
                  </div>
                </div>

                {/* Bill settings */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="Bill settings" />
                  <div style={sectionDescStyle}>Control what prints on customer bills. The layout follows the standard Indian thermal-bill format — toggle the optional parts and watch the live preview update.</div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Tax mode</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[{ id: 'regular', label: 'Regular GST', hint: 'GSTIN + CGST/SGST lines' }, { id: 'composition', label: 'Composition', hint: '"Bill of Supply" — no tax lines' }, { id: 'unregistered', label: 'Unregistered', hint: 'No GSTIN, no tax lines' }].map(m => {
                        const on = billSettings.taxMode === m.id;
                        return <button key={m.id} type="button" onClick={() => setBS('taxMode')(m.id)} style={{ flex: '1 1 140px', padding: '10px 12px', borderRadius: 9, textAlign: 'left', border: on ? '1.5px solid var(--gold)' : '1px solid var(--line)', background: on ? 'rgba(196,168,109,0.10)' : 'var(--card-2)', cursor: 'pointer' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{m.label}</div><div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--tx-3)', marginTop: 2 }}>{m.hint}</div></button>;
                      })}
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Legal entity line <span style={{ color: 'var(--tx-3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>· optional</span></label>
                    <input className="biz-input" value={billSettings.legalName} onChange={e => setBS('legalName')(e.target.value.slice(0, 80))} style={inputStyle} placeholder="e.g. A Unit of Golden Trio Hospitality Services" />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Printed sections</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px' }}>
                      {[['showLogo', 'Logo', 'Your uploaded logo, in print-grey'], ['showPhone', 'Phone number', ''], ['showCustomerName', '"Name:" line', 'Blank line for the customer name'], ['showCashier', 'Cashier name', 'Who billed it'], ['showTokens', 'Token numbers', 'Kitchen order no.s — "83, 92"'], ['showHsnLine', 'HSN/SAC line', 'GST compliance (Regular mode)'], ['showPaidVia', '"Paid via …" line', 'Cash / UPI / Card once paid'], ['showUpiQr', 'UPI QR on unpaid bills', 'Customer scans the printed bill to pay'], ['showFssai', 'FSSAI licence', '']].map(([key, label, hint]) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 6px', borderRadius: 7, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!billSettings[key]} onChange={e => setBS(key)(e.target.checked)} style={{ accentColor: 'var(--gold)', width: 15, height: 15, marginTop: 1, cursor: 'pointer' }} />
                          <span><span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)', display: 'block' }}>{label}</span>{hint && <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--tx-3)' }}>{hint}</span>}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>Paper width</label>
                      <div style={{ display: 'flex', gap: 8 }}>{[80, 58].map(w => <button key={w} type="button" onClick={() => setBS('paperWidth')(w)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: billSettings.paperWidth === w ? '1.5px solid var(--gold)' : '1px solid var(--line)', background: billSettings.paperWidth === w ? 'rgba(196,168,109,0.10)' : 'var(--card-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', cursor: 'pointer' }}>{w}mm</button>)}</div>
                    </div>
                    <div>
                      <label style={labelStyle}>Print size</label>
                      <div style={{ display: 'flex', gap: 8 }}>{[[1, 'Normal'], [1.15, 'Large']].map(([v, lab]) => <button key={lab} type="button" onClick={() => setBS('fontScale')(v)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: billSettings.fontScale === v ? '1.5px solid var(--gold)' : '1px solid var(--line)', background: billSettings.fontScale === v ? 'rgba(196,168,109,0.10)' : 'var(--card-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', cursor: 'pointer' }}>{lab}</button>)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div><label style={labelStyle}>HSN / SAC Code</label><input className="biz-input" value={form.hsnCode} onChange={update('hsnCode')} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} placeholder="9963" maxLength={8} /><Hint text={hints.hsnCode} />{!hints.hsnCode && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 4 }}>Default <strong>9963</strong> = restaurant services (SAC).</div>}</div>
                    <div />
                  </div>
                  <div>
                    <label style={labelStyle}>Bill Footer Message</label>
                    <input className="biz-input" value={form.billFooter} onChange={update('billFooter')} style={inputStyle} placeholder="Thank you! Visit again" maxLength={80} />
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 4 }}>Shown at the bottom of every printed bill. Leave blank to use the default.</div>
                  </div>
                </div>

                {/* UPI moved */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="UPI payment" rightBadge="Moved" />
                  <div style={sectionDescStyle}>Your UPI ID is now managed on the <strong style={{ color: 'var(--tx-2)' }}>Payment Gateway</strong> page, alongside Auto-Confirm UPI and the full Razorpay / Paytm checkout flows.</div>
                  <Link href="/admin/gateway-v2" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginTop: 4 }}>Open Payment Gateway →</Link>
                </div>

                {/* Daily summary email */}
                <div style={sectionCardStyle}>
                  <SectionHeader label="Daily summary email" />
                  <div style={sectionDescStyle}>Each night at midnight IST, you'll receive an email summarizing the day's orders, revenue, and top dishes. Override the recipient below — leave blank to use your login email.</div>
                  <div>
                    <label style={labelStyle}>Notifications email</label>
                    <input className="biz-input" type="email" value={form.notificationsEmail} onChange={update('notificationsEmail')} style={inputStyle} placeholder="owner@yourdomain.com (blank = use login email)" />
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 6, lineHeight: 1.5 }}>Where the daily report lands. Doesn't change your login email.</div>
                  </div>
                </div>
              </div>

              {/* Live bill preview */}
              <div className="biz-preview">
                <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '20px 22px', position: 'sticky', top: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Bill preview</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)' }}>Live</span>
                  </div>
                  <div style={{ background: '#F2F2EE', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)', padding: '14px 0', display: 'flex', justifyContent: 'center' }}>
                    <iframe title="Bill preview" srcDoc={previewSrcDoc} style={{ width: billSettings.paperWidth === 58 ? 232 : 318, height: 560, border: 'none', background: '#fff', boxShadow: '0 2px 14px rgba(0,0,0,0.4)' }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>Sample bill (Table 5 · Bill No. 142 · Tokens 83, 92). Updates as you type. Save to apply.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky unsaved bar */}
        {isDirty && !loading && (
          <div style={{ position: 'fixed', bottom: 0, left: 96, right: 0, zIndex: 120, background: 'var(--surface)', borderTop: '1px solid var(--line)', boxShadow: '0 -8px 24px rgba(0,0,0,0.4)', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', animation: 'ok-pulse 1.5s ease infinite' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>Unsaved changes</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>Save your changes to apply them to the next customer bills.</span>
            <span style={{ flex: 1 }} />
            <button onClick={handleDiscard} disabled={saving} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>Discard</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        )}
        <style>{`@media (max-width: 980px){ .biz-grid{ grid-template-columns: 1fr !important; } .biz-preview{ display:none; } }`}</style>
      </OkShell>
    </>
  );
}

BusinessInfoV2.getLayout = (page) => page;
