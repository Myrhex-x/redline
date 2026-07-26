// Stores a push subscription: the endpoint URL and its two crypto keys —
// the minimum Web Push needs, and the only user data this site ever holds.
// Deleted on unsubscribe, and automatically when a push bounces (404/410).
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "alerts not configured" });

  const { endpoint, keys } = req.body ?? {};
  if (JSON.stringify(req.body ?? {}).length > 2048)
    return res.status(400).json({ error: "bad subscription" });

  // Real push endpoints come only from browser vendors' push services;
  // anything else is garbage or table-bloat abuse.
  const PUSH_HOSTS = [
    "fcm.googleapis.com",          // Chrome / Chromium
    ".push.apple.com",             // Safari (web.push.apple.com)
    ".push.services.mozilla.com",  // Firefox (updates.push.services.mozilla.com)
    ".notify.windows.com",         // Edge (WNS)
  ];
  let host = null;
  try { const u = new URL(endpoint); if (u.protocol === "https:") host = u.hostname; } catch {}
  const hostOk = host && PUSH_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
  const B64URL = /^[A-Za-z0-9_-]+$/;
  if (
    typeof endpoint !== "string" || !hostOk || endpoint.length > 1024 ||
    typeof keys?.p256dh !== "string" || !B64URL.test(keys.p256dh) ||
    keys.p256dh.length < 80 || keys.p256dh.length > 256 ||
    typeof keys?.auth !== "string" || !B64URL.test(keys.auth) ||
    keys.auth.length < 16 || keys.auth.length > 128
  ) return res.status(400).json({ error: "bad subscription" });

  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS push_subs (
    endpoint text PRIMARY KEY, p256dh text NOT NULL, auth text NOT NULL,
    created timestamptz NOT NULL DEFAULT now())`;
  await sql`INSERT INTO push_subs (endpoint, p256dh, auth) VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = ${keys.p256dh}, auth = ${keys.auth}`;
  return res.status(204).end();
}
