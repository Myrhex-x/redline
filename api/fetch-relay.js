// EU fetch relay. The daily snapshot runs on GitHub's US runners, but an
// archive about EU scanning must read the web as the EU sees it — Google and
// Meta literally serve different policy text per region. This function is
// pinned to Vercel's Paris region (vercel.json "regions"), and the snapshot
// tool routes document fetches through it.
//
// Token-gated: only our own robot may use it — an open relay is an attack
// tool. Upstream status rides in x-upstream-status so relay-level auth
// errors (401) can never be mistaken for a target site's response.
import { lookup } from "node:dns/promises";

const MAX_BYTES = 4 * 1024 * 1024;

function privateIp(a) {
  if (a.includes(":")) {
    const x = a.toLowerCase();
    return x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
  }
  const [o1, o2] = a.split(".").map(Number);
  return (
    o1 === 0 || o1 === 10 || o1 === 127 || (o1 === 169 && o2 === 254) ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168) || o1 >= 224
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const token = process.env.RELAY_TOKEN;
  if (!token) return res.status(503).send("relay not configured");
  if (req.headers["x-relay-token"] !== token) return res.status(401).send("no");

  let target;
  try {
    target = new URL(String(req.query?.url ?? ""));
  } catch {
    return res.status(400).send("bad url");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:")
    return res.status(400).send("bad scheme");
  if (/scanrecords\.org$/i.test(target.hostname)) return res.status(400).send("no loops");

  try {
    const addrs = await lookup(target.hostname, { all: true });
    if (addrs.length === 0 || addrs.some((x) => privateIp(x.address)))
      return res.status(400).send("blocked host");
  } catch {
    return res.status(502).send("dns failed");
  }

  try {
    const upstream = await fetch(target.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: {
        "user-agent": String(req.headers["x-relay-ua"] ?? "ScanRecordsBot/0.1 (+https://scanrecords.org; public policy archive)"),
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
      },
    });
    const body = await upstream.text();
    res.setHeader("x-upstream-status", String(upstream.status));
    res.setHeader("x-final-url", upstream.url);
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    return res.status(200).send(body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body);
  } catch (e) {
    res.setHeader("x-upstream-status", "0");
    return res.status(502).send(`relay fetch failed: ${e.name === "TimeoutError" ? "timeout" : e.message}`.slice(0, 200));
  }
}
