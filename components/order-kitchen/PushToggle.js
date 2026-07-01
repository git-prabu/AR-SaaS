// components/order-kitchen/PushToggle.js
//
// "Enable notifications" button for /admin/kitchen-new + /admin/orders.
// Subscribes / unsubscribes this device to FCM web push for the current
// restaurant + staff/admin session.
//
// State machine (visible via the button label):
//   default        → user hasn't decided. Click prompts permission.
//   granted        → push is on. Tooltip shows the device label.
//   denied         → permission was denied. Tooltip explains how to re-enable.
//   unsupported    → browser/context doesn't support push. Tooltip explains.
//   ios-install    → iOS Safari, not installed as PWA. Tooltip with steps.
//
// Permission state is read from window.Notification.permission and the
// presence of an FCM token. We do NOT poll — state changes only happen
// after a user click (permission request or local toggle).

import React, { useEffect, useState, useCallback } from 'react';
import {
  enablePush, disablePush,
  isPushSupported, getPushPermission, reasonLabel,
} from '../../lib/fcm';

export default function PushToggle({
  restaurantId,
  subscriber,           // { kind, id, perms }
  variant = 'icon',     // 'icon' (40x40 circular) | 'pill' (text + icon)
  style = {},
}) {
  const [perm, setPerm] = useState('default');
  const [working, setWorking] = useState(false);
  const [hint, setHint] = useState(null);

  // Initial state on mount: only read once, then update on user actions.
  // No interval / event listener — the Notification.permission API
  // doesn't fire a change event reliably across browsers and we don't
  // want to keep waking up to poll.
  useEffect(() => {
    setPerm(getPushPermission());
  }, []);

  const cap = isPushSupported();
  const supported = cap.supported;
  const supportReason = cap.reason;

  const onClick = useCallback(async () => {
    if (working) return;
    if (!supported) {
      setHint(reasonLabel(supportReason));
      return;
    }

    setWorking(true);
    try {
      if (perm === 'granted') {
        // Turn off
        await disablePush({ restaurantId, subscriber });
        setPerm('default'); // we don't reset OS perm, but our local state is no-token now
        setHint('Notifications turned off for this device.');
      } else {
        const res = await enablePush({ restaurantId, subscriber });
        if (res.ok) {
          setPerm('granted');
          setHint('Notifications on — you\'ll hear an alert even when the app is closed.');
        } else {
          setPerm(getPushPermission());
          setHint(reasonLabel(res.reason));
        }
      }
    } finally {
      setWorking(false);
      // Auto-clear hint after 4s so it doesn't linger.
      setTimeout(() => setHint(null), 4000);
    }
  }, [working, perm, restaurantId, subscriber, supported, supportReason]);

  // Render label + icon for the current state. Distinct from the
  // in-app sound toggle (🔊/🔇) so users don't confuse "OS lock-screen
  // chime" with "in-tab Web Audio chime". 📲 conveys "push to device".
  const bellOn = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
  const bellOff = (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><line x1="2.5" y1="2.5" x2="21.5" y2="21.5" /></svg>);
  let icon, title;
  if (!supported) {
    icon = bellOff;
    title = reasonLabel(supportReason);
  } else if (perm === 'granted') {
    icon = bellOn;
    title = 'Lock-screen push on — tap to turn off';
  } else if (perm === 'denied') {
    icon = bellOff;
    title = 'Push blocked. Re-enable in browser settings.';
  } else {
    icon = bellOff;
    title = 'Tap to enable push (chime even when app is closed)';
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={onClick}
        title={title}
        aria-label={title}
        disabled={working}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 999,
          background: perm === 'granted' ? 'rgba(196,168,109,0.14)' : 'var(--card)',
          border: `1px solid ${perm === 'granted' ? '#C4A86D' : 'var(--line)'}`,
          color: perm === 'granted' ? '#D6BC85' : 'var(--tx-2)',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 12, fontWeight: 600, cursor: working ? 'wait' : 'pointer',
          opacity: working ? 0.65 : 1,
          ...style,
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        {perm === 'granted' ? 'Push on' : 'Enable push'}
      </button>
    );
  }

  // icon variant
  return (
    <>
      <button
        onClick={onClick}
        title={title}
        aria-label={title}
        disabled={working}
        style={{
          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
          background: perm === 'granted' ? 'rgba(196,168,109,0.14)' : 'var(--card)',
          border: `1px solid ${perm === 'granted' ? '#C4A86D' : 'var(--line)'}`,
          color: perm === 'granted' ? '#D6BC85' : 'var(--tx-2)',
          cursor: working ? 'wait' : 'pointer', padding: 0, fontSize: 15,
          opacity: working ? 0.65 : 1,
          ...style,
        }}
      >{icon}</button>
      {hint && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
            padding: '9px 14px', borderRadius: 10,
            background: 'rgba(0,0,0,0.85)', color: '#fff',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12.5, lineHeight: 1.4, maxWidth: '85vw', textAlign: 'center',
            zIndex: 9999, boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
          }}
        >{hint}</div>
      )}
    </>
  );
}
