// sentry.server.config.js
// Server-side (Node runtime) Sentry init — covers API routes, SSR and
// the cron endpoints. Loaded via instrumentation.js. No-op without DSN.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sharedOptions } from './lib/sentry.shared';

if (SENTRY_DSN) {
  Sentry.init(sharedOptions);
}
