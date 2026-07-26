/* ScanRecords service worker — exists for one purpose: delivering the
 * alerts a user explicitly subscribed to on /alerts/. No caching, no
 * fetch interception, no background anything else. */

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data.json(); } catch { /* ignore malformed */ }
  const title = data.title || "ScanRecords";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "A tracked document changed.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "scanrecords",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
