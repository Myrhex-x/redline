/* The only JavaScript on scanrecords.org, by design — it exists solely so
 * you can opt into push alerts. It runs nothing until you press the button,
 * stores nothing except your push endpoint (via /api/subscribe), and the
 * rest of the site works with JavaScript disabled entirely. */

const VAPID_PUBLIC_KEY =
  "BGsma5FzbDl_e5XSMezJ3pMkHRGQlTEhsAH_VAh8wmHaMP8QxCQBWNH92dH4XW1V369HCUDcLanMceyGB9-fHiY";

const $ = (id) => document.getElementById(id);
const say = (msg, ok) => {
  const el = $("alert-status");
  el.textContent = msg;
  el.className = "note " + (ok ? "st-ok" : "st-err");
};

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

async function refresh() {
  if (!supported) {
    $("subscribe").disabled = true;
    if (isIOS && !standalone) {
      say("On iPhone: add this site to your Home Screen first (Share → Add to Home Screen), then open it from there — Apple only allows web notifications for installed sites.", false);
    } else {
      say("This browser does not support web push notifications. The RSS feed carries the same alerts.", false);
    }
    return;
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  const sub = await reg.pushManager.getSubscription();
  $("subscribe").hidden = !!sub;
  $("unsubscribe").hidden = !sub;
  if (sub) say("Alerts are on for this device. When a tracked company's documents change, you'll know.", true);
  else if (isIOS && !standalone)
    say("Add this site to your Home Screen first (Share → Add to Home Screen), then open it from there and subscribe.", false);
}

async function subscribe() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { say("Notification permission was not granted.", false); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY),
    });
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (res.status === 503) { await sub.unsubscribe(); say("Alerts aren't switched on server-side yet — check back soon, or use the RSS feed meanwhile.", false); return; }
    if (!res.ok) throw new Error("subscribe failed: " + res.status);
    await refresh();
  } catch (e) {
    say("Could not subscribe: " + e.message, false);
  }
}

async function unsubscribe() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  }
  say("Alerts are off for this device, and your endpoint was deleted.", true);
  $("subscribe").hidden = false;
  $("unsubscribe").hidden = true;
}

$("subscribe").addEventListener("click", subscribe);
$("unsubscribe").addEventListener("click", unsubscribe);
refresh();
