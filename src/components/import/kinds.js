import { CONTACT_KINDS, HELD_KINDS, JOB_KINDS } from '../../lib/importer'

// What each kind of import is, for the wizard's steps (src/pages/ImportPage.jsx)
export const isContacts = kind => CONTACT_KINDS.includes(kind)
// Crew aren't kept in import batches (no presets or history): they become held invitations
export const isHeld = kind => HELD_KINDS.includes(kind)
// Jobs, their equipment and quotes aren't either: what they add is removed the usual way
export const isJob = kind => JOB_KINDS.includes(kind)
export const unbatched = kind => isHeld(kind) || isJob(kind)
// Importing contacts needs the hand-run file (docs/SWITCHING.md, S2); until then the database says so
export const contactsOff = (error, kind) => isContacts(kind) && (error?.code === '0A000' || error?.code === '23514')
// How an import's batches and saved matchings are kept: kit contents as equipment with subject 'kits'
export const stored = kind => (kind === 'kits' ? { kind: 'items', subject: 'kits' } : { kind, subject: null })
