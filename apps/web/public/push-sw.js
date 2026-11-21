/* Evening check-in reminder (imported into the app's service worker).
   The push carries no data: it only means "it's check-in time". */
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("How did today go?", {
      body: "Tap to check in – two taps if everything went well.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "studymaster-checkin",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
