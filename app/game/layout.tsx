import Script from "next/script";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
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
      <body style={{ margin: 0, background: "#080c10", color: "#e6edf3" }}>
        {children}
      </body>
    </html>
  );
}