// pages/_app.js
import '../styles/globals.css';
import { AuthProvider } from '../hooks/useAuth';
import { Toaster } from 'react-hot-toast';

export default function App({ Component, pageProps }) {
  const getLayout = Component.getLayout || ((page) => page);

  return (
    <AuthProvider>
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
          error:   { iconTheme: { primary: '#EF4444', secondary: '#09090B' } },
        }}
      />
    </AuthProvider>
  );
}
