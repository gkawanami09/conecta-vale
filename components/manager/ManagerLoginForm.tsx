'use client'

import { FormEvent, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function ManagerLoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/gestor/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = (await response.json()) as {
        ok?: boolean
        error?: string
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Falha no login do gestor')
      }

      const nextPath = searchParams.get('next')
      const target =
        nextPath && nextPath.startsWith('/gestor') && nextPath !== '/gestor/login'
          ? nextPath
          : '/gestor/dashboard'

      window.location.href = target
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Não foi possível autenticar o gestor'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf3ef] p-4'>
      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(0,99,65,0.16),transparent_40%),radial-gradient(circle_at_84%_16%,rgba(56,72,128,0.16),transparent_42%),linear-gradient(135deg,#f2f7f4_0%,#e7efea_100%)]' />

      <form
        onSubmit={handleSubmit}
        className='relative z-10 w-full max-w-md rounded-2xl border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur'
      >
        <p className='text-xs font-semibold uppercase tracking-[0.14em] text-[#006341]'>
          Conecta Vale
        </p>
        <h1 className='mt-2 text-2xl font-semibold text-slate-900'>
          Login do Gestor
        </h1>
        <p className='mt-2 text-sm text-slate-600'>
          Acesso restrito ao painel operacional de monitoramento.
        </p>

        <div className='mt-6 space-y-3'>
          <label className='block'>
            <span className='mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600'>
              E-mail
            </span>
            <input
              type='email'
              autoComplete='username'
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#006341] focus:ring-2 focus:ring-[#006341]/20'
              placeholder='gestor@conecta-vale.local'
            />
          </label>

          <label className='block'>
            <span className='mb-1.5 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-600'>
              Senha
            </span>
            <input
              type='password'
              autoComplete='current-password'
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#006341] focus:ring-2 focus:ring-[#006341]/20'
              placeholder='Digite sua senha'
            />
          </label>
        </div>

        {error && (
          <p className='mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700'>
            {error}
          </p>
        )}

        <button
          type='submit'
          disabled={loading}
          className='mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#006341] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#004f34] disabled:cursor-not-allowed disabled:bg-[#2f8b69]'
        >
          {loading ? 'Entrando...' : 'Entrar no dashboard'}
        </button>
      </form>
    </div>
  )
}
