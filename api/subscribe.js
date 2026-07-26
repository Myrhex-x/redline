// Stores a push subscription: the endpoint URL and its two crypto keys —
// the minimum Web Push needs, and the only user data this site ever holds.
// Deleted on unsubscribe, and automatically when a push bounces (404/410).
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "alerts not configured" });

  const { endpoint, keys } = req.body ?? {};
  if (
    typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1024 ||
    typeof keys?.p256dh !== "string" || keys.p256dh.length > 256 ||
    typeof keys?.auth !== "string" || keys.auth.length > 128
  ) return res.status(400).json({ error: "bad subscription" });

  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS push_subs (
    endpoint text PRIMARY KEY, p256dh text NOT NULL, auth text NOT NULL,
    created timestamptz NOT NULL DEFAULT now())`;
  await sql`INSERT INTO push_subs (endpoint, p256dh, auth) VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = ${keys.p256dh}, auth = ${keys.auth}`;
  return res.status(204).end();
}
