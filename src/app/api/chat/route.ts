import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 64 * 1024
const MAX_MESSAGES = 20
const MAX_MESSAGE_LENGTH = 4000

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false

  const message = value as Record<string, unknown>
  return (
    (message.role === 'user' || message.role === 'model') &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  )
}

function getTextFromGeminiEvent(line: string): string | null {
  if (!line.startsWith('data:')) return null

  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return null

  const event = JSON.parse(data) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }

  return event.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('') ?? ''
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini chat is not configured. Set GEMINI_API_KEY on the server.' },
      { status: 503 }
    )
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'The chat request is too large.' }, { status: 413 })
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'The chat request could not be read.' }, { status: 400 })
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'The chat request is too large.' }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'The chat request must contain valid JSON.' }, { status: 400 })
  }

  const messages = (payload as { messages?: unknown } | null)?.messages
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isChatMessage) ||
    messages[messages.length - 1].role !== 'user'
  ) {
    return NextResponse.json({ error: 'The chat messages are invalid.' }, { status: 400 })
  }

  const model = encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-2.5-flash')
  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "You are a helpful Kubernetes dashboard assistant. Explain Kubernetes and DevOps concepts in clear, practical language. Give safe diagnostic steps and explain commands before suggesting them. You cannot inspect or change the user's cluster, and must never claim that you did. Do not ask for passwords, API keys, kubeconfig files, or other secrets. Ask a focused follow-up question when the problem lacks important details."
            }]
          },
          contents: messages.map((message) => ({
            role: message.role,
            parts: [{ text: message.content }]
          })),
          generationConfig: { temperature: 0.3 }
        }),
        signal: request.signal
      }
    )
  } catch {
    if (request.signal.aborted) {
      return NextResponse.json({ error: 'The chat request was cancelled.' }, { status: 408 })
    }
    console.error('Gemini chat request could not reach the provider.')
    return NextResponse.json({ error: 'The AI service could not be reached. Please try again.' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    console.error(`Gemini chat provider returned HTTP ${upstream.status}.`)
    return NextResponse.json(
      { error: 'The AI service could not complete the request. Check the server configuration and try again.' },
      { status: 502 }
    )
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const writeEvent = (line: string) => {
        const text = getTextFromGeminiEvent(line)
        if (text) controller.enqueue(new TextEncoder().encode(text))
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          lines.forEach(writeEvent)

          if (done) break
        }

        if (buffer) writeEvent(buffer)
        controller.close()
      } catch {
        console.error('Gemini chat response stream failed.')
        controller.error(new Error('The AI response stream was interrupted. Please try again.'))
      } finally {
        reader.releaseLock()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
