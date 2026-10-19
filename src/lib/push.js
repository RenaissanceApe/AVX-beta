import { supabase } from './supabase'

// Push notifications on this device (docs/MESSAGING.md, M5a): the browser's subscription is
// saved with save_push_subscription; the send-push function delivers notifications to it.

export function pushSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // iPhone and iPad: only once AVX is added to the home screen
    const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
    return ios ? 'install' : 'unsupported'
  }
  return 'ok'
}

// The key the browser needs, from base64url to bytes
export function keyBytes(base64url) {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

// "Chrome on Android", shown in the list of devices
export function deviceName(ua = navigator.userAgent) {
  const browser = /edg\//i.test(ua) ? 'Edge' : /firefox\//i.test(ua) ? 'Firefox' : /chrome\//i.test(ua) ? 'Chrome' : /safari\//i.test(ua) ? 'Safari' : 'Browser'
  const system = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /mac os/i.test(ua) ? 'macOS' : /windows/i.test(ua) ? 'Windows' : /linux/i.test(ua) ? 'Linux' : ''
  return system ? `${browser} · ${system}` : browser
}

async function registration() {
  return navigator.serviceWorker.ready
}

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

// Asks for permission, subscribes this device and saves it. Returns 'on', 'denied' or throws.
export async function turnOn() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'key' } })
  if (error || !data?.publicKey) throw error || new Error('No push key')
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) })
  const json = sub.toJSON()
  const { error: saveError } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_device: deviceName(),
  })
  if (saveError) throw saveError
  return 'on'
}

export async function turnOff() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

export async function sendTest() {
  const { data, error } = await supabase.functions.invoke('send-push', { body: { action: 'test' } })
  if (error) throw error
  return data?.sent || 0
}
