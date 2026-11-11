// Stand-ins for calls the app makes to outside services, so a test doesn't depend on them (or spend
// their quotas). Each one answers the browser's call to the Edge Function with page.route; nothing
// reaches the function, so nothing changes in the database. docs/TESTING.md, "Automated test suite".

// What the functions send back to the browser on a cross-origin call (the preview runs on :4173)
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' }

async function answer(page, fn, respond) {
  const calls = []
  await page.route(`**/functions/v1/${fn}`, async route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      const asked = request.headers()['access-control-request-headers']
      return route.fulfill({ status: 200, headers: { ...headers, ...(asked ? { 'Access-Control-Allow-Headers': asked } : {}) }, body: 'ok' })
    }
    let body = null
    try { body = request.postDataJSON() } catch { /* not JSON */ }
    calls.push(body)
    const { status = 200, json } = await respond(body)
    return route.fulfill({ status, headers, body: JSON.stringify(json) })
  })
  return calls
}

// Town search (the geocode function, which asks LocationIQ). `places` is the list it answers with,
// or a function of the search text; an empty list is "nothing found". Returns the calls made
// ([{ q, lang }, …]) so a test can check what was searched.
export const SAMPLE_PLACES = [
  { label: 'Lisboa, Portugal', place: 'Lisboa', country: 'PT', lat: 38.7223, lng: -9.1393 },
  { label: 'Porto, Portugal', place: 'Porto', country: 'PT', lat: 41.1579, lng: -8.6291 },
]
export function stubTownSearch(page, places = SAMPLE_PLACES) {
  return answer(page, 'geocode', body => ({ json: { places: typeof places === 'function' ? places(body?.q || '') : places } }))
}
// Town search not available (LocationIQ down or no key): the function's own error answer
export function stubTownSearchDown(page) {
  return answer(page, 'geocode', () => ({ status: 503, json: { error: 'Place search not available right now' } }))
}

// The company-number check (the vies-check function, which asks the EU's VIES).
// status: 'verified' (valid number), 'rejected' (not valid) or 'error' (VIES didn't answer).
// Only the answer is stood in for: the organisation is NOT marked verified in the database
// (that needs the function's service role), so a test that needs a verified company sets that up
// another way.
export function stubCompanyCheck(page, { status = 'verified', name = 'E2E COMPANY LDA', reason = null } = {}) {
  return answer(page, 'vies-check', () => ({ json: { status, name: status === 'verified' ? name : null, reason: status === 'error' ? (reason || 'UNREACHABLE') : reason } }))
}
