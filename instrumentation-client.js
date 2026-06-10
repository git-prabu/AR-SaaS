// instrumentation-client.js
// Client-side Sentry init. Next.js loads this automatically in the
// browser bundle. No-op when no DSN is configured (see lib/sentry.shared).
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, sharedOptions } from './lib/sentry.shared';

if (SENTRY_DSN) {
  Sentry.init({
    ...sharedOptions,
    // Session replay would burn the free quota fast on a busy
    // restaurant floor; errors-only is the right starting point.
    integrations: [],
  });
}

// Required by @sentry/nextjs to instrument client-side navigations
// (App Router API but harmless + future-proof under Pages Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
