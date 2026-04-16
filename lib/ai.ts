import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

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
  if (!genAI) {
    console.warn(
      '[ai] GEMINI_API_KEY nao encontrada. Usando fallback de classificacao.'
    )
    return unknownEvent(text)
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

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

  const result = await model.generateContent(prompt)
  const response = await result.response
  const raw = response.text().trim()

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