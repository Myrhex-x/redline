#!/usr/bin/env node
/**
 * Regression tests for the EU fetch relay (api/fetch-relay.js).
 *
 * The relay takes a URL from a caller and fetches it from inside Vercel's
 * network. That is a server-side request forgery primitive by construction,
 * so its guards are the only thing standing between a leaked token and a
 * read of the cloud metadata endpoint. Guards that are never exercised are
 * guards you find out about afterwards.
 *
 * The SSRF cases stub global fetch, so the dangerous hops are asserted to be
 * blocked without any network involved and — the part that matters — the
 * internal address is asserted never to have been fetched at all.
 *
 * Run: node tools/test-relay.mjs      (exit 0 = all pass)
 */

process.env.RELAY_TOKEN = process.env.RELAY_TOKEN ?? "test-token";
const TOKEN = process.env.RELAY_TOKEN;
const handler = (await import("../api/fetch-relay.js")).default;

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};

function mockRes() {
  const r = { code: 0, body: "", headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = String(b); return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; return r; };
  return r;
}
const call = async (url, headers = { "x-relay-token": TOKEN }, method = "GET") => {
  const res = mockRes();
  await handler({ method, headers, query: { url } }, res);
  return res;
};

const realFetch = globalThis.fetch;
let fetched = [];
/** Replay a scripted hop sequence so redirect handling is deterministic. */
function stubFetch(plan) {
  fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    const step = plan[fetched.length - 1];
    if (!step) throw new Error(`unexpected extra fetch: ${url}`);
    if (step.redirect)
      return { status: 302, headers: new Map([["location", step.redirect]]), body: null, text: async () => "" };
    return { status: step.status ?? 200, headers: new Map(), body: null, text: async () => step.body ?? "ok" };
  };
}

console.log("auth");
check("no token header → 401", (await call("https://example.com", {})).code === 401);
check("wrong token → 401", (await call("https://example.com", { "x-relay-token": "nope" })).code === 401);
check("short token does not throw → 401", (await call("https://example.com", { "x-relay-token": "x" })).code === 401);
check("non-GET → 405", (await call("https://example.com", { "x-relay-token": TOKEN }, "POST")).code === 405);

console.log("input validation");
check("unparseable url → 400", (await call("not-a-url")).code === 400);
check("file:// → 400", (await call("file:///etc/passwd")).code === 400);
check("own domain → 400 (no loops)", (await call("https://scanrecords.org/x")).code === 400);
check("own subdomain → 400", (await call("https://mirror.scanrecords.org/x")).code === 400);

console.log("SSRF — direct internal targets");
for (const u of [
  "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.1/", "http://192.168.1.1/", "http://172.16.0.1/", "http://[::1]/",
]) {
  check(`${u} blocked`, (await call(u)).code === 400);
}

console.log("SSRF — redirect chain (the hole this test exists for)");
for (const [label, evil] of [
  ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
  ["loopback", "http://127.0.0.1:8080/admin"],
  ["private LAN", "http://10.0.0.5/"],
  ["own domain", "https://scanrecords.org/api/fetch-relay?url=x"],
]) {
  stubFetch([{ redirect: evil }, { body: "SECRET" }]);
  const r = await call("https://example.com/start");
  check(`public hop → ${label}: blocked`, r.code === 400 && !r.body.includes("SECRET"), `code ${r.code}`);
  check(`public hop → ${label}: never fetched`, fetched.length === 1, `fetched ${fetched.join(" → ")}`);
}

console.log("legitimate redirects still work");
stubFetch([{ redirect: "https://www.iana.org/b" }, { redirect: "https://www.iana.org/c" }, { body: "DOC" }]);
{
  const r = await call("https://example.com/a");
  check("two public hops → final body", r.code === 200 && r.body === "DOC", `code ${r.code} "${r.body}"`);
  check("x-final-url is the last hop", r.headers["x-final-url"] === "https://www.iana.org/c", r.headers["x-final-url"]);
}
stubFetch(Array.from({ length: 9 }, (_, i) => ({ redirect: `https://www.iana.org/${i + 1}` })));
check("over the hop budget → 502", (await call("https://example.com/a")).code === 502);

console.log("upstream status is never confused with relay status");
stubFetch([{ status: 404, body: "gone" }]);
{
  const r = await call("https://example.com/missing");
  check("upstream 404 → relay 200 + x-upstream-status 404",
    r.code === 200 && r.headers["x-upstream-status"] === "404",
    `${r.code}/${r.headers["x-upstream-status"]}`);
}

globalThis.fetch = realFetch;
console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
