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

  const model = encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-3.5-flash')
  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
    const error = upstream.status === 404
      ? `Gemini could not find or use model "${decodeURIComponent(model)}". Set GEMINI_MODEL to a model available to this API key.`
      : upstream.status === 401 || upstream.status === 403
        ? `Gemini rejected the API key or its permissions (HTTP ${upstream.status}). Verify the key and that the Gemini API is enabled for its project.`
        : upstream.status === 429
          ? 'Gemini API quota or rate limit was reached (HTTP 429). Check the project quota and try again later.'
          : upstream.status === 503
            ? 'Gemini is temporarily overloaded. Please retry in a few moments.'
          : `Gemini could not complete the request (HTTP ${upstream.status}). Check the model configuration and Google AI project.`
    console.error(`Gemini chat provider returned HTTP ${upstream.status}.`)
    return NextResponse.json(
      { error },
      { status: 502 }
    )
  }

  let result: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  try {
    result = await upstream.json()
  } catch {
    console.error('Gemini chat response was not valid JSON.')
    return NextResponse.json({ error: 'Gemini returned an invalid response. Please try again.' }, { status: 502 })
  }

  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    console.error('Gemini chat response did not contain text.')
    return NextResponse.json(
      { error: 'Gemini returned no text. The request may have been blocked; please try rephrasing it.' },
      { status: 502 }
    )
  }

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
