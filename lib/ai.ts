import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY

if (!apiKey) {
  throw new Error('GEMINI_API_KEY não encontrada nas variáveis de ambiente.')
}

const genAI = new GoogleGenerativeAI(apiKey)

export type ParsedEvent = {
  event_type: 'interdicao' | 'solicitacao_rota' | 'pedido_apoio' | 'status' | 'desconhecido'
  location: string | null
  destination: string | null
  priority: 'baixa' | 'media' | 'alta' | null
  details: string | null
}

export async function parseOperationalMessage(text: string): Promise<ParsedEvent> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `
Você é o Marco, um assistente operacional logístico.

Sua tarefa é analisar mensagens operacionais enviadas por WhatsApp e classificá-las em uma destas categorias:
- interdicao
- solicitacao_rota
- pedido_apoio
- status
- desconhecido

Regras:
- Responda APENAS com JSON válido.
- Não escreva explicações.
- Se não souber, use "desconhecido".
- "location" é o local citado na mensagem.
- "destination" é o destino, se houver.
- "priority" deve ser: "baixa", "media", "alta" ou null.
- "details" deve resumir a mensagem de forma objetiva.

Formato obrigatório:
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
    return {
      event_type: 'desconhecido',
      location: null,
      destination: null,
      priority: null,
      details: text,
    }
  }
}