// Where things live in the app, for the top bar, the section menus and the phone tabs.
// One list for everything, filtered by the current workspace and your role in it, so a
// menu never offers something the database would refuse.
//
// Workspaces: "me" (My work: every gig you're on, at any company, in any role) or an
// organisation you belong to, where your role there (admin / member / viewer) decides
// what you see.

export const MY_WORK = 'me'

export const homePath = workspace => (workspace && workspace !== MY_WORK ? `/org/${workspace}` : '/me')

const canQuote = role => role === 'admin' || role === 'member'

// Each item: { key, icon, to, minor? }. Labels are i18n keys nav.<key> / nav.<key>Desc.
export function navSections({ workspace, role }) {
  if (!workspace || workspace === MY_WORK) {
    return [
      { key: 'work', icon: 'briefcase', items: [
        { key: 'myGigs', icon: 'list', to: '/me' },
        { key: 'myCalendar', icon: 'calendar', to: '/me?view=calendar' },
        { key: 'availability', icon: 'calendarOff', to: '/me?panel=account' },
      ] },
      { key: 'organisations', icon: 'building', items: [
        { key: 'allOrgs', icon: 'building', to: '/orgs' },
        { key: 'newOrg', icon: 'plus', to: '/orgs?new=1', minor: true },
      ] },
    ]
  }
  const base = `/org/${workspace}`
  const sections = [
    { key: 'gigs', icon: 'calendar', items: [
      { key: 'orgGigs', icon: 'list', to: base },
      { key: 'orgCalendar', icon: 'calendar', to: `${base}?view=calendar` },
      ...(canQuote(role) ? [{ key: 'newGig', icon: 'plus', to: `${base}?new=gig`, minor: true }] : []),
    ] },
  ]
  if (canQuote(role)) {
    sections.push({ key: 'quotes', icon: 'fileText', items: [
      { key: 'quotes', icon: 'fileText', to: `${base}/quotes` },
      { key: 'priceList', icon: 'tags', to: `${base}/quotes?tab=prices` },
      { key: 'templates', icon: 'layoutTemplate', to: `${base}/quotes?tab=templates` },
      { key: 'company', icon: 'building', to: `${base}/quotes?company=1`, minor: true },
    ] })
    sections.push({ key: 'inventory', icon: 'package', items: [
      { key: 'catalogue', icon: 'package', to: `${base}/inventory` },
      { key: 'locations', icon: 'mapPin', to: `${base}/inventory?tab=locations` },
      { key: 'movements', icon: 'history', to: `${base}/inventory?tab=movements` },
      { key: 'maintenance', icon: 'wrench', to: `${base}/inventory?tab=maintenance` },
      { key: 'labels', icon: 'qrCode', to: `${base}/inventory/labels`, minor: true },
    ] })
  }
  sections.push({ key: 'organisation', icon: 'users', items: [
    { key: 'members', icon: 'users', to: `${base}?panel=members` },
    ...(role === 'admin' ? [{ key: 'orgSettings', icon: 'settings', to: `${base}?panel=settings` }] : []),
    { key: 'allOrgs', icon: 'building', to: '/orgs', minor: true },
  ] })
  return sections
}

// Panel layout: big cards for the main items (at most 4), the rest as a compact list
// beside them. Small sections stay all-cards; long ones become the hybrid.
export function splitItems(items, maxCards = 4) {
  const main = items.filter(i => !i.minor)
  return { cards: main.slice(0, maxCards), list: [...main.slice(maxCards), ...items.filter(i => i.minor)] }
}

// Phone bottom bar: the few places used daily; everything else is under "More".
export function phoneTabs({ workspace, role }) {
  if (!workspace || workspace === MY_WORK) {
    return [
      { key: 'myGigs', icon: 'list', to: '/me' },
      { key: 'myCalendar', icon: 'calendar', to: '/me?view=calendar' },
      { key: 'allOrgs', icon: 'building', to: '/orgs' },
    ]
  }
  const base = `/org/${workspace}`
  return [
    { key: 'orgGigs', icon: 'list', to: base },
    canQuote(role)
      ? { key: 'quotes', icon: 'fileText', to: `${base}/quotes` }
      : { key: 'orgCalendar', icon: 'calendar', to: `${base}?view=calendar` },
    { key: 'members', icon: 'users', to: `${base}?panel=members` },
  ]
}

// Is this item the page we're on? Compares the path and, when the item has one, its query.
export function isActive(item, pathname, search = '') {
  const [path, query] = item.to.split('?')
  if (path !== pathname) return false
  const want = new URLSearchParams(query || '')
  const have = new URLSearchParams(search)
  const KEYS = ['view', 'panel', 'tab', 'company', 'new']
  return KEYS.every(k => (want.get(k) || null) === (have.get(k) || null))
}

// Which workspace to open after signing in: the one used last if it still exists,
// otherwise the first organisation where you work (admin or member), otherwise My work.
// Freelancers who are only crew (or viewers) land on My work.
export function defaultWorkspace(orgs, remembered) {
  if (remembered === MY_WORK) return MY_WORK
  if (remembered && orgs.some(o => o.id === remembered)) return remembered
  const work = orgs.find(o => o.myRole === 'admin' || o.myRole === 'member')
  return work ? work.id : MY_WORK
}
