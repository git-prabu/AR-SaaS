# Advert Radical 🥗

**AR-Based Multi-Tenant Restaurant SaaS Platform**

Customers scan a QR code → see your menu items in 3D augmented reality.
Each restaurant gets its own subdomain, admin dashboard, and subscription plan.

---

## Tech Stack

| Layer      | Technology                            |
|------------|---------------------------------------|
| Frontend   | Next.js 14 (Pages Router) + TailwindCSS |
| Backend    | Firebase Auth + Firestore + Storage   |
| AR Viewer  | `<model-viewer>` + WebXR              |
| Payments   | Razorpay Subscription API             |
| Hosting    | Vercel (recommended) or Firebase Hosting |

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.local.example .env.local
# Fill in your Firebase and Razorpay credentials
```

### 3. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Enable **Authentication** → Email/Password
4. Create **Firestore Database** (start in test mode, then deploy rules)
5. Enable **Firebase Storage**
6. Copy your web app config into `.env.local`

**Deploy Firestore Rules:**
```bash
firebase deploy --only firestore:rules
```

### 4. Create Super Admin Account

In Firebase Console → Authentication → Add User:
- Email: `admin@advertradical.com`
- Password: (your choice)

Then in Firestore → `users` collection → Add document with ID = `{uid}`:
```json
{
  "email": "admin@advertradical.com",
  "role": "superadmin",
  "createdAt": "<timestamp>"
}
```

### 5. Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

---

## Project Structure

```
advert-radical/
├── pages/
│   ├── index.js                     # Marketing homepage
│   ├── restaurant/[subdomain]/      # Public AR menu (customer-facing)
│   │   └── index.js
│   ├── admin/                       # Restaurant admin portal
│   │   ├── login.js
│   │   ├── index.js                 # Dashboard overview
│   │   ├── requests.js              # Submit menu item requests
│   │   ├── analytics.js             # Visit & AR stats
│   │   ├── offers.js                # Create/manage promotions
│   │   └── subscription.js          # Plan & billing
│   ├── superadmin/                  # Platform owner portal
│   │   ├── login.js
│   │   ├── index.js                 # Platform overview
│   │   ├── restaurants.js           # Manage all restaurants
│   │   └── requests.js              # Review & approve item requests
│   └── api/
│       └── payments/
│           ├── create-order.js      # Razorpay order creation
│           └── verify.js            # Payment verification & plan update
├── components/
│   ├── layout/
│   │   ├── AdminLayout.jsx          # Restaurant admin sidebar layout
│   │   └── SuperAdminLayout.jsx     # Super admin sidebar layout
│   └── ARViewer.jsx                 # model-viewer AR component
├── lib/
│   ├── firebase.js                  # Firebase client SDK
│   ├── firebaseAdmin.js             # Firebase Admin (server-side only)
│   ├── db.js                        # Firestore helper functions
│   └── storage.js                   # Firebase Storage helpers
├── hooks/
│   └── useAuth.js                   # Auth context + hook
├── styles/
│   └── globals.css                  # Global styles + custom fonts
├── middleware.js                    # Subdomain routing
├── firestore.rules                  # Security rules
└── .env.local.example               # Environment variables template
```

---

## How Subdomain Routing Works

1. DNS wildcard: `*.advertradical.com → your hosting IP`
2. Next.js `middleware.js` intercepts every request
3. Extracts subdomain from hostname (e.g., `spot` from `spot.advertradical.com`)
4. Rewrites the URL to `/restaurant/spot` internally
5. The menu page fetches the restaurant by subdomain from Firestore

**For local development**, add `?sub=spotname` to your URL:
```
http://localhost:3000?sub=spot
```

---

## User Flow

### Customer
1. Scan QR code at restaurant
2. Opens `restaurantname.advertradical.com`
3. Browse menu by category
4. Tap item → see nutrition + ingredients
5. Tap "View in AR" → camera opens → place food in real world

### Restaurant Admin
1. Login at `/admin`
2. Submit item request (name, description, ingredients, photo)
3. Wait for Super Admin to review & upload 3D model
4. View analytics (visits, item views, AR launches)
5. Create offers, manage subscription

### Super Admin (You)
1. Login at `/superadmin`
2. Create restaurant accounts (auto-creates Firebase Auth user)
3. Review pending item requests
4. Upload optimized `.glb` 3D model
5. Approve → item goes live on restaurant's AR menu

---

## 3D Model Requirements

- Format: `.glb` (binary GLTF)
- Recommended size: < 5MB per model
- Use Draco compression for best performance
- Free tools: [Blender](https://blender.org), [gltf.report](https://gltf.report/)

---

## Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# Configure wildcard domain: *.advertradical.com
```

**Vercel Domain Setup:**
1. Add `advertradical.com` to your Vercel project
2. Add wildcard: `*.advertradical.com`
3. Update DNS at your domain registrar with Vercel's nameservers

---

## Subscription Plans

| Plan    | Price (6 mo) | AR Items | Storage |
|---------|-------------|----------|---------|
| Basic   | ₹999        | 10       | 500MB   |
| Pro     | ₹2,499      | 40       | 2GB     |
| Premium | ₹4,999      | 100      | 5GB     |

---

## Phase 2 Roadmap

- [ ] QR code generator in restaurant dashboard
- [ ] Razorpay webhook (auto-renew subscriptions)
- [ ] Platform-wide analytics for Super Admin
- [ ] Email notifications (request approved/rejected)
- [ ] Restaurant custom logo upload
- [ ] Item categories management

---

## License

Private — Advert Radical © 2024
