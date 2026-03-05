// pages/admin/qrcode.js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const SIZES = [
  { label: 'Small',  value: 256,  desc: 'Table card' },
  { label: 'Medium', value: 512,  desc: 'Menu insert' },
  { label: 'Large',  value: 1024, desc: 'Print / poster' },
];

const STYLES = [
  { label: 'Dark',  bg: '#09090B', fg: '#FF6B35', border: '#27272E' },
  { label: 'Light', bg: '#FFFFFF', fg: '#FF6B35', border: '#E5E5E5' },
  { label: 'Brand', bg: '#FF6B35', fg: '#FFFFFF', border: '#FF8C5A' },
];

export default function AdminQRCode() {
  const { userData }                  = useAuth();
  const [restaurant, setRestaurant]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [qrDataURL, setQrDataURL]     = useState(null);
  const [selectedSize, setSelectedSize]   = useState(SIZES[1]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [generating, setGenerating]   = useState(false);
  const canvasRef = useRef(null);

  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => {
      setRestaurant(r);
      setLoading(false);
    });
  }, [rid]);

  // Auto-generate whenever restaurant, size, or style changes
  useEffect(() => {
    if (!restaurant?.subdomain) return;
    generateQR();
  }, [restaurant, selectedSize, selectedStyle]);

  const getMenuURL = () => {
    const subdomain = restaurant?.subdomain || '';
    // In production: https://subdomain.advertradical.com
    // For local dev we show the localhost version too
    return `https://${subdomain}.advertradical.com`;
  };

  const generateQR = async () => {
    if (!restaurant?.subdomain) return;
    setGenerating(true);
    try {
      const url = getMenuURL();
      const dataURL = await QRCode.toDataURL(url, {
        width:           selectedSize.value,
        margin:          3,
        color: {
          dark:  selectedStyle.fg,
          light: selectedStyle.bg,
        },
        errorCorrectionLevel: 'H',
      });
      setQrDataURL(dataURL);
    } catch (err) {
      toast.error('Failed to generate QR code');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const downloadQR = () => {
    if (!qrDataURL) return;
    const link = document.createElement('a');
    link.download = `${restaurant.subdomain}-ar-menu-qr-${selectedSize.value}px.png`;
    link.href = qrDataURL;
    link.click();
    toast.success('QR code downloaded!');
  };

  const copyURL = () => {
    navigator.clipboard.writeText(getMenuURL());
    toast.success('Menu URL copied!');
  };

  const printQR = () => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>${restaurant.name} — AR Menu QR Code</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              display: flex; flex-direction: column;
              align-items: center; justify-content: center;
              min-height: 100vh;
              background: ${selectedStyle.bg};
              font-family: 'Arial', sans-serif;
              padding: 40px;
            }
            .card {
              background: ${selectedStyle.bg};
              border: 2px solid ${selectedStyle.border};
              border-radius: 24px;
              padding: 40px;
              text-align: center;
              max-width: 480px;
            }
            img { width: 320px; height: 320px; border-radius: 12px; }
            h1 {
              font-size: 28px; font-weight: 800;
              color: ${selectedStyle.fg};
              margin-top: 24px;
            }
            p {
              font-size: 14px;
              color: ${selectedStyle.fg}99;
              margin-top: 8px;
            }
            .badge {
              display: inline-block;
              margin-top: 16px;
              padding: 6px 16px;
              background: ${selectedStyle.fg}20;
              border: 1px solid ${selectedStyle.fg}40;
              border-radius: 999px;
              font-size: 12px;
              font-weight: 600;
              color: ${selectedStyle.fg};
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <img src="${qrDataURL}" alt="QR Code" />
            <h1>${restaurant.name}</h1>
            <p>Scan to view our menu in Augmented Reality</p>
            <div class="badge">⬡ AR Menu</div>
          </div>
        </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Head><title>QR Code — Advert Radical</title></Head>
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display font-bold text-2xl">QR Code Generator</h1>
          <p className="text-text-secondary text-sm mt-1">
            Download and print your AR menu QR code for tables, menus, and posters.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">

          {/* LEFT — Preview */}
          <div className="flex flex-col items-center gap-5">
            {/* QR Preview card */}
            <div
              className="w-full rounded-3xl p-8 flex flex-col items-center gap-4 border transition-all"
              style={{
                background: selectedStyle.bg,
                borderColor: selectedStyle.border,
              }}
            >
              {/* QR Image */}
              <div className="relative w-52 h-52 rounded-2xl overflow-hidden">
                {generating ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: selectedStyle.bg }}
                  >
                    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : qrDataURL ? (
                  <img
                    src={qrDataURL}
                    alt="QR Code"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-4xl"
                    style={{ background: selectedStyle.bg }}
                  >
                    📱
                  </div>
                )}
              </div>

              {/* Restaurant info on card */}
              <div className="text-center">
                <div
                  className="font-display font-bold text-xl"
                  style={{ color: selectedStyle.fg }}
                >
                  {restaurant?.name}
                </div>
                <div
                  className="text-sm mt-1"
                  style={{ color: selectedStyle.fg + '99' }}
                >
                  Scan to view our AR Menu
                </div>
                <div
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
                  style={{
                    background: selectedStyle.fg + '20',
                    color: selectedStyle.fg,
                    border: `1px solid ${selectedStyle.fg}40`,
                  }}
                >
                  <span>⬡</span> AR Enabled
                </div>
              </div>
            </div>

            {/* URL display */}
            <div className="w-full flex items-center gap-2 px-4 py-3 bg-bg-surface border border-bg-border rounded-xl">
              <span className="text-text-muted text-xs flex-shrink-0">🔗</span>
              <span className="text-xs text-text-secondary font-mono flex-1 truncate">
                {getMenuURL()}
              </span>
              <button
                onClick={copyURL}
                className="text-xs text-brand hover:underline flex-shrink-0"
              >
                Copy
              </button>
            </div>

            {/* Action buttons */}
            <div className="w-full grid grid-cols-2 gap-3">
              <button
                onClick={downloadQR}
                disabled={!qrDataURL || generating}
                className="py-3 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #FF6B35, #FFB347)' }}
              >
                <span>⬇</span> Download
              </button>
              <button
                onClick={printQR}
                disabled={!qrDataURL || generating}
                className="py-3 rounded-xl font-medium text-sm border border-bg-border bg-bg-surface text-text-primary flex items-center justify-center gap-2 disabled:opacity-40 hover:border-brand/40 transition-all"
              >
                <span>🖨</span> Print
              </button>
            </div>
          </div>

          {/* RIGHT — Controls */}
          <div className="space-y-6">

            {/* Size selector */}
            <div>
              <h3 className="font-display font-semibold text-sm mb-3 text-text-secondary uppercase tracking-wider">
                Size
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {SIZES.map(size => (
                  <button
                    key={size.label}
                    onClick={() => setSelectedSize(size)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedSize.label === size.label
                        ? 'border-brand bg-brand/10'
                        : 'border-bg-border bg-bg-surface hover:border-brand/30'
                    }`}
                  >
                    <div className={`font-semibold text-sm ${selectedSize.label === size.label ? 'text-brand' : 'text-text-primary'}`}>
                      {size.label}
                    </div>
                    <div className="text-text-muted text-xs mt-0.5">{size.desc}</div>
                    <div className="text-text-muted text-xs">{size.value}px</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Style selector */}
            <div>
              <h3 className="font-display font-semibold text-sm mb-3 text-text-secondary uppercase tracking-wider">
                Color Style
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {STYLES.map(style => (
                  <button
                    key={style.label}
                    onClick={() => setSelectedStyle(style)}
                    className={`p-3 rounded-xl border transition-all ${
                      selectedStyle.label === style.label
                        ? 'border-brand'
                        : 'border-bg-border hover:border-brand/30'
                    }`}
                    style={{ background: style.bg }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ background: style.fg }} />
                      <div className="w-3 h-3 rounded-full" style={{ background: style.bg, border: `1px solid ${style.border}` }} />
                    </div>
                    <div
                      className="font-semibold text-sm"
                      style={{ color: style.fg }}
                    >
                      {style.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Usage tips */}
            <div className="bg-bg-surface border border-bg-border rounded-2xl p-5 space-y-3">
              <h3 className="font-display font-semibold text-sm">Usage Tips</h3>
              {[
                { icon: '🍽️', tip: 'Print Small size for table cards and menu inserts' },
                { icon: '📋', tip: 'Use Medium for A4 menu booklet inserts' },
                { icon: '🖼️', tip: 'Use Large for wall posters and standees' },
                { icon: '🌙', tip: 'Dark style works best on light-colored menus' },
                { icon: '☀️', tip: 'Light style works best on dark table mats' },
              ].map(({ icon, tip }) => (
                <div key={tip} className="flex items-start gap-2.5">
                  <span className="text-base flex-shrink-0">{icon}</span>
                  <span className="text-xs text-text-secondary leading-relaxed">{tip}</span>
                </div>
              ))}
            </div>

            {/* Regenerate button */}
            <button
              onClick={generateQR}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-medium border border-bg-border bg-bg-surface text-text-secondary hover:text-text-primary hover:border-brand/40 transition-all disabled:opacity-40"
            >
              {generating ? 'Generating…' : '↺ Regenerate QR Code'}
            </button>
          </div>
        </div>

        {/* Bottom — what the customer sees */}
        <div className="mt-10 bg-bg-surface border border-bg-border rounded-2xl p-6">
          <h3 className="font-display font-semibold mb-4">What your customer does</h3>
          <div className="flex items-center gap-0">
            {[
              { icon: '📱', step: '1', label: 'Scan QR code with phone camera' },
              { icon: '🌐', step: '2', label: 'Menu opens in browser instantly' },
              { icon: '🥗', step: '3', label: 'Tap any dish to see details' },
              { icon: '🔮', step: '4', label: 'Tap "View in AR" to see it in 3D' },
            ].map((s, i, arr) => (
              <div key={s.step} className="flex items-center flex-1">
                <div className="flex flex-col items-center text-center flex-1">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center mb-2">
                    {s.step}
                  </div>
                  <div className="text-xs text-text-secondary leading-tight px-2">{s.label}</div>
                </div>
                {i < arr.length - 1 && (
                  <div className="text-text-muted text-lg flex-shrink-0">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

AdminQRCode.getLayout = (page) => page;
