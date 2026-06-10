// instrumentation.js
// Next.js instrumentation hook — runs once per server/edge runtime
// boot and loads the matching Sentry config. The client side loads
// instrumentation-client.js automatically.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors from nested React Server Components / route renders.
// Harmless under the Pages Router; future-proof if pages migrate.
export const onRequestError = Sentry.captureRequestError;
