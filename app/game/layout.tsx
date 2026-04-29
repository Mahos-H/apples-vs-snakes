import Script from "next/script";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Ably Realtime SDK from CDN */}
        <Script
          src="https://cdn.ably.com/lib/ably.min-2.js"
          strategy="beforeInteractive"
        />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; touch-action: manipulation; }
        button, a, input { touch-action: manipulation; cursor: pointer; }
      `}</style>
      <body style={{ margin: 0, background: "#080c10", color: "#e6edf3" }}>
        {children}
      </body>
    </html>
  );
}