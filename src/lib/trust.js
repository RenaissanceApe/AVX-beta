// Crew network N4 (docs/CREW_NETWORK.md): company verification, certificate marks, reports.

// Countries VIES checks (EU members; Greece is EL there, Northern Ireland XI)
export const VIES_COUNTRIES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE',
  'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI']

// The ISO code a country is named by (EL and XI aren't ISO codes)
export const isoFor = code => (code === 'EL' ? 'GR' : code === 'XI' ? 'GB' : code)

// A tax number typed with its country prefix ("PT 500 000 000") → { country, number }
export function splitVat(value, fallbackCountry = '') {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  let prefix = raw.slice(0, 2)
  if (prefix === 'GR') prefix = 'EL'
  if (VIES_COUNTRIES.includes(prefix)) return { country: prefix, number: raw.slice(2) }
  const fb = String(fallbackCountry || '').toUpperCase() === 'GR' ? 'EL' : String(fallbackCountry || '').toUpperCase()
  return { country: VIES_COUNTRIES.includes(fb) ? fb : '', number: raw }
}

export const REPORT_REASONS = ['spam', 'fake', 'discrimination', 'abuse', 'other']

// How a certificate stands: verified by AVX, confirmed by companies, or self-declared
export function certStatus(c) {
  if (c?.verified) return 'verified'
  if (c?.confirmed_by?.length) return 'confirmed'
  return 'self'
}

// Whether this organisation already confirmed the certificate
export const confirmedByOrg = (c, orgId) => !!c?.confirmed_by?.some(x => x.org_id === orgId)

// A safe file name for an uploaded proof
export function proofPath(userId, certId, fileName) {
  const ext = (String(fileName || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'pdf').toLowerCase()
  return `${userId}/${certId}/${Date.now()}.${ext}`
}

// Database errors → message keys
export function trustError(error) {
  const m = error?.message || ''
  if (m.includes('Already reported')) return 'trust.err.alreadyReported'
  if (m.includes('Report limit')) return 'trust.err.reportLimit'
  if (m.includes('Check limit')) return 'trust.err.checkLimit'
  if (m.includes('Not an EU VAT country')) return 'trust.err.notEu'
  if (m.includes('Invalid VAT number')) return 'trust.err.invalidVat'
  if (m.includes('Already asked')) return 'trust.err.alreadyAsked'
  if (m.includes('Only a company they have worked with')) return 'trust.err.notWorkedWith'
  if (m.includes('Only takes contact')) return 'trust.err.onlyKnown'
  if (m.includes('Upload the file first')) return 'trust.err.upload'
  if (m.includes('Proof limit')) return 'trust.err.proofLimit'
  if (m.includes('Posting suspended')) return 'trust.err.postingSuspended'
  if (m.includes('No files before they reply')) return 'trust.err.noFilesYet'
  return null
}
