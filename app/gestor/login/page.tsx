import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import ManagerLoginForm from '@/components/manager/ManagerLoginForm'
import { getManagerSessionFromCookies } from '@/lib/manager-auth-server'

export const metadata: Metadata = {
  title: 'Login Gestor | Conecta Vale',
  description: 'Acesso restrito do gestor ao dashboard operacional do Conecta Vale',
}

export default async function ManagerLoginPage() {
  const session = await getManagerSessionFromCookies()

  if (session) {
    redirect('/gestor/dashboard')
  }

  return <ManagerLoginForm />
}
