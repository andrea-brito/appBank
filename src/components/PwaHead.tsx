import Head from 'expo-router/head';

// PWA / iOS "Add to Home Screen" tags. Renders nothing on native.
export function PwaHead() {
  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
      />
      <meta name="theme-color" content="#6366f1" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="appBank" />
      <meta name="robots" content="noindex,nofollow" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    </Head>
  );
}
