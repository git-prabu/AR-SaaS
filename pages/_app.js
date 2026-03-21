// pages/_app.js
import '../styles/globals.css';
import { AdminAuthProvider, SuperAdminAuthProvider } from '../hooks/useAuth';
import { Toaster } from 'react-hot-toast';

export default function App({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => page);

  return (
    // Both providers are completely independent — different Firebase
    // app instances, different localStorage keys, no shared state.
    <AdminAuthProvider>
      <SuperAdminAuthProvider>
        {getLayout(<Component {...pageProps} />)}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#18181D',
              color: '#F2F2EE',
              border: '1px solid #27272E',
              fontFamily: "'DM Sans', sans-serif",
            },
            success: { iconTheme: { primary: '#FF6B35', secondary: '#09090B' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#09090B' } },
          }}
        />
      </SuperAdminAuthProvider>
    </AdminAuthProvider>
  );
}