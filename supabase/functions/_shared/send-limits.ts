// Send limits (migration 20261203000000_send_limits.sql): ask the database before each email or
// push. 'ok' → send it (it's now counted); 'limited' → over a limit, don't send; 'error' → the
// check itself failed, don't send either (better a missed email than an unlimited one).

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { code?: string; hint?: string; message?: string } | null }> }

export type Claim = 'ok' | 'limited' | 'error'

export async function claimSend(client: Rpc, fn: string, args: Record<string, unknown>): Promise<Claim> {
  const { error } = await client.rpc(fn, args)
  if (!error) return 'ok'
  if (error.code === '54000') {
    console.log(JSON.stringify({ fn: 'send-limits', step: 'limited', kind: args.p_kind, limit: error.hint }))
    return 'limited'
  }
  console.error(JSON.stringify({ fn: 'send-limits', step: 'claim', kind: args.p_kind, code: error.code }))
  return 'error'
}
