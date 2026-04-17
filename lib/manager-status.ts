import type { DashboardUser } from '@/lib/manager-dashboard-types'

export function managerUserStatusLabel(status: DashboardUser['status']) {
  if (status === 'active') return 'Ativo'
  if (status === 'stale') return 'Sem atualizacao recente'
  return 'Compartilhamento desativado'
}

export function managerUserStatusClass(status: DashboardUser['status']) {
  if (status === 'active') return 'bg-emerald-500'
  if (status === 'stale') return 'bg-amber-500'
  return 'bg-slate-400'
}
