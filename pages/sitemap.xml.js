// pages/sitemap.xml.js
//
// Dynamic sitemap that lists every public, indexable URL on halohelm.com.
// Includes:
//   - The static marketing + legal pages (/, /privacy, /terms, /pitch, /signup)
//   - Every active restaurant's public menu page (/restaurant/{subdomain})
//
// Google + Bing read sitemap.xml to discover pages fast. Without it, they'd
// have to crawl link-by-link from the homepage. Adding new restaurant menu
// pages here means they get indexed within hours instead of weeks.
//
// Regenerated on every request (no Firestore cache here — small list, cheap
// query). If the restaurant count grows past ~1000 we'd want to cache this
// via Vercel Edge / ISR; for now a fresh fetch each time is fine.

import { adminDb } from '../lib/firebaseAdmin';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://halohelm.com';

function urlEntry({ loc, changefreq = 'weekly', priority = 0.5, lastmod }) {
  return `  <url>
    <loc>${SITE_URL}${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function getServerSideProps({ res }) {
  // ─── Static pages (always present) ─────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);

  const staticEntries = [
    { loc: '/',        changefreq: 'weekly',  priority: 1.0, lastmod: today },
    { loc: '/pitch',   changefreq: 'monthly', priority: 0.6, lastmod: today },
    { loc: '/signup',  changefreq: 'monthly', priority: 0.8, lastmod: today },
    { loc: '/privacy', changefreq: 'monthly', priority: 0.3, lastmod: today },
    { loc: '/terms',   changefreq: 'monthly', priority: 0.3, lastmod: today },
  ];

  // ─── Restaurant menu pages (one per active restaurant) ─────────────
  // Public menus are real content people may link to. Index them.
  let restaurantEntries = [];
  try {
    const snap = await adminDb.collection('restaurants')
      .where('isActive', '==', true)
      .get();
    restaurantEntries = snap.docs
      .map(d => {
        const subdomain = (d.data().subdomain || '').toLowerCase().trim();
        if (!subdomain) return null;
        return {
          loc: `/restaurant/${encodeURIComponent(subdomain)}`,
          changefreq: 'daily', // menus update often
          priority: 0.7,
          lastmod: today,
        };
      })
      .filter(Boolean);
  } catch (err) {
    // If Firestore is down, ship a sitemap with just the static pages.
    // Better than failing the whole sitemap (which would hurt SEO).
    console.warn('[sitemap] restaurant fetch failed:', err?.message);
  }

  const allEntries = [...staticEntries, ...restaurantEntries];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries.map(urlEntry).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  // Cache at the CDN edge for 1 hour so repeat sitemap fetches don't
  // hit Firestore every time. Stale-while-revalidate keeps it warm.
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.write(xml);
  res.end();

  return { props: {} };
}

// Page component never renders — getServerSideProps writes the XML
// response directly. This null component just satisfies Next.js.
export default function Sitemap() { return null; }
