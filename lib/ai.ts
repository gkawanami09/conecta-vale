const apiKey = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'

export type ParsedEvent = {
  event_type: 'interdicao' | 'solicitacao_rota' | 'pedido_apoio' | 'status' | 'desconhecido'
  location: string | null
  destination: string | null
  priority: 'baixa' | 'media' | 'alta' | null
  details: string | null
}

function unknownEvent(text: string): ParsedEvent {
  return {
    event_type: 'desconhecido',
    location: null,
    destination: null,
    priority: null,
    details: text,
  }
}

export async function parseOperationalMessage(text: string): Promise<ParsedEvent> {
  if (!apiKey) {
    console.warn(
      '[ai] OPENAI_API_KEY nao encontrada. Usando fallback de classificacao.'
    )
    return unknownEvent(text)
  }

  const prompt = `
Voce e o Marco, um assistente operacional logistico.

Sua tarefa e analisar mensagens operacionais enviadas por WhatsApp e classifica-las em uma destas categorias:
- interdicao
- solicitacao_rota
- pedido_apoio
- status
- desconhecido

Regras:
- Responda APENAS com JSON valido.
- Nao escreva explicacoes.
- Se nao souber, use "desconhecido".
- "location" e o local citado na mensagem.
- "destination" e o destino, se houver.
- "priority" deve ser: "baixa", "media", "alta" ou null.
- "details" deve resumir a mensagem de forma objetiva.

Formato obrigatorio:
{
  "event_type": "interdicao" | "solicitacao_rota" | "pedido_apoio" | "status" | "desconhecido",
  "location": string | null,
  "destination": string | null,
  "priority": "baixa" | "media" | "alta" | null,
  "details": string | null
}

Mensagem:
"""${text}"""
`
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 400,
    }),
  })

  if (!response.ok) {
    console.error('[ai] openai_request_error', await response.text())
    return unknownEvent(text)
  }

  const data = (await response.json()) as {
    output_text?: string
  }
  const raw = (data.output_text ?? '').trim()

  const cleaned = raw
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()

  try {
    return JSON.parse(cleaned) as ParsedEvent
  } catch {
    return unknownEvent(text)
  }
}
