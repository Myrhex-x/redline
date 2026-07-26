// Email alerts, step 1 of 2: store the address unconfirmed and send one
// confirmation link (double opt-in — nobody can subscribe an address they
// don't control). We store the address, a random token, and a timestamp.
// No IP, no name, nothing else — and unsubscribing deletes the row.
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

const SITE = "https://scanrecords.org";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY)
    return page(res, 503, "Email alerts aren't configured yet.", "Try the push alerts or RSS instead.");

  // Accept both the no-JS HTML form and JSON.
  const raw = req.body ?? {};
  const email = String(raw.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return page(res, 400, "That doesn't look like an email address.", `<a href="/alerts/">Back to alerts</a>.`);

  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS email_subs (
    email text PRIMARY KEY, token text NOT NULL,
    confirmed boolean NOT NULL DEFAULT false,
    created timestamptz NOT NULL DEFAULT now())`;

  const existing = await sql`SELECT confirmed, created, token FROM email_subs WHERE email = ${email}`;
  if (existing.length && existing[0].confirmed)
    return page(res, 200, "Already subscribed.", "This address already receives alerts. Every alert email has a one-click unsubscribe.");
  // Throttle: one confirmation mail per address per 24 h — this endpoint must
  // not be usable to bombard someone else's inbox.
  if (existing.length && Date.now() - new Date(existing[0].created).getTime() < 86_400_000)
    return page(res, 200, "Check your inbox.", "A confirmation link was already sent to this address recently. It's valid — look in spam too.");

  const token = randomBytes(24).toString("hex");
  await sql`INSERT INTO email_subs (email, token, confirmed, created) VALUES (${email}, ${token}, false, now())
    ON CONFLICT (email) DO UPDATE SET token = ${token}, created = now()`;

  const confirmUrl = `${SITE}/api/confirm-email?t=${token}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "ScanRecords <alerts@scanrecords.org>",
      to: [email],
      subject: "Confirm your ScanRecords alerts",
      text:
        `Someone — hopefully you — asked to receive ScanRecords email alerts at this address.\n\n` +
        `ScanRecords (${SITE}) records daily what messaging platforms' own documents say about\n` +
        `scanning under the EU's Chat Control, and alerts you only when something actually changes.\n\n` +
        `Confirm here:\n${confirmUrl}\n\n` +
        `If this wasn't you, do nothing — the address will not receive alerts and this record\n` +
        `is deleted from our side after it expires.\n`,
    }),
  });
  if (!r.ok) return page(res, 502, "Couldn't send the confirmation email.", "Please try again in a minute.");

  return page(res, 200, "Check your inbox.",
    "One confirmation link is on its way. Click it and you're in — after that, you'll only ever hear from us when a tracked document actually changes.");
}

// The form posts without JavaScript, so the response is a tiny real page.
// No inline styles — the site's CSP forbids them; the stylesheet's own
// classes carry the layout.
function page(res, code, h1, body) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.status(code).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${h1} — ScanRecords</title>
<link rel="stylesheet" href="/style.css"></head><body>
<main><div class="wrap"><h1>${h1}</h1>
<p class="lede">${body}</p>
<p class="note"><a href="/alerts/">← Back to alerts</a> · <a href="/">scanrecords.org</a></p></div></main>
</body></html>`);
}
