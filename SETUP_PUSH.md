# Push Notifications Setup — One-Time Steps

This doc walks you through the **one-time setup** needed before the
"Enable notifications" buttons on `/admin/kitchen-new` and
`/admin/orders` actually deliver chimes to a locked phone or closed
browser.

All of the *code* is already in this repo. What's left is:

1. Generate a VAPID key (Firebase Console) → paste into env
2. Install the Cloud Functions dependencies
3. Deploy the Cloud Functions
4. Test it

If anything goes wrong, jump to [Troubleshooting](#troubleshooting).

---

## 1. Generate the VAPID key (5 minutes)

A VAPID key is the cryptographic identity that proves to the browser
"yes, push messages coming from this Firebase project are legitimate."

1. Open the Firebase Console: <https://console.firebase.google.com/>
2. Pick your project (the one whose values are in `.env.local`).
3. Click the **gear icon** → **Project settings**.
4. Top tabs → **Cloud Messaging**.
5. Scroll to **Web configuration** → **Web Push certificates**.
6. If no key pair exists yet, click **Generate key pair**.
7. Copy the **Key pair** value (a long string starting with `B…`).

**Paste it into `.env.local`:**

```
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNQ...your-key-here...
```

**Also paste it into Vercel** (so production has it):

1. <https://vercel.com/> → your project → Settings → Environment Variables
2. Add `NEXT_PUBLIC_FIREBASE_VAPID_KEY` with the same value
3. Apply to: Production, Preview, Development
4. Trigger a redeploy (or it'll pick up on the next push)

---

## 2. Install Cloud Functions dependencies (one-time)

You need the Firebase CLI installed globally. If you've never used it:

```
npm install -g firebase-tools
firebase login
```

Then install the functions deps:

```
cd functions
npm install
cd ..
```

This downloads `firebase-admin` and `firebase-functions` into
`functions/node_modules`. The folder is `.gitignore`d so it won't
bloat the repo.

---

## 3. Deploy the Cloud Functions

From the repo root:

```
firebase deploy --only functions
```

First deploy takes 5–10 minutes (Firebase has to provision a build
container, install dependencies, deploy 3 functions). Subsequent
deploys are 1–2 minutes.

The 3 functions deployed are:

- `onOrderCreated`  → fires when a new order is written. Notifies kitchen staff.
- `onOrderUpdated`  → fires when an order's status flips to `ready` OR when payment is requested. Notifies waiter / orders staff.
- `onWaiterCallCreated` → fires when a guest taps a call button. Notifies waiter / orders staff.

You can confirm they deployed by going to:
<https://console.firebase.google.com/> → Functions

You should see all 3 with green checkmarks.

---

## 4. Test it

### Android Chrome (the easy case)

1. Open `halohelm.com/admin/kitchen-new` on the Android phone.
2. Sign in as staff or admin.
3. Tap the new bell-with-slash icon (🔕) in the apphead.
4. Browser asks: "halohelm.com wants to show notifications" → Allow.
5. Icon changes to 🔔 + a toast says "Notifications on…"
6. Lock the phone.
7. From a desktop or another phone, place a test order on
   `/menu/<your-subdomain>` → confirm a chime + banner appears on the
   locked Android phone within a couple seconds.

### iPhone Safari (extra step)

iOS Safari only delivers web push to **installed PWAs**, not regular
Safari tabs. The user MUST:

1. Open `halohelm.com` in Safari (NOT Chrome — Safari only).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Close Safari.
4. Tap the new HaloHelm icon on the home screen (NOT in Safari).
5. Sign in.
6. Tap the bell-with-slash icon → Allow.
7. From there it works the same as Android.

If the user skips the "Add to Home Screen" step, the PushToggle shows
🚫 and the tooltip explains why. There's nothing the app can do to
force iOS Safari to deliver push outside an installed PWA — it's an
Apple-side restriction.

### Desktop Chrome / Edge / Firefox

Works the same as Android Chrome. You don't even need to lock the
machine — closing the browser tab is enough to confirm push delivers
via the service worker (and not via the in-app sound code).

---

## How the system works (for reference)

```
[customer places order]
  ↓ Firestore write: restaurants/{rid}/orders/{id}
  ↓
[Cloud Function: onOrderCreated]
  → reads pushSubscribers where perms includes 'kitchenStation'
  → builds FCM payload (title, body, tag, url)
  → admin.messaging().sendEachForMulticast(...)
    ↓
[Google FCM infrastructure]
  → routes to each subscribed device
    ↓
[firebase-messaging-sw.js on the kitchen phone]
  → receives 'push' event
  → calls self.registration.showNotification(...)
  → OS plays chime + shows banner (even when phone is locked)
```

When the user taps the notification, the SW's `notificationclick`
handler focuses the existing kitchen tab or opens a new one at the
right URL (`/admin/kitchen-new` for orders, `/admin/orders` for waiter
events).

---

## Troubleshooting

**"Tap the bell, but the toast says 'Push notifications aren't configured yet.'"**

The VAPID key (`NEXT_PUBLIC_FIREBASE_VAPID_KEY`) is missing. Re-do
[step 1](#1-generate-the-vapid-key-5-minutes). Don't forget to set
it in BOTH `.env.local` (local) and Vercel (production), then redeploy.

**"Tap the bell, allow permission, but no chime when test order is placed."**

1. Check the Cloud Function actually deployed:
   `firebase functions:log` should show `[push:onOrderCreated]` lines.
2. If you see `subs=0`, the subscription doc didn't land in Firestore.
   Check `restaurants/{your-rid}/pushSubscribers/` in the console.
3. If you see `subs=1 sent=0 failed=1`, the token was rejected — likely
   a VAPID mismatch. Make sure the same VAPID key is in `.env.local`
   AND in `functions/index.js`'s Firebase project AND in Vercel.

**"Push works on my Pixel but not on the chef's old Android phone."**

Some older Android Chrome builds (pre-2022) have flaky FCM delivery
when battery saver is on. Disable battery saver / battery optimisation
for Chrome on that device, and have the chef tap the bell again to
re-subscribe.

**"iPhone, even after Add to Home Screen, the bell shows 🚫."**

Make sure the phone is on iOS 16.4 or newer. Older iOS doesn't have
web push at all.

**"I want to silence one specific event type but keep others on."**

Per-event filtering isn't wired yet — current MVP is all-or-nothing
per device. If you want kitchen to only get new-order pushes and
waiter to only get call/ready/payment pushes, the permission system
already does that: a kitchen-only staff (perm `kitchenStation` but
not `orders`) only gets order pushes; a waiter-only staff (perm
`orders` but not `kitchenStation`) only gets call/ready/payment
pushes. Admins get everything.

---

## Files involved

- `lib/fcm.js` — client-side subscribe / unsubscribe
- `components/order-kitchen/PushToggle.js` — the bell button
- `public/firebase-messaging-sw.js` — auto-generated, handles push events
- `scripts/generate-fcm-sw.js` — generator script
- `functions/index.js` — Cloud Functions (3 triggers)
- `functions/package.json` — Cloud Functions deps
- `firestore.rules` — pushSubscribers/{tokenId} rules
- `firebase.json` — functions deploy config

Don't edit `public/firebase-messaging-sw.js` directly — it gets
regenerated on every `npm run dev` / `npm run build`. Edit the
template in `scripts/generate-fcm-sw.js` instead.
