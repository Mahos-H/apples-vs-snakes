// Place this file at: app/api/ably-token/route.ts
// Add ABLY_API_KEY (no NEXT_PUBLIC_ prefix) to your Vercel env vars

declare const Ably: any;

export async function GET() {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    return Response.json({ error: "ABLY_API_KEY not set" }, { status: 500 });
  }

  // Use the REST client server-side — key never leaves the server
  const ably = new (require("ably").Rest)(key);
  const token = await ably.auth.requestToken({ capability: { "*": ["publish", "subscribe"] } });
  return Response.json(token);
}