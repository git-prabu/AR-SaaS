// pages/api/staff/verify.js
// Server-side staff PIN verification — replaces client-side Firestore reads
import { adminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { restaurantId, username, pin } = req.body;

  if (!restaurantId || !username || !pin) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const staffSnap = await adminDb
      .collection('restaurants')
      .doc(restaurantId)
      .collection('staff')
      .where('username', '==', username)
      .where('pin', '==', pin)
      .limit(1)
      .get();

    if (staffSnap.empty) {
      return res.status(401).json({ success: false, error: 'Invalid username or PIN' });
    }

    const staffDoc = staffSnap.docs[0];
    const data = staffDoc.data();

    return res.status(200).json({
      success: true,
      staffId: staffDoc.id,
      name: data.name || data.username,
      role: data.role || 'staff',
    });
  } catch (err) {
    console.error('Staff verify error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
