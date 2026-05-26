/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  compress: true,
  // Lint is run explicitly via `npm run lint`; don't fail production
  // builds on lint so a stray warning never blocks a deploy. (We still
  // catch real errors like undefined variables by running eslint in dev.)
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // Allow model-viewer custom element
  compiler: {
    styledComponents: false,
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // ── Security headers (added 2026-05-16) ────────────────────────────
  // Applied to every response. These are baseline defense-in-depth
  // headers recommended by OWASP for any production web app.
  //
  // What each one does:
  //
  //  - Strict-Transport-Security: tells browsers to never connect to
  //    halohelm.com over plain HTTP again, for 2 years. Includes
  //    subdomains. `preload` makes us eligible for Chrome/Firefox's
  //    HSTS preload list (browsers ship with us pre-marked HTTPS-only).
  //
  //  - X-Frame-Options: prevents halohelm.com from being embedded in
  //    an <iframe> on another site (defeats clickjacking attacks
  //    where an attacker overlays our admin login in an invisible
  //    iframe and tricks users into clicking through their UI).
  //
  //  - X-Content-Type-Options: prevents browsers from "MIME sniffing"
  //    a file's true type when our server sends `text/plain`.
  //    Stops a class of attacks where a user uploads an .html file
  //    we treat as text/plain but Chrome renders as HTML.
  //
  //  - Referrer-Policy: when a customer clicks a link to leave
  //    halohelm.com, the destination only sees the origin
  //    (`https://halohelm.com`), not the full URL (which could
  //    contain a session token or table sid).
  //
  //  - Permissions-Policy: disables browser features we don't use.
  //    Reduces attack surface if our app ever gets compromised via XSS.
  //
  // Intentionally NOT added yet:
  //  - Content-Security-Policy: more invasive — needs allowlisting
  //    every external script source we use (Firebase, Razorpay JS SDK,
  //    Google Fonts, Meshy AR viewer). Doing this carelessly breaks
  //    Google sign-in popups + AR rendering. Deferred to a separate
  //    phase with explicit per-page testing.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },

  // ── Clean staff URLs (2026-05-26) ──────────────────────────────────
  // Staff reuse the same feature pages as the owner, but a staffer seeing
  // "/admin/..." in the address bar is confusing. These afterFiles rewrites
  // serve the matching /admin/<feature> page under a clean /staff/<feature>
  // URL (the StaffShell sidebar + hub link to /staff/*). afterFiles runs
  // AFTER real pages, so /staff/login and /staff/home (real pages) are
  // unaffected — only feature paths with no real /staff page fall through.
  async rewrites() {
    return {
      afterFiles: [
        { source: '/staff/:feature', destination: '/admin/:feature' },
      ],
    };
  },
};

module.exports = nextConfig;
