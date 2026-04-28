// Phase D — Synthesized event sounds + voice announcements
// =========================================================
//
// Replaces the old `new Audio('/notification.mp3')` approach (one
// generic ding for every event) with distinct, identifiable sounds
// per event type, generated on-the-fly via the Web Audio API. No
// external files, no preload, no cache busting.
//
// Why synthesized:
//   - One sound for "new order" vs "new payment" vs "new call" lets
//     staff identify the event without looking at the screen
//   - Tiny payload (no MP3 to download)
//   - Reproducible — same sound on every device, every browser
//
// Sound design (kept short — each under 0.7s — so they don't clash
// in a busy shift):
//   playOrderSound()    Kitchen new ticket. Two ascending notes.
//   playCallSound()     Waiter call (water/bill/etc). Triple beep.
//   playReadySound()    Order moved to ready. High→low chime.
//   playPaymentSound()  Customer requested payment. Cash-register-ish arpeggio.
//
// Voice (optional, opt-in via localStorage):
//   speak(text)         Speaks text using SpeechSynthesisUtterance.
//                       Cancels in-flight speech first so events
//                       don't queue up on a busy shift.
//   announceX(...)      Convenience: plays the matching sound
//                       AND speaks a human description.
//
// Page contract:
//   Each consuming page (kitchen / waiter / payments) keeps its
//   own enable flag in localStorage and only invokes these helpers
//   when its flag is true. The lib does NOT consult localStorage
//   for sound — it only does so for voice (because voice has a
//   single global toggle, since it's more disruptive and rarely
//   wanted on multiple devices simultaneously).
//
// Browser autoplay caveat:
//   AudioContext can only be created/resumed inside a user gesture
//   on Chrome/Safari. We lazily create it and call resume() on the
//   first play attempt. If the page hasn't been interacted with yet,
//   the first sound silently no-ops; subsequent ones (after any
//   click/tap) work. unlockSound() can be called from a user-input
//   handler (e.g. the sound toggle button) to prime it explicitly.

let audioCtx = null;

function getAudioCtx() {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

// Call from inside a user-gesture handler (button click, etc.) to
// guarantee the context is ready for subsequent automatic plays.
// Safe to call repeatedly.
export function unlockSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// Schedule a single tone. All times are relative to ctx.currentTime.
//   freq:  Hz
//   dur:   seconds (note length, including release)
//   vol:   0..1  (peak gain)
//   type:  'sine' | 'triangle' | 'square' | 'sawtooth'
//   delay: seconds offset from now
function tone(freq, dur, vol, type, delay) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  // Don't try to play if the context is suspended — the sound would
  // be inaudible OR queued silently. Resume request is fire-and-forget.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  // Quick attack, exponential decay — gives us a clean, percussive note.
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// ── Kitchen new order ──
// Two ascending notes (E5 → A5) — feels like a friendly door chime.
export function playOrderSound() {
  tone(659.25, 0.18, 0.18, 'sine', 0);
  tone(880.00, 0.32, 0.18, 'sine', 0.16);
}

// ── Waiter new call ──
// Three short mid-pitch beeps (E5) — the urgency is in the repetition,
// not the volume. Triangle wave reads as more "request"-like than sine.
export function playCallSound() {
  tone(659.25, 0.10, 0.18, 'triangle', 0);
  tone(659.25, 0.10, 0.18, 'triangle', 0.16);
  tone(659.25, 0.10, 0.18, 'triangle', 0.32);
}

// ── Order ready (waiter) ──
// High note (A5) settling into a lower note (E5). Two-note "ding-dong"
// with a gentler release than the new-order chime to differentiate.
export function playReadySound() {
  tone(880.00, 0.20, 0.16, 'sine', 0);
  tone(659.25, 0.34, 0.16, 'sine', 0.18);
}

// ── Payment requested (waiter / payments) ──
// C5 → E5 → G5 → C6 ascending arpeggio. Mimics a cash-register
// "settled" feel. Slightly louder volume because the staff often
// has to walk to the table after hearing this.
export function playPaymentSound() {
  tone(523.25, 0.10, 0.18, 'sine', 0);
  tone(659.25, 0.10, 0.18, 'sine', 0.10);
  tone(783.99, 0.18, 0.20, 'sine', 0.20);
  tone(1046.5, 0.30, 0.22, 'sine', 0.34);
}

// ── Voice announcements ──
//
// Web Speech API — works on all modern browsers; the available voices
// vary by OS. We prefer en-IN if present (Indian English), then any
// English voice, then the default. The page can opt in via a
// localStorage flag (off by default — voice is more disruptive than
// a chime and many environments don't want it).
//
// VOICE_KEY is consulted here so individual pages can toggle without
// each maintaining their own check. Pages still control SOUND themselves
// because per-page sound preferences are common (kitchen mute vs waiter on).

const VOICE_KEY = 'ar_voice_enabled';

export function isVoiceEnabled() {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(VOICE_KEY) === 'true'; } catch { return false; }
}

export function setVoiceEnabled(v) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(VOICE_KEY, String(!!v)); } catch {}
}

let _voicesCache = null;
function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  if (_voicesCache && _voicesCache.length) return _voicesCache;
  _voicesCache = window.speechSynthesis.getVoices() || [];
  // Some browsers populate voices asynchronously — listen once for the
  // voiceschanged event so subsequent calls pick them up.
  if (!_voicesCache.length && !window._arVoiceListenerAttached) {
    window._arVoiceListenerAttached = true;
    window.speechSynthesis.addEventListener('voiceschanged', () => { _voicesCache = null; }, { once: true });
  }
  return _voicesCache;
}

// Speak text. No-op if voice is disabled or speech synthesis is not
// supported. Cancels in-flight speech to avoid pile-up on busy shifts.
export function speak(text) {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;
  if (!isVoiceEnabled()) return;
  if (!text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    const voices = loadVoices();
    const inIndian = voices.find(v => /^en[-_]IN$/i.test(v.lang));
    const inEnglish = voices.find(v => /^en[-_]/i.test(v.lang));
    if (inIndian) u.voice = inIndian;
    else if (inEnglish) u.voice = inEnglish;
    u.lang = (u.voice && u.voice.lang) || 'en-IN';
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  } catch {}
}

// ── Convenience announcers — sound + voice combined ──
// Pages call these when an event is "newly arrived". The voice part
// no-ops if voice is disabled, so calling them unconditionally is fine.

export function announceOrder(table, itemCount) {
  playOrderSound();
  const n = Number(itemCount) || 0;
  speak(`New order, table ${table}, ${n} item${n === 1 ? '' : 's'}`);
}

export function announceCall(table, reasonLabel) {
  playCallSound();
  speak(`Table ${table}, ${reasonLabel || 'assistance'}`);
}

export function announceReady(table) {
  playReadySound();
  speak(`Order ready, table ${table}`);
}

// methodLabel: 'Cash' | 'Card' | 'UPI'
export function announcePayment(table, methodLabel) {
  playPaymentSound();
  const safe = methodLabel || 'payment';
  speak(`Table ${table}, ${safe} payment requested`);
}
