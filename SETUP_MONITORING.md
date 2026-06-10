# Monitoring Setup — Two 5-Minute Tasks for Prabu

The code side of error monitoring is fully wired (audit Phase B). Until
you do these two small signups, the app behaves exactly as before —
nothing breaks, you're just still "flying blind". After them, you get
an email whenever production has a problem.

---

## Task 1 — Sentry (error alarm) · ~5 minutes

Sentry catches every crash/error in the app — on customers' phones, in
API routes, and in the nightly cron jobs — and emails you.

1. Go to <https://sentry.io/signup/> → sign up (free plan is plenty:
   5,000 errors/month).
2. When asked to create a project: platform = **Next.js**, name =
   `halohelm`.
3. Sentry shows a **DSN** — a URL like
   `https://abc123@o4501234.ingest.us.sentry.io/4501234`. Copy it.
4. Open Vercel → halohelm project → **Settings → Environment
   Variables** → Add:
   - **Name:** `NEXT_PUBLIC_SENTRY_DSN`
   - **Value:** the DSN you copied
   - **Environments:** Production ✓ Preview ✓ Development ✓
5. Also add the same line to `.env.local` on your machine:
   `NEXT_PUBLIC_SENTRY_DSN=https://...`
6. Redeploy (Deployments → latest → ⋯ → Redeploy).

**Test it:** after the deploy, open the site, then ask Claude to "throw
a test error for Sentry" — it should appear at sentry.io within a
minute, and Sentry emails you.

*(Optional, later: adding `SENTRY_ORG`, `SENTRY_PROJECT` and a
`SENTRY_AUTH_TOKEN` env var makes error stack-traces point at readable
source code instead of minified bundles. Nice-to-have, not needed on
day one.)*

## Task 2 — UptimeRobot (is-the-site-up alarm) · ~5 minutes

Sentry only fires when code *runs* and fails. If the whole site is
unreachable (Vercel outage, domain expiry, broken deploy), nothing
runs — so a separate robot pings the site from outside.

1. Go to <https://uptimerobot.com> → sign up (free plan: 50 monitors,
   5-minute checks).
2. **Add New Monitor:**
   - Monitor type: **HTTP(s)**
   - Friendly name: `HaloHelm health`
   - URL: `https://halohelm.com/api/health`
   - Monitoring interval: 5 minutes
3. Add your email under **Alert Contacts** (it prompts you).

That URL is a special health check: it returns OK only when the app
AND the database both respond. So you'll be alerted for: site down,
domain broken, deploy broken, or Firestore unreachable.

---

## What's already wired in code (nothing for you to do)

| Where | What gets reported |
|---|---|
| Any page crash ("Something went wrong" screen) | error + which component |
| Nightly cron failures (daily summary, backup, Petpooja sync) | error + which cron |
| Payment webhook processing failure | error (money moved, order didn't flip) |
| Order created without a number (counter failure) | warning |
| Petpooja callback abuse / retry storms | warning |
| `/api/health` | live Firestore check for UptimeRobot |

All reporting is silent until `NEXT_PUBLIC_SENTRY_DSN` exists — the
app runs identically without it.
