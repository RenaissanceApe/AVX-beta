// The AVX admins' marks on truss tables (public.truss_table_checks, RG2), with the last copy kept
// on the device so the pass/fail still reads offline. Everyone signed in can read them.
import { supabase } from './supabase'
import { logger } from './logger'
import { saveSnapshot, loadSnapshot, isNetworkError } from './offline'

export const CHECK_FIELDS = 'id, table_id, edition, source_sha256, status, rows_checked, note, checked_by_name, checked_at, withdrawn_at, withdrawn_by_name, withdrawn_note'

export async function loadTrussChecks() {
  const { data, error } = await supabase.from('truss_table_checks').select(CHECK_FIELDS).order('checked_at', { ascending: false }).limit(1000)
  if (error) {
    if (!isNetworkError(error)) logger.warn('truss', error, { step: 'checks' })
    return { checks: loadSnapshot('truss.checks')?.data || [], offline: true }
  }
  saveSnapshot('truss.checks', data || [])
  return { checks: data || [], offline: false }
}
