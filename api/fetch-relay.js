// EU fetch relay. The daily snapshot runs on GitHub's US runners, but an
// archive about EU scanning must read the web as the EU sees it — Google and
// Meta literally serve different policy text per region. This function is
// pinned to Vercel's Paris region (vercel.json "regions"), and the snapshot
// tool routes document fetches through it.
//
// Token-gated: only our own robot may use it — an open relay is an attack
// tool. Upstream status rides in x-upstream-status so relay-level auth
// errors (401) can never be mistaken for a target site's response.
//
// Redirects are followed by hand, one hop at a time, re-resolving and
// re-validating every destination. Letting fetch() follow them checks only
// the hostname the caller supplied: a target that answers 302 to
// http://169.254.169.254/ or any internal address would be fetched from
// inside the platform, with the body handed straight back.
import { lookup } from "node:dns/promises";
import { timingSafeEqual } from "node:crypto";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_HOPS = 5;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function privateIp(a) {
  if (a.includes(":")) {
    const x = a.toLowerCase();
    return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") ||
      x.startsWith("fe80") || x.startsWith("::ffff:");
  }
  const [o1, o2] = a.split(".").map(Number);
  return (
    o1 === 0 || o1 === 10 || o1 === 127 || (o1 === 169 && o2 === 254) ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168) ||
    (o1 === 100 && o2 >= 64 && o2 <= 127) || // CGNAT
    (o1 === 198 && (o2 === 18 || o2 === 19)) || // benchmarking
    o1 >= 224
  );
}

/** Equal-length, constant-time token comparison. */
function tokenMatches(given, expected) {
  const a = Buffer.from(String(given ?? ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function assertPublicHost(hostname) {
  const addrs = await lookup(hostname, { all: true });
  if (addrs.length === 0) throw new Error("no address");
  // Every address, not just the first: a name that resolves to one public and
  // one private address must not be reachable through us.
  if (addrs.some((x) => privateIp(x.address))) throw new Error("blocked host");
}

/** Read at most MAX_BYTES, so a hostile or broken target cannot exhaust memory. */
async function readCapped(res) {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map(Buffer.from)).subarray(0, MAX_BYTES).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const token = process.env.RELAY_TOKEN;
  if (!token) return res.status(503).send("relay not configured");
  if (!tokenMatches(req.headers["x-relay-token"], token)) return res.status(401).send("no");

  let target;
  try {
    target = new URL(String(req.query?.url ?? ""));
  } catch {
    return res.status(400).send("bad url");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:")
    return res.status(400).send("bad scheme");
  if (/(^|\.)scanrecords\.org$/i.test(target.hostname)) return res.status(400).send("no loops");

  const ua = String(
    req.headers["x-relay-ua"] ??
    "ScanRecordsBot/0.1 (+https://scanrecords.org; public policy archive)"
  );

  try {
    let url = target;
    for (let hop = 0; ; hop++) {
      try {
        await assertPublicHost(url.hostname);
      } catch (e) {
        // Deliberately terse: do not echo internal resolution detail back out.
        return res.status(400).send(e.message === "blocked host" ? "blocked host" : "dns failed");
      }

      const upstream = await fetch(url.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(25_000),
        headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml", "accept-language": "en" },
      });

      if (REDIRECT_CODES.has(upstream.status)) {
        const loc = upstream.headers.get("location");
        if (!loc) break; // a redirect with nowhere to go: treat as the response
        if (hop >= MAX_HOPS) return res.status(502).send("too many redirects");
        let next;
        try {
          next = new URL(loc, url);
        } catch {
          return res.status(502).send("bad redirect target");
        }
        if (next.protocol !== "https:" && next.protocol !== "http:")
          return res.status(400).send("bad redirect scheme");
        if (/(^|\.)scanrecords\.org$/i.test(next.hostname))
          return res.status(400).send("no loops");
        url = next;
        continue;
      }

      const body = await readCapped(upstream);
      res.setHeader("x-upstream-status", String(upstream.status));
      res.setHeader("x-final-url", url.href);
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      return res.status(200).send(body);
    }
    return res.status(502).send("redirect without location");
  } catch (e) {
    res.setHeader("x-upstream-status", "0");
    return res
      .status(502)
      .send(`relay fetch failed: ${e.name === "TimeoutError" ? "timeout" : e.message}`.slice(0, 200));
  }
}
