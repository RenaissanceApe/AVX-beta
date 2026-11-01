// Stale-save guard for edit forms: the save only goes through if the record still has the
// `updated_at` it had when the form was opened. Otherwise nothing is written and the result
// says why, so one person's save can't silently overwrite another person's changes.
//
// `columns` picks what comes back as `row` (e.g. '*' when the form needs the saved record);
// it must include updated_at.
// Returns { updatedAt, row } on success, { error } on a failed request, or { conflict } with
// 'stale' (someone else saved in between), 'gone' (the record was removed or is no longer
// visible) or 'denied' (unchanged, but this user may not edit it).
export async function updateIfUnchanged(client, table, id, changes, updatedAt, columns = 'updated_at') {
  // A copy loaded without the stamp (e.g. an old offline snapshot) can't be checked: reload first
  if (!updatedAt) return { conflict: 'stale' }
  const { data, error } = await client.from(table).update(changes)
    .eq('id', id).eq('updated_at', updatedAt).select(columns)
  if (error) return { error }
  if (data?.length) return { updatedAt: data[0].updated_at, row: data[0] }
  // Nothing was written: look at the record as it is now to say why
  const { data: now, error: readError } = await client.from(table).select('updated_at').eq('id', id).maybeSingle()
  if (readError) return { error: readError }
  if (!now) return { conflict: 'gone' }
  return { conflict: now.updated_at === updatedAt ? 'denied' : 'stale' }
}

// The message key for a conflict
export const CONFLICT_MESSAGE = { stale: 'error.staleSave', gone: 'error.recordGone', denied: 'error.permission' }

// Shows a conflict as a toast; a stale save gets a Reload button. The form stays open so
// the user can copy what they typed before reloading.
export function notifyConflict(conflict, notify, t) {
  notify(t(CONFLICT_MESSAGE[conflict]), 'error', conflict === 'stale'
    ? { duration: 15000, action: { label: t('error.reload'), onClick: () => window.location.reload() } }
    : undefined)
}
