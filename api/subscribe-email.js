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
  const F = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const M = "ui-monospace,'SF Mono',Menlo,monospace";
  // Same dark-card shell as the digest (tools/mail.mjs) — duplicated on
  // purpose: importing that module here would execute its sender.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef0f2;">
<div style="display:none;max-height:0;overflow:hidden;">One click and you're in — alerts only when a tracked document actually changes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f2;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0a0c0f;border-radius:18px;border:1px solid #1d2128;">
<tr><td style="padding:26px 32px 0;">
  <img src="${SITE}/icons/icon-192.png" width="34" height="34" alt="" style="vertical-align:middle;border-radius:8px;">
  <span style="font-family:${F};font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;padding-left:10px;vertical-align:middle;">Scan<span style="color:#8b949e;font-weight:500;">Records</span></span>
</td></tr>
<tr><td style="padding:18px 32px 28px;">
  <div style="font-family:${F};font-size:22px;line-height:1.3;font-weight:700;color:#ffffff;">Confirm your alerts</div>
  <div style="font-family:${F};font-size:14px;line-height:1.65;color:#a6adb5;padding:10px 0 18px;">
    Someone — hopefully you — asked to receive ScanRecords email alerts at this address.
    ScanRecords records daily what messaging platforms' own documents say about scanning under
    the EU's Chat&nbsp;Control, and emails you <span style="color:#f4f4f4;">only when something actually changes</span>.
    Most days: silence.</div>
  <a href="${confirmUrl}" style="font-family:${F};font-size:15px;font-weight:700;color:#0a0c0f;background:#f4f4f4;text-decoration:none;border-radius:10px;padding:12px 22px;display:inline-block;">Confirm email alerts</a>
  <div style="font-family:${M};font-size:11px;line-height:1.6;color:#8b949e;padding-top:16px;word-break:break-all;">Or paste this link: ${confirmUrl}</div>
  <div style="font-family:${F};font-size:12px;line-height:1.7;color:#8b949e;padding-top:16px;">
    If this wasn't you, do nothing — the address will never receive alerts, and this request is deleted from our side.</div>
</td></tr>
<tr><td style="padding:0 32px 26px;">
  <div style="border-top:1px solid #1d2128;padding-top:16px;font-family:${F};font-size:12px;line-height:1.7;color:#8b949e;">
    ScanRecords — the Chat Control policy archive, recorded daily at
    <a href="${SITE}" style="color:#8b949e;">scanrecords.org</a>. No cookies, no tracking, nothing sold.
  </div>
</td></tr>
</table></td></tr></table></body></html>`;
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
      html,
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
