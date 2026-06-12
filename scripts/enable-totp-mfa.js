#!/usr/bin/env node
// scripts/enable-totp-mfa.js
// ═══════════════════════════════════════════════════════════════════════
// One-time: enable TOTP (authenticator-app) MFA on Firebase Auth.
// (2026-06-12, audit #10 — superadmin 2FA, console-free path.)
// ═══════════════════════════════════════════════════════════════════════
//
// Does programmatically what SETUP_MFA.md step 2 described as console
// clicks, using the Identity Toolkit Admin v2 API with the service
// account from .env.local:
//
//   1. GET  admin/v2/projects/{pid}/config        — current MFA state
//   2. If the project hasn't been upgraded to Identity Platform yet:
//      POST v2/projects/{pid}/identityPlatform:initializeAuth
//   3. PATCH config?updateMask=mfa — providerConfigs TOTP ENABLED
//      (adjacentIntervals 5 = accepts codes ±2.5 min of clock skew,
//      Google's recommended default)
//   4. GET again to verify.
//
// Idempotent — re-running reports "already enabled" and changes nothing.
//
// Run from repo root:   node scripts/enable-totp-mfa.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const { JWT } = require('google-auth-library');

const PID = process.env.FIREBASE_ADMIN_PROJECT_ID;
const BASE = 'https://identitytoolkit.googleapis.com';

async function main() {
  const client = new JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const { token } = await client.getAccessToken();
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const getConfig = async () => {
    const res = await fetch(`${BASE}/admin/v2/projects/${PID}/config`, { headers: H });
    return { status: res.status, body: await res.json() };
  };

  console.log(`Project: ${PID}`);
  let cfg = await getConfig();

  // Plain Firebase Auth (not yet Identity Platform) returns 403/404 on
  // the admin v2 config — upgrade in place. The upgrade keeps every
  // existing user/password untouched; it only unlocks the GCIP feature
  // set (which includes TOTP MFA). Free tier covers our volume.
  if (cfg.status === 403 || cfg.status === 404) {
    console.log(`admin config not reachable (${cfg.status}) — initializing Identity Platform…`);
    const up = await fetch(`${BASE}/v2/projects/${PID}/identityPlatform:initializeAuth`, {
      method: 'POST', headers: H, body: '{}',
    });
    const upBody = await up.json();
    if (!up.ok) {
      console.error('✗ initializeAuth failed:', JSON.stringify(upBody.error || upBody).slice(0, 400));
      console.error('  Fallback: enable it once in the console — SETUP_MFA.md step 2.');
      process.exit(1);
    }
    console.log('✓ Identity Platform initialized.');
    cfg = await getConfig();
  }

  if (cfg.status !== 200) {
    console.error('✗ could not read auth config:', cfg.status, JSON.stringify(cfg.body).slice(0, 300));
    process.exit(1);
  }

  const provs = cfg.body?.mfa?.providerConfigs || [];
  const totp = provs.find(p => p.totpProviderConfig);
  if (totp?.state === 'ENABLED') {
    console.log('✓ TOTP MFA already ENABLED — nothing to do.');
    return;
  }

  console.log('Enabling TOTP provider…');
  const patch = await fetch(`${BASE}/admin/v2/projects/${PID}/config?updateMask=mfa`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      mfa: {
        providerConfigs: [
          { state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } },
        ],
      },
    }),
  });
  const patched = await patch.json();
  if (!patch.ok) {
    console.error('✗ PATCH failed:', JSON.stringify(patched.error || patched).slice(0, 400));
    process.exit(1);
  }

  const after = await getConfig();
  const ok = (after.body?.mfa?.providerConfigs || []).some(p => p.totpProviderConfig && p.state === 'ENABLED');
  console.log(ok
    ? '✓ TOTP MFA is now ENABLED on Firebase Auth. Superadmin login can enroll an authenticator app.'
    : '✗ PATCH returned OK but verification failed — check the console.');
  if (!ok) process.exit(1);
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
