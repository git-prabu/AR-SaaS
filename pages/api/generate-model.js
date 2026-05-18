// pages/api/generate-model.js
// Calls Meshy AI Image-to-3D API to generate a .glb from a dish photo.
//
// Phase 3 hardening (H6, 16 May 2026): added superadmin auth gate.
// Previously unauthenticated — anyone hitting this URL with a POST could
// drain the MESHY_API_KEY quota (which bills us at ~$0.10 per generation).
// Now requires a Firebase ID token for a user with role: 'superadmin' in
// the users/{uid} doc. Mirrors the auth pattern in
// /api/email/trigger-daily-summary.

import { adminAuth, adminDb } from '../../lib/firebaseAdmin';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

async function verifySuperAdmin(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
    if (!userSnap.exists) return null;
    if (userSnap.data()?.role !== 'superadmin') return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Gate: superadmin only ─────────────────────────────────────────
  // AR generation is paid (Meshy ~$0.10/req) + an internal review tool —
  // only the superadmin approving menu requests calls this. No customer
  // / restaurant-admin flow needs it. Without this gate, a random
  // attacker spamming the endpoint would drain the Meshy quota.
  const caller = await verifySuperAdmin(req);
  if (!caller) {
    return res.status(401).json({ error: 'Unauthorized — superadmin required' });
  }

  const MESHY_KEY = process.env.MESHY_API_KEY;
  if (!MESHY_KEY) {
    return res.status(503).json({
      error: 'AR generation is not configured yet. Please add MESHY_API_KEY to your environment variables.',
      code: 'NO_API_KEY'
    });
  }

  const { imageBase64, imageUrl, itemName } = req.body;
  if (!imageBase64 && !imageUrl) {
    return res.status(400).json({ error: 'imageBase64 or imageUrl is required' });
  }

  try {
    // ── Step 1: Create image-to-3D task ────────────────────────────────
    const createBody = {
      mode:           'preview',   // preview = fast (< 2 min), refine = high quality (5–10 min)
      prompt:         `3D model of ${itemName || 'food dish'}, clean background, restaurant quality`,
      art_style:      'realistic',
      should_remesh:  true,
    };

    if (imageBase64) {
      createBody.image_url = `data:image/jpeg;base64,${imageBase64}`;
    } else {
      createBody.image_url = imageUrl;
    }

    const createRes = await fetch('https://api.meshy.ai/v1/image-to-3d', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${MESHY_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return res.status(createRes.status).json({ error: `Meshy API error: ${errText}` });
    }

    const { result: taskId } = await createRes.json();
    if (!taskId) return res.status(500).json({ error: 'No task ID returned from Meshy' });

    // ── Step 2: Poll until complete (max 3 min) ────────────────────────
    const maxAttempts = 36; // 36 × 5s = 3 min
    let modelUrl = null;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000)); // wait 5s between polls

      const pollRes = await fetch(`https://api.meshy.ai/v1/image-to-3d/${taskId}`, {
        headers: { 'Authorization': `Bearer ${MESHY_KEY}` },
      });

      if (!pollRes.ok) continue;

      const task = await pollRes.json();

      if (task.status === 'SUCCEEDED') {
        // Meshy returns model_urls: { glb, fbx, obj, usdz }
        modelUrl = task.model_urls?.glb;
        break;
      }

      if (task.status === 'FAILED') {
        return res.status(500).json({ error: `Meshy generation failed: ${task.task_error?.message || 'Unknown error'}` });
      }

      // Still in progress (PENDING or IN_PROGRESS) — keep polling
    }

    if (!modelUrl) {
      return res.status(504).json({ error: 'Generation timed out. Please try again or upload a .glb manually.' });
    }

    return res.status(200).json({ modelUrl, taskId });

  } catch (err) {
    console.error('generate-model error:', err);
    return res.status(500).json({ error: err.message });
  }
}
