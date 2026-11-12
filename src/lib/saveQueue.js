// Saves that go out one at a time per thing (issues 214 and 229). A screen that saves a whole object
// (a task's checklist, the patch's stage boxes, the light plot) used to send each change at once;
// on a slow network an older save could reach the database after a newer one and overwrite it.
// With a queue, a save for a key waits for the one before it to finish. While it waits, newer
// changes for the same key are merged into it (later fields win), so only the latest state is
// sent and nothing is lost.
//
// `send(key, values)` does the real save and returns `{ error, ... }` (a Supabase result).
// `save(key, values)` returns a promise of that result. A caller whose change was merged into a
// later one gets `{ error: null, merged: true }`: the later caller handles the result, so an
// error is reported once.
export function createSaveQueue(send) {
  const busy = new Map() // key → { values, resolvers } waiting, or null when nothing waits

  async function run(key, values, resolvers) {
    let result
    try {
      result = (await send(key, values)) || {}
    } catch (error) {
      result = { error }
    }
    resolvers.slice(0, -1).forEach(r => r({ error: null, merged: true }))
    resolvers[resolvers.length - 1](result)
    const next = busy.get(key)
    if (next) {
      busy.set(key, null)
      run(key, next.values, next.resolvers)
    } else {
      busy.delete(key)
    }
  }

  return function save(key, values) {
    return new Promise(resolve => {
      if (!busy.has(key)) {
        busy.set(key, null)
        run(key, values, [resolve])
        return
      }
      const waiting = busy.get(key)
      if (waiting) {
        waiting.values = { ...waiting.values, ...values }
        waiting.resolvers.push(resolve)
      } else {
        busy.set(key, { values, resolvers: [resolve] })
      }
    })
  }
}
