# Superadmin 2FA Setup — ~10 Minutes, One Time

Your superadmin login controls every restaurant on the platform. Right
now it's protected by one password. This adds the standard "6-digit
code from an authenticator app" second step.

The code is already deployed and **dormant** — these steps switch it on.

## Step 1 — Install an authenticator app on your phone (2 min)

Any of these (all free): **Google Authenticator** (simplest),
Microsoft Authenticator, Authy. Install from the Play Store / App
Store and skip their account-creation prompts if offered — the app
works standalone.

## Step 2 — Turn on TOTP in Firebase (3 min)

1. Open <https://console.firebase.google.com/project/advert-radical/authentication/settings>
2. Find **SMS multi-factor authentication / Multi-factor** section →
   if you see an **Upgrade to Identity Platform** prompt, click it
   (free tier covers our usage; it's a Google-side feature unlock,
   not a paid plan).
3. Under multi-factor options, **enable "Authenticator app (TOTP)"**
   and Save.

## Step 3 — Turn on enforcement in Vercel (2 min)

1. Vercel → halohelm project → Settings → Environment Variables → Add:
   - **Name:** `NEXT_PUBLIC_SA_MFA_ENFORCE`
   - **Value:** `true`
   - Environments: Production ✓ Preview ✓ Development ✓
2. Redeploy (Deployments → latest → ⋯ → Redeploy).

## Step 4 — Enroll (3 min)

1. Go to `halohelm.com/superadmin/login` and sign in with email +
   password as usual.
2. Instead of the dashboard, you'll see **"Protect this account"**
   with a QR code.
3. Open your authenticator app → Add (+) → Scan QR code → scan it.
4. **Write down the "Can't scan?" manual key on paper** and keep it
   somewhere safe — it's your backup if you ever lose the phone.
5. Type the 6-digit code the app shows → **Enable 2FA**.

Done. Every future superadmin login asks for the current 6-digit code
after your password.

## If you lose your phone

1. Open Firebase Console → Authentication → Users → click your
   superadmin user.
2. Remove the **Multi-factor** enrollment from the user's detail panel.
3. Sign in with just the password and re-enroll with the new phone
   (Step 4 repeats automatically).

Your Firebase Console itself is protected by your Google account,
which has its own recovery — so you can always get back in.

## Notes

- Once a factor is enrolled, **Firebase itself** demands the code at
  login — removing the env flag does NOT remove the code prompt. The
  flag only controls whether un-enrolled superadmins are forced to
  enroll.
- Restaurant owners and staff are unaffected — this is only for
  `/superadmin/login`.
