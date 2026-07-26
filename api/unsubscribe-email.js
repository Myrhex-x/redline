// One-click unsubscribe: the link in every alert email. Deletes the row —
// there is nothing to "deactivate", the address is simply gone.
// Accepts GET (human clicking) and POST (RFC 8058 List-Unsubscribe=One-Click,
// which mail clients fire without showing a page).
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
  if (!process.env.DATABASE_URL) return page(res, 503, "Not configured.", "Nothing to do.");

  const token = String(req.query?.t ?? "");
  if (!/^[a-f0-9]{48}$/.test(token))
    return page(res, 400, "That link doesn't work.", "The unsubscribe link is incomplete — copy the full URL from the email.");

  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`DELETE FROM email_subs WHERE token = ${token}`;
  } catch (e) {
    if (!/does not exist/.test(e.message)) throw e;
  }
  if (req.method === "POST") return res.status(204).end();

  return page(res, 200, "Unsubscribed — and deleted.",
    "Your address is gone from our side, not archived, not flagged, not remembered. If you change your mind, the alerts page is always there.");
}

function page(res, code, h1, body) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.status(code).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${h1} — ScanRecords</title>
<link rel="stylesheet" href="/style.css"></head><body>
<main><div class="wrap"><h1>${h1}</h1>
<p class="lede">${body}</p>
<p class="note"><a href="/alerts/">← Alerts</a> · <a href="/">scanrecords.org</a></p></div></main>
</body></html>`);
}
