import { Suspense } from 'react'
import RotaClient from '@/components/RotaClient'

export default function RotaPage() {
  return (
    <main style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
        Connecta Vale - Rota Operacional
      </h1>

      <p style={{ marginBottom: '20px' }}>
        Toque no botao abaixo para compartilhar sua localizacao e gerar a rota.
      </p>

      <Suspense fallback={<p>Carregando rota...</p>}>
        <RotaClient />
      </Suspense>
    </main>
  )
}