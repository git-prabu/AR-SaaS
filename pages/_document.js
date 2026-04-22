// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    // data-scroll-behavior="smooth" tells Next.js's router that the global
    // `scroll-behavior: smooth` on <html> is intentional and should NOT trigger
    // scroll-restoration side-effects on page transitions. This fixes the
    // sidebar nav scroll-position-resetting-on-link-click bug. See:
    // https://nextjs.org/docs/messages/missing-data-scroll-behavior
    <Html lang="en" data-scroll-behavior="smooth">
      <Head>
        {/* model-viewer loaded inside AR iframe only */}
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Inter:wght@300;400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Favicon + icons */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        {/* PWA — manifest + iOS home-screen support */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Advert Radical" />
        <meta name="theme-color" content="#1A1A1A" />
      </Head>
      <body className="bg-bg-base antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}