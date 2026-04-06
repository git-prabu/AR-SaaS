import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, updateRestaurant } from '../../lib/db';
import toast from 'react-hot-toast';
import { T } from '../../lib/utils';

const S = {
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: T.stone, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', padding: '11px 14px', background: T.cream, border: `1.5px solid ${T.sand}`, borderRadius: 11, fontSize: 14, color: T.ink, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' },
  card: { background: T.white, border: `1px solid ${T.sand}`, borderRadius: T.radiusCard, padding: '24px 26px', marginBottom: 20, boxShadow: T.shadowCard },
};

export default function AdminSettings() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // GST & billing
  const [gstPercent, setGstPercent] = useState('');
  const [serviceChargePercent, setServiceChargePercent] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  // Restaurant info
  const [restaurantName, setRestaurantName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [fssaiNo, setFssaiNo] = useState('');

  // Payment
  const [upiId, setUpiId] = useState('');

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => {
      if (!r) return;
      setGstPercent(r.gstPercent !== undefined ? String(r.gstPercent) : '5');
      setServiceChargePercent(r.serviceChargePercent !== undefined ? String(r.serviceChargePercent) : '0');
      setGstNumber(r.gstNumber || '');
      setRestaurantName(r.name || '');
      setAddress(r.address || '');
      setPhone(r.phone || '');
      setFssaiNo(r.fssaiNo || '');
      setUpiId(r.upiId || '');
      setLoading(false);
    });
  }, [rid]);

  const handleSave = async () => {
    if (!rid) return;
    const gst = parseFloat(gstPercent);
    const sc = parseFloat(serviceChargePercent);
    if (isNaN(gst) || gst < 0 || gst > 100) { toast.error('GST must be between 0 and 100'); return; }
    if (isNaN(sc) || sc < 0 || sc > 30) { toast.error('Service charge must be between 0 and 30'); return; }
    setSaving(true);
    try {
      await updateRestaurant(rid, {
        gstPercent: gst,
        serviceChargePercent: sc,
        gstNumber: gstNumber.trim(),
        name: restaurantName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        fssaiNo: fssaiNo.trim(),
        upiId: upiId.trim(),
      });
      toast.success('Settings saved!');
    } catch (e) { toast.error('Failed to save: ' + e.message); }
    setSaving(false);
  };

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${T.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <Head><title>Settings | Advert Radical</title></Head>
      <div style={{ padding: '28px 32px', maxWidth: 720, paddingBottom: 60, fontFamily: T.font }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 800, fontSize: 22, color: T.ink }}>Settings</div>
          <div style={{ fontSize: 13, color: 'rgba(38,52,49,0.45)', marginTop: 4 }}>Manage GST, billing details, and restaurant info shown on bills</div>
        </div>

        {/* GST & Billing */}
        <div style={S.card}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>GST & Billing</div>
          <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.45)', marginBottom: 20 }}>These values appear on every customer bill. CGST & SGST will each be half of the GST %.</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={S.label}>GST % (Total)</label>
              <div style={{ position: 'relative' }}>
                <input type="number" min="0" max="100" step="0.5"
                  value={gstPercent} onChange={e => setGstPercent(e.target.value)}
                  style={S.input} placeholder="e.g. 5" />
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'rgba(38,52,49,0.4)', fontWeight: 600 }}>%</span>
              </div>
              {gstPercent && !isNaN(parseFloat(gstPercent)) && (
                <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.45)', marginTop: 6 }}>
                  CGST {(parseFloat(gstPercent) / 2).toFixed(1)}% + SGST {(parseFloat(gstPercent) / 2).toFixed(1)}%
                </div>
              )}
            </div>
            <div>
              <label style={S.label}>Service Charge %</label>
              <div style={{ position: 'relative' }}>
                <input type="number" min="0" max="30" step="0.5"
                  value={serviceChargePercent} onChange={e => setServiceChargePercent(e.target.value)}
                  style={S.input} placeholder="e.g. 3 (or 0 to disable)" />
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'rgba(38,52,49,0.4)', fontWeight: 600 }}>%</span>
              </div>
            </div>
          </div>

          <div>
            <label style={S.label}>GST Number (GSTIN)</label>
            <input value={gstNumber} onChange={e => setGstNumber(e.target.value)}
              style={{ ...S.input, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              placeholder="e.g. 34FXKPK3964F1Z7" maxLength={15} />
          </div>
        </div>

        {/* Restaurant Info */}
        <div style={S.card}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>Restaurant Info on Bill</div>
          <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.45)', marginBottom: 20 }}>Shown at the top of printed bills and digital receipts.</div>

          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Restaurant Name</label>
            <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)} style={S.input} placeholder="Your restaurant name" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2}
              style={{ ...S.input, resize: 'none' }} placeholder="Full address for the bill header" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={S.label}>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={S.input} placeholder="e.g. 9994623456" />
            </div>
            <div>
              <label style={S.label}>FSSAI Lic. No.</label>
              <input value={fssaiNo} onChange={e => setFssaiNo(e.target.value)} style={{ ...S.input, fontFamily: 'monospace' }} placeholder="e.g. 2242053900181" />
            </div>
          </div>
        </div>

        {/* UPI Payment Settings */}
        <div style={S.card}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 4 }}>UPI Payment</div>
          <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.45)', marginBottom: 20 }}>Allow customers to pay directly via UPI from their phone. Leave blank to hide UPI option on the bill.</div>

          <div>
            <label style={S.label}>UPI ID</label>
            <input value={upiId} onChange={e => setUpiId(e.target.value)}
              style={{ ...S.input, fontFamily: 'monospace' }}
              placeholder="e.g. yourrestaurant@ybl or 9876543210@paytm" />
            <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.4)', marginTop: 6 }}>
              Your UPI ID from GPay, PhonePe, Paytm, or any UPI app. Customers will be able to pay you directly.
            </div>
          </div>
        </div>

        {/* Preview */}
        <div style={{ background: 'rgba(196,168,109,0.05)', border: '1.5px solid rgba(196,168,109,0.2)', borderRadius: 16, padding: '18px 22px', marginBottom: 24 }}>
          <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 10 }}>Bill Preview</div>
          <div style={{ fontSize: 12, color: 'rgba(38,52,49,0.6)', lineHeight: 1.8, fontFamily: 'monospace' }}>
            <div style={{ fontWeight: 700, fontSize: 14, textAlign: 'center' }}>{restaurantName || 'Your Restaurant'}</div>
            {address && <div style={{ textAlign: 'center', marginTop: 2 }}>{address}</div>}
            {phone && <div style={{ textAlign: 'center' }}>Phone: {phone}</div>}
            {gstNumber && <div style={{ textAlign: 'center' }}>GSTIN: {gstNumber}</div>}
            <div style={{ borderTop: '1px dashed rgba(38,52,49,0.2)', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹XXX.00</span></div>
            {parseFloat(serviceChargePercent) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Service Charge ({serviceChargePercent}%)</span><span>₹XX.XX</span></div>}
            {parseFloat(gstPercent) > 0 && <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>C.G.S.T {(parseFloat(gstPercent)/2).toFixed(1)}%</span><span>₹XX.XX</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>S.G.S.T {(parseFloat(gstPercent)/2).toFixed(1)}%</span><span>₹XX.XX</span></div>
            </>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Round off</span><span>+0.XX</span></div>
            <div style={{ borderTop: '1px dashed rgba(38,52,49,0.2)', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}><span>Grand Total</span><span>₹XXX</span></div>
            {fssaiNo && <div style={{ marginTop: 6, textAlign: 'center', fontSize: 11 }}>FSSAI Lic. No. {fssaiNo}</div>}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saving ? 'rgba(38,52,49,0.2)' : T.accent, color: saving ? 'rgba(38,52,49,0.4)' : T.shellText, fontWeight: 700, fontSize: 15, fontFamily: T.fontDisplay }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </AdminLayout>
  );
}
