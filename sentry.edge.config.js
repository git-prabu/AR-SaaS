// sentry.edge.config.js
// Edge-runtime Sentry init — covers middleware.js (the subdomain
// router). Loaded via instrumentation.js. No-op without DSN.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sharedOptions } from './lib/sentry.shared';

if (SENTRY_DSN) {
  Sentry.init(sharedOptions);
}
