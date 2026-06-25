// lib/sentry.shared.js
// Shared Sentry options used by client, server and edge inits.
//
// IMPORTANT: everything is gated on the DSN env var. With no DSN set
// (local dev, or before Prabu creates the Sentry project) Sentry.init
// is simply never called and the SDK is inert — zero behaviour change.
// See SETUP_MONITORING.md for the 5-minute setup.

export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '';

export const sharedOptions = {
  dsn: SENTRY_DSN,
  // Errors are the point; performance tracing at 10% keeps us far
  // inside the free tier while still surfacing slow-endpoint patterns.
  tracesSampleRate: 0.1,
  // Vercel exposes the commit SHA — lets Sentry group errors by deploy.
  release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  // Only report from real deployments. Local `next dev` (NODE_ENV !==
  // 'production') stays inert even when a DSN is present in .env.local, so
  // dev / test runs never page anyone. Vercel preview + production builds
  // run with NODE_ENV==='production', so they still report normally.
  enabled: process.env.NODE_ENV === 'production',
  // Noise filters: browser-extension junk + benign aborts that would
  // burn the free-tier quota without being actionable.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'AbortError',
    'Non-Error promise rejection captured',
  ],
};
