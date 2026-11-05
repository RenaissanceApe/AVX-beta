// The nine gig-label colour keys are user data (stored in gig_statuses / gig_types). Each renders
// in its own theme token, readable as text on every ground in all three themes (DESIGN.md "Labels").
export const LABEL_COLOURS = ['grey', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'sky']
export const LABEL_VAR = {
  grey: 'var(--muted)', blue: 'var(--info)', green: 'var(--accent-text)', yellow: 'var(--yellow)', orange: 'var(--orange)',
  red: 'var(--danger)', purple: 'var(--purple)', pink: 'var(--pink)', sky: 'var(--sky)',
}
export const labelVar = colour => LABEL_VAR[colour] || LABEL_VAR.grey
