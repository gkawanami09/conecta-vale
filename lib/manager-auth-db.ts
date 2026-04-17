import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'

export async function isManagerCredentialValidFromDb(
  email: string,
  password: string
) {
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail || !password) {
    return false
  }

  const { data, error } = await supabaseAdmin.rpc('verify_manager_credentials', {
    p_email: normalizedEmail,
    p_password: password,
  })

  if (error) {
    console.error('[manager-auth-db] verify_rpc_error', error)
    return false
  }

  return Boolean(data)
}
