// components/layout/AuthLoading.jsx
//
// Neutral full-screen loading state shown while we figure out WHO the
// viewer is (owner vs permission-scoped staff). Critically it renders NO
// chrome — not AdminLayout, not StaffShell — so the owner never sees a
// flash of the staff portal before their profile finishes loading.
export default function AuthLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#EDEDED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #C4A86D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'ah-spin 0.8s linear infinite' }} />
      <style>{`@keyframes ah-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
