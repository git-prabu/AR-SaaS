// pages/staff/v2.js
//
// Parallel new staff app — Aspire-deep theme order management.
// Lives alongside the existing /staff/waiter & /staff/kitchen until
// the new flow is feature-complete and the owner switches over.
//
// All UI scoped under .sv2 so the dark theme + Aspire tokens can't
// bleed onto any legacy page.
//
// Phase A ships: tokens, primitives, route skeleton.
// Phases B-E (next commits) wire up: order-taking flow, floor map,
// kitchen rail, polish.

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { readStaffSession } from '../../lib/staffSession';
import { I } from '../../components/staff-v2/ui/icons';

export default function StaffV2() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);

  // Same auth pattern as the existing staff pages — readStaffSession
  // is sync (localStorage), so the check completes on first paint.
  useEffect(() => {
    setSession(readStaffSession());
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !session) router.replace('/staff/login');
  }, [checked, session, router]);

  if (!checked) return null;
  if (!session) return null;

  return (
    <>
      <Head>
        <title>Waiter · Order & Kitchen — HaloHelm</title>
      </Head>
      <div className="sv2">
        <div className="frame">
          <div className="screenwrap">
            <div className="screen">
              {/* Phase A placeholder — proves tokens load + route works.
                  Phases B/C/D replace this with the real screens. */}
              <div className="apphead">
                <div className="apphead-row">
                  <div className="whoami" style={{ flex: 1 }}>
                    <div className="avatar">{(session.name || 'S')[0].toUpperCase()}</div>
                    <div>
                      <div className="eyebrow">{greeting()} · Welcome</div>
                      <h1 className="h-screen">Staff v2</h1>
                    </div>
                  </div>
                  <button className="iconbtn"><span style={{ position: 'relative' }}>{I.bell}</span></button>
                </div>
              </div>
              <div style={{ padding: '20px', color: 'var(--tx-2)', fontSize: 13, lineHeight: 1.6 }}>
                <p>Phase A is live — design tokens, fonts, primitives, route skeleton.</p>
                <p style={{ marginTop: 10, color: 'var(--tx-3)' }}>
                  Phases B–E ship the floor map, order flow, item sheet, review, confirm screen, and kitchen rail.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// Bypass any default admin/staff layout — this is a self-contained app.
StaffV2.getLayout = (page) => page;
