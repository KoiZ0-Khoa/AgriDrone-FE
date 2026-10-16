import type { AppRole } from './types'

export function homeForRole(role: AppRole) {
  return role === 'SYSTEM_ADMIN' ? '/system' : role === 'SYSTEM_MANAGER' ? '/manager' : '/dashboard'
}
export function loginDestination(role: AppRole, requested?: string) {
  const home = homeForRole(role)
  if (!requested || !requested.startsWith('/') || requested.startsWith('//')) return home
  if (role === 'SYSTEM_ADMIN') return requested === '/system' || requested.startsWith('/system/') ? requested : home
  if (role === 'SYSTEM_MANAGER') return requested === '/manager' || requested.startsWith('/manager/') ? requested : home
  if (/^\/(system|manager)(\/|$)/.test(requested)) return home
  return requested
}
