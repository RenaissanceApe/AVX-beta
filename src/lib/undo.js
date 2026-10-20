import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from './ToastContext'
import { userMessage } from './logger'
import { t } from '../i18n'

// Undo instead of "are you sure?" (docs/HELP.md, H5): a removal shows at once, and the change
// is only sent when the Undo toast runs out. Nothing is put back afterwards, so nothing is sent
// twice (no "added" chat post or notification for a line that was never really gone).
// Leaving the page or closing the app sends what is waiting; if the app is killed first, the
// line simply stays, the safe way round.

export const UNDO_MS = 8000

const waiting = new Map() // key → { timer, run }

// Wait ms, then run; cancel(key) drops it, flush(key) runs it now
export function later(key, run, ms = UNDO_MS) {
  cancel(key)
  const timer = setTimeout(() => { waiting.delete(key); run() }, ms)
  waiting.set(key, { timer, run })
}
export function cancel(key) {
  const w = waiting.get(key)
  if (!w) return false
  clearTimeout(w.timer)
  waiting.delete(key)
  return true
}
export function flush(key) {
  const w = waiting.get(key)
  if (!w) return false
  cancel(key)
  w.run()
  return true
}
export function flushAll() {
  for (const key of [...waiting.keys()]) flush(key)
}
export const isWaiting = key => waiting.has(key)

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll() })
}

// In a list: const { hidden, remove } = useUndoRemove()
//   remove(row.id, { message, commit: async () => error | null, onDone })
//   …then leave out rows whose id is in hidden
export function useUndoRemove() {
  const { notify } = useToast()
  const [hidden, setHidden] = useState(() => new Set())
  const mine = useRef(new Set())
  // A list that goes away (another tab, another page) sends what it was holding
  useEffect(() => () => { for (const key of mine.current) flush(key) }, [])

  const remove = useCallback((id, { message, commit, onDone }) => {
    const key = `undo:${id}`
    const show = on => setHidden(h => { const next = new Set(h); if (on) next.delete(id); else next.add(id); return next })
    show(false)
    mine.current.add(key)
    later(key, async () => {
      mine.current.delete(key)
      const error = await commit()
      if (error) { show(true); notify(userMessage(error), 'error'); return }
      onDone?.()
    })
    notify(message, 'success', {
      duration: UNDO_MS,
      action: { label: t('common.undo'), onClick: () => { if (cancel(key)) { mine.current.delete(key); show(true) } } },
    })
  }, [notify])

  return { hidden, remove }
}
