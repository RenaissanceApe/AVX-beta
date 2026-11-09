// The link behind the QR on every print (upkeep U6): the same page, live in AVX. It is the app's
// own address, so opening it needs a sign-in and the same access as the page (no public links).
// Query values that look like secrets are dropped so a printed QR never carries one.
const SECRET = /token|secret|key|code|sig/i

export function printLink(origin, pathname, search = '') {
  const base = String(origin || '').replace(/\/+$/, '')
  if (!/^https?:\/\/[^/?#\s]+$/i.test(base)) return null
  const path = '/' + String(pathname || '').replace(/^\/+/, '')
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  for (const name of [...params.keys()]) if (SECRET.test(name)) params.delete(name)
  const query = params.toString()
  return base + path + (query ? `?${query}` : '')
}
