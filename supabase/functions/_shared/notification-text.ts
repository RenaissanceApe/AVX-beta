// Wording for notifications, shared by the email summary (send-digest) and push notifications
// (send-push). Same wording as src/lib/notifications.js, in the recipient's language.

export type Lang = 'en' | 'pt'
export type Notification = {
  id: number
  user_id: string
  gig_id: string | null
  org_id: string | null
  actor_id: string | null
  kind: string
  details: Record<string, unknown>
  created_at: string
}

// Kinds that are a direct question to the person: sent even when the organisation is muted
export const DIRECT_KINDS = new Set(['availability_request', 'message', 'announcement', 'crew_call', 'guest_message', 'message_report', 'message_removed', 'job_application', 'job_declined'])

export const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    subjectOne: 'AVX: 1 update you haven’t seen',
    subjectMany: 'AVX: {count} updates you haven’t seen',
    intro: 'Here’s what happened on your gigs since you last checked AVX.',
    more: '…and {count} more in the app.',
    open: 'Open AVX',
    footer: 'You get this summary because you have unread notifications in AVX. Turn it off under Settings → Notifications.',
    someone: 'Someone',
    addedToGig: '{actor} added you to {gig} as {role}',
    addedToOrg: '{actor} added you to {org} as {role}',
    callTime: 'Your call time for {gig} is now {time}',
    newVersion: '{actor} uploaded version {version} of “{name}” on {gig}',
    uploaded: '{actor} uploaded “{name}” on {gig}',
    important: '{actor} posted an important update on {gig}: {excerpt}',
    schedule: '{actor} changed the schedule for {gig}',
    status: '{gig} is now {status}',
    details: '{actor} changed the dates or venue of {gig}',
    generic: 'Update on {gig}',
    gigDeleted: '{actor} deleted the gig {gig}',
    orgDeleted: '{actor} deleted the organisation {org}',
    quoteAccepted: '{client} accepted quote {number} · {title}',
    quoteDeclined: '{client} declined quote {number} · {title}',
    availabilityRequest: '{actor} asks if you’re available for {gig} ({range})',
    availabilityYes: '{actor} is available for {gig}',
    availabilityNo: '{actor} is not available for {gig}',
    bookingChanged: '{actor} set your booking on {gig} to {range}',
    bookingCleared: '{actor} booked you for the whole of {gig} again',
    damage: '{actor} reported damage to {item} on {gig}: “{excerpt}”',
    inspectionDueOne: '{count} inspection due soon in {org}',
    inspectionDueMany: '{count} inspections due soon in {org}',
    hireRequest: '{org} asked to hire from you ({range})',
    hireConfirmed: '{supplier} confirmed your hire request',
    hireDeclined: '{supplier} declined your hire request',
    messageDirectOne: '{actor}: “{excerpt}”',
    messageDirectMany: '{count} messages from {actor}, latest: “{excerpt}”',
    messageReplyOne: '{actor} replied to you in {gig}: “{excerpt}”',
    messageReplyMany: '{actor} replied to you in {gig} ({count}): “{excerpt}”',
    messageMentionOne: '{actor} mentioned you in {gig}: “{excerpt}”',
    messageMentionMany: '{actor} mentioned you in {gig} ({count}): “{excerpt}”',
    messageNoText: '{actor} sent you a message',
    messageNoTextGig: '{actor} wrote to you in {gig}',
    announcement: '📣 {actor} in {where}: “{excerpt}” — please confirm you’ve read it',
    crewCall: '{actor} offers you a place as {title} on {gig} ({range})',
    crewCallAccepted: '{actor} accepted the place as {title} on {gig}',
    crewCallDeclined: '{actor} declined the place as {title} on {gig}',
    jobApplication: '{actor} applied for {title} on {gig}',
    jobDeclined: '{actor} answered your application for {title}: the place has gone to someone else',
    jobMatch: 'New job for you: {title} at {org}, {place}, {range}',
    crewMatch: '{actor} matches your saved search “{search}”',
    guestOne: '{guest} wrote about {about}: “{excerpt}”',
    guestMany: '{guest} wrote {count} messages about {about}, latest: “{excerpt}”',
    'about.quote': 'a quote', 'about.supplier': 'a subrental',
    messageReport: 'A message in {where} was reported ({reason}). Remove it or keep it',
    messageRemoved: 'A moderator removed your message in {where}: “{excerpt}”',
    'reason.spam': 'spam', 'reason.abuse': 'abusive or harassing', 'reason.other': 'other',
    pushTest: 'Notifications are on for this device.',
    'role.pm': 'Production Manager', 'role.crew': 'Crew', 'role.viewer': 'Viewer',
    'orgRole.admin': 'Admin', 'orgRole.member': 'Member', 'orgRole.viewer': 'Viewer',
    'status.draft': 'Draft', 'status.confirmed': 'Confirmed', 'status.active': 'Active',
    'status.completed': 'Done', 'status.archived': 'Archived',
  },
  pt: {
    subjectOne: 'AVX: 1 atualização por ver',
    subjectMany: 'AVX: {count} atualizações por ver',
    intro: 'Eis o que aconteceu nos seus eventos desde a última vez que abriu o AVX.',
    more: '…e mais {count} na aplicação.',
    open: 'Abrir o AVX',
    footer: 'Recebe este resumo porque tem notificações por ler no AVX. Pode desativá-lo em Definições → Notificações.',
    someone: 'Alguém',
    addedToGig: '{actor} adicionou-o a {gig} como {role}',
    addedToOrg: '{actor} adicionou-o a {org} como {role}',
    callTime: 'A sua hora de chamada para {gig} passou a {time}',
    newVersion: '{actor} carregou a versão {version} de “{name}” em {gig}',
    uploaded: '{actor} carregou “{name}” em {gig}',
    important: '{actor} publicou uma atualização importante em {gig}: {excerpt}',
    schedule: '{actor} alterou o horário de {gig}',
    status: '{gig} está agora {status}',
    details: '{actor} alterou as datas ou o local de {gig}',
    generic: 'Atualização em {gig}',
    gigDeleted: '{actor} eliminou o evento {gig}',
    orgDeleted: '{actor} eliminou a organização {org}',
    quoteAccepted: '{client} aceitou o orçamento {number} · {title}',
    quoteDeclined: '{client} recusou o orçamento {number} · {title}',
    availabilityRequest: '{actor} pergunta se está disponível para {gig} ({range})',
    availabilityYes: '{actor} está disponível para {gig}',
    availabilityNo: '{actor} não está disponível para {gig}',
    bookingChanged: '{actor} definiu a sua marcação em {gig} para {range}',
    bookingCleared: '{actor} voltou a marcá-lo para todos os dias de {gig}',
    damage: '{actor} reportou um dano em {item} no evento {gig}: “{excerpt}”',
    inspectionDueOne: '{count} inspeção a vencer em {org}',
    inspectionDueMany: '{count} inspeções a vencer em {org}',
    hireRequest: '{org} pediu para lhe alugar equipamento ({range})',
    hireConfirmed: '{supplier} confirmou o seu pedido de aluguer',
    hireDeclined: '{supplier} recusou o seu pedido de aluguer',
    messageDirectOne: '{actor}: “{excerpt}”',
    messageDirectMany: '{count} mensagens de {actor}, a última: “{excerpt}”',
    messageReplyOne: '{actor} respondeu-lhe em {gig}: “{excerpt}”',
    messageReplyMany: '{actor} respondeu-lhe em {gig} ({count}): “{excerpt}”',
    messageMentionOne: '{actor} mencionou-o em {gig}: “{excerpt}”',
    messageMentionMany: '{actor} mencionou-o em {gig} ({count}): “{excerpt}”',
    messageNoText: '{actor} enviou-lhe uma mensagem',
    messageNoTextGig: '{actor} escreveu-lhe em {gig}',
    announcement: '📣 {actor} em {where}: “{excerpt}” — confirme que leu',
    crewCall: '{actor} oferece-lhe um lugar como {title} em {gig} ({range})',
    crewCallAccepted: '{actor} aceitou o lugar como {title} em {gig}',
    crewCallDeclined: '{actor} recusou o lugar como {title} em {gig}',
    jobApplication: '{actor} candidatou-se a {title} em {gig}',
    jobDeclined: '{actor} respondeu à sua candidatura a {title}: o lugar ficou para outra pessoa',
    jobMatch: 'Novo trabalho para si: {title} em {org}, {place}, {range}',
    crewMatch: '{actor} corresponde à sua pesquisa guardada “{search}”',
    guestOne: '{guest} escreveu sobre {about}: “{excerpt}”',
    guestMany: '{guest} escreveu {count} mensagens sobre {about}, a última: “{excerpt}”',
    'about.quote': 'um orçamento', 'about.supplier': 'um aluguer externo',
    messageReport: 'Uma mensagem em {where} foi denunciada ({reason}). Remova-a ou mantenha-a',
    messageRemoved: 'Um moderador removeu a sua mensagem em {where}: “{excerpt}”',
    'reason.spam': 'spam', 'reason.abuse': 'abusiva ou ofensiva', 'reason.other': 'outro motivo',
    pushTest: 'As notificações estão ativas neste dispositivo.',
    'role.pm': 'Production Manager', 'role.crew': 'Equipa', 'role.viewer': 'Leitor',
    'orgRole.admin': 'Administrador', 'orgRole.member': 'Membro', 'orgRole.viewer': 'Leitor',
    'status.draft': 'Rascunho', 'status.confirmed': 'Confirmado', 'status.active': 'Em curso',
    'status.completed': 'Concluído', 'status.archived': 'Arquivado',
  },
}

export function fill(text: string, vars: Record<string, unknown>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

// "10 Nov – 12 Nov" or "10 Nov, 09:00 – 18:00", in Lisbon time (the app shows the reader's own time)
export function rangeText(from: unknown, until: unknown, lang: Lang) {
  if (!from || !until) return '—'
  const locale = lang === 'pt' ? 'pt-PT' : 'en-GB'
  const start = new Date(String(from)), end = new Date(String(until))
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'Europe/Lisbon' })
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })
  const wholeDays = time.format(start) === '00:00' && time.format(end) === '00:00'
  if (wholeDays) {
    const last = new Date(end.getTime() - 12 * 3600e3)
    return day.format(start) === day.format(last) ? day.format(start) : `${day.format(start)} – ${day.format(last)}`
  }
  return day.format(start) === day.format(end)
    ? `${day.format(start)}, ${time.format(start)} – ${time.format(end)}`
    : `${day.format(start)}, ${time.format(start)} – ${day.format(end)}, ${time.format(end)}`
}

// Gig days (dates, last day included): "12 Nov", "12 Nov – 14 Nov"
export function dayText(start: unknown, end: unknown, lang: Lang) {
  if (!start) return '—'
  const day = new Intl.DateTimeFormat(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const a = day.format(new Date(`${start}T00:00:00Z`))
  const b = end && end !== start ? day.format(new Date(`${end}T00:00:00Z`)) : a
  return a === b ? a : `${a} – ${b}`
}

// Same wording as src/lib/notifications.js, rendered in the recipient's language.
export function describe(n: Notification, lang: Lang, actorName: string | undefined) {
  const s = STRINGS[lang]
  const d = n.details || {}
  const actor = actorName || s.someone
  const gig = String(d.gig_name ?? '')
  switch (n.kind) {
    case 'added_to_gig': return fill(s.addedToGig, { actor, gig, role: d.function_title || s[`role.${d.role || 'crew'}`] })
    case 'added_to_org': return fill(s.addedToOrg, { actor, org: d.org_name, role: s[`orgRole.${d.role || 'member'}`] })
    case 'call_time_changed': return fill(s.callTime, { gig, time: String(d.call_time ?? '—').slice(0, 5) })
    case 'asset_new_version': return fill(s.newVersion, { actor, name: d.name, version: d.version, gig })
    case 'asset_uploaded': return fill(s.uploaded, { actor, name: d.name, gig })
    case 'important_post': return fill(s.important, { actor, gig, excerpt: d.excerpt })
    case 'schedule_changed': return fill(s.schedule, { actor, gig })
    case 'gig_status': return fill(s.status, { gig, status: s[`status.${d.status}`] ?? d.status })
    case 'gig_details': return fill(s.details, { actor, gig })
    case 'gig_deleted': return fill(s.gigDeleted, { actor, gig })
    case 'org_deleted': return fill(s.orgDeleted, { actor, org: d.org_name })
    case 'quote_accepted': return fill(s.quoteAccepted, { client: d.client_name, number: d.number, title: d.quote_title })
    case 'quote_declined': return fill(s.quoteDeclined, { client: d.client_name, number: d.number, title: d.quote_title })
    case 'availability_request': return fill(s.availabilityRequest, { actor, gig, range: rangeText(d.from, d.until, lang) })
    case 'availability_reply':
      return fill(d.answer === 'available' ? s.availabilityYes : s.availabilityNo, { actor, gig }) + (d.note ? `: “${d.note}”` : '')
    case 'booking_changed': return d.booked_from && d.booked_until
      ? fill(s.bookingChanged, { actor, gig, range: rangeText(d.booked_from, d.booked_until, lang) })
      : fill(s.bookingCleared, { actor, gig })
    case 'damage_reported':
      return fill(s.damage, { actor, item: [d.item_name, d.unit_code].filter(Boolean).join(' · '), gig: gig || '—', excerpt: d.excerpt ?? '' })
    case 'inspection_due':
      return fill(Number(d.count) === 1 ? s.inspectionDueOne : s.inspectionDueMany, { count: d.count ?? 0, org: d.org_name ?? '' })
    case 'hire_request': return fill(s.hireRequest, { org: d.from_org ?? '', range: rangeText(d.starts_at, d.ends_at, lang) })
    case 'hire_answered': return fill(d.answer === 'confirmed' ? s.hireConfirmed : s.hireDeclined, { supplier: d.supplier ?? '' })
    case 'crew_call': return fill(s.crewCall, { actor, title: d.title ?? '', gig, range: dayText(d.start_date, d.end_date, lang) })
    case 'crew_call_answer': return fill(d.answer === 'accepted' ? s.crewCallAccepted : s.crewCallDeclined, { actor, title: d.title ?? '', gig })
    case 'job_application': return fill(s.jobApplication, { actor, title: d.title ?? '', gig })
    case 'job_declined': return fill(s.jobDeclined, { actor, title: d.title ?? '' })
    case 'job_match': return fill(s.jobMatch, { title: d.title ?? '', org: d.org_name ?? '', place: d.place ?? '—', range: dayText(d.starts_on, d.ends_on, lang) })
    case 'crew_match': return fill(s.crewMatch, { actor, search: d.search_name ?? '' })
    case 'guest_message': return fill(Number(d.count ?? 1) > 1 ? s.guestMany : s.guestOne, {
      guest: d.guest_name ?? s.someone, about: d.about || s[`about.${d.about_kind ?? 'quote'}`], count: d.count ?? 1, excerpt: d.excerpt ?? '' })
    case 'message_report': return fill(s.messageReport, { where: d.where ?? gig, reason: s[`reason.${d.reason ?? 'other'}`] ?? '' })
    case 'message_removed': return fill(s.messageRemoved, { where: d.where ?? gig, excerpt: d.excerpt ?? '' })
    case 'announcement': return fill(s.announcement, { actor, where: d.where ?? gig, excerpt: d.excerpt ?? '' })
    case 'message': {
      const many = Number(d.count ?? 1) > 1
      const vars = { actor, gig, count: d.count ?? 1, excerpt: d.excerpt ?? '' }
      if (!d.excerpt) return fill(d.gig_name ? s.messageNoTextGig : s.messageNoText, vars)
      if (d.why === 'mention') return fill(many ? s.messageMentionMany : s.messageMentionOne, vars)
      return d.gig_name ? fill(many ? s.messageReplyMany : s.messageReplyOne, vars) : fill(many ? s.messageDirectMany : s.messageDirectOne, vars)
    }
    default: return fill(s.generic, { gig })
  }
}

export function linkFor(n: Notification, appUrl: string) {
  if ((n.kind === 'message' || n.kind === 'crew_call' || n.kind === 'guest_message') && n.details?.conversation_id) return `${appUrl}/messages/${n.details.conversation_id}`
  if ((n.kind === 'announcement' || n.kind === 'message_report') && n.details?.conversation_id) return `${appUrl}/messages/${n.details.conversation_id}?m=${n.details.message_id}`
  if (n.kind === 'message_removed' && n.details?.conversation_id) return `${appUrl}/messages/${n.details.conversation_id}`
  if (n.kind === 'job_application' && n.org_id) return `${appUrl}/org/${n.org_id}/jobs`
  if (n.kind === 'job_declined' || n.kind === 'job_match') return `${appUrl}/jobs`
  if (n.kind === 'crew_match' && n.org_id) return `${appUrl}/org/${n.org_id}/crew?search=${n.details?.search_id ?? ''}`
  if (n.details?.quote_id) return `${appUrl}/quote/${n.details.quote_id}`
  if ((n.kind === 'damage_reported' || n.kind === 'inspection_due') && n.org_id) return `${appUrl}/org/${n.org_id}/inventory?tab=maintenance`
  if ((n.kind === 'hire_request' || n.kind === 'hire_answered') && n.org_id) return `${appUrl}/org/${n.org_id}/inventory?tab=subrentals`
  if (n.kind === 'availability_request') return `${appUrl}/me#requests`
  if (n.gig_id && (n.kind === 'availability_reply' || n.kind === 'booking_changed' || n.kind === 'crew_call_answer')) return `${appUrl}/gig/${n.gig_id}?tab=crew`
  if (!n.gig_id) return `${appUrl}/dashboard`
  return n.kind === 'schedule_changed' ? `${appUrl}/gig/${n.gig_id}?tab=schedule` : `${appUrl}/gig/${n.gig_id}`
}
