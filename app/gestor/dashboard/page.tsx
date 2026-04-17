import type { Metadata } from 'next'
import ManagerDashboardClient from '@/components/manager/ManagerDashboardClient'
import { requireManagerSessionOrRedirect } from '@/lib/manager-auth-server'

export const metadata: Metadata = {
  title: 'Dashboard Gestor | Conecta Vale',
  description: 'Centro de controle operacional para gestores do Conecta Vale',
}

export default async function ManagerDashboardPage() {
  const session = await requireManagerSessionOrRedirect('/gestor/login')

  return <ManagerDashboardClient managerEmail={session.email} />
}
