// Push notifications (docs/MESSAGING.md, M5a). Loaded into the app's service worker
// (vite.config.js → workbox.importScripts). The payload comes from the send-push function:
// { title, body, url, tag }. Tapping a notification opens that page in AVX.

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'AVX', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/dashboard' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.url) || '/dashboard'
  const url = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(w => new URL(w.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      if ('navigate' in open) return open.navigate(url)
      return undefined
    }
    return self.clients.openWindow(url)
  })())
})
