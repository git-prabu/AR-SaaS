// lib/utils.js — Shared utility functions

export function timeAgo(seconds) {
  if (!seconds) return 'just now';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const ADMIN_STYLES = {
  card: { background: '#FFFFFF', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 20, boxShadow: '0 2px 14px rgba(42,31,16,0.05)' },
  h1: { fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18', margin: 0 },
  sub: { fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 },
};
