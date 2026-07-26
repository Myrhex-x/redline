// Email alerts, step 2 of 2: the confirmation link from the opt-in email.
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  if (!process.env.DATABASE_URL) return page(res, 503, "Not configured.", "Email alerts aren't configured yet.");

  const token = String(req.query?.t ?? "");
  if (!/^[a-f0-9]{48}$/.test(token))
    return page(res, 400, "That link doesn't work.", "The confirmation link is incomplete — copy the full URL from the email.");

  const sql = neon(process.env.DATABASE_URL);
  let rows = [];
  try {
    rows = await sql`UPDATE email_subs SET confirmed = true WHERE token = ${token} RETURNING email`;
  } catch (e) {
    if (!/does not exist/.test(e.message)) throw e;
  }
  if (!rows.length)
    return page(res, 404, "Link not found.",
      "This confirmation link matches no pending subscription — it may have been replaced by a newer email, or already unsubscribed.");

  return page(res, 200, "You're in.",
    "From now on you'll get one email when a tracked company changes a policy, an encryption claim, or an app-store declaration — with a link to the exact before and after. Most days: silence. That's the point. Every alert carries a one-click unsubscribe that deletes your address immediately.");
}

function page(res, code, h1, body) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.status(code).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${h1} — ScanRecords</title>
<link rel="stylesheet" href="/style.css"></head><body>
<main><div class="wrap"><h1>${h1}</h1>
<p class="lede">${body}</p>
<p class="note"><a href="/">← scanrecords.org</a></p></div></main>
</body></html>`);
}
