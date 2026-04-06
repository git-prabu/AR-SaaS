// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* model-viewer loaded inside AR iframe only */}
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Inter:wght@300;400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Favicon placeholder */}
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#09090B" />
      </Head>
      <body className="bg-bg-base antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
