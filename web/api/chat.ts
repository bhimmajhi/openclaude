import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = { runtime: 'nodejs' }

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ApiRequest = IncomingMessage & { body?: unknown }
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse
  json(value: unknown): void
}

function sendError(response: ApiResponse, status: number, error: string) {
  response.status(status).json({ error })
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendError(response, 405, 'Method not allowed.')
  }

  // Reject cross-origin requests. This is not a replacement for rate limiting.
  const origin = request.headers.origin
  const host = request.headers['x-forwarded-host'] ?? request.headers.host
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return sendError(response, 403, 'Cross-origin requests are not allowed.')
      }
    } catch {
      return sendError(response, 403, 'Invalid request origin.')
    }
  }

  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) return sendError(response, 500, 'NVIDIA_API_KEY is not configured.')

  const body = request.body as { messages?: unknown } | undefined
  const messages = body?.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return sendError(response, 400, 'Send between 1 and 20 chat messages.')
  }

  const validatedMessages: ChatMessage[] = []
  for (const message of messages) {
    if (
      !message ||
      typeof message !== 'object' ||
      !('role' in message) ||
      !('content' in message) ||
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      message.content.trim().length === 0 ||
      message.content.length > 4000
    ) {
      return sendError(response, 400, 'A message is invalid or too long (maximum 4,000 characters).')
    }
    validatedMessages.push({ role: message.role, content: message.content.trim() })
  }

  if (validatedMessages.at(-1)?.role !== 'user') {
    return sendError(response, 400, 'The last message must be from the user.')
  }

  try {
    const upstream = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Reply in the same language as the user.',
          },
          ...validatedMessages,
        ],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!upstream.ok) {
      // Do not return provider details or credentials to the public client.
      console.error(`NVIDIA NIM request failed with status ${upstream.status}`)
      return sendError(response, 502, 'The AI provider could not complete the request. Please try again.')
    }

    const result: unknown = await upstream.json()
    if (
      !result ||
      typeof result !== 'object' ||
      !('choices' in result) ||
      !Array.isArray(result.choices)
    ) {
      return sendError(response, 502, 'The AI provider returned an invalid response.')
    }

    const firstChoice = result.choices[0]
    const reply =
      firstChoice &&
      typeof firstChoice === 'object' &&
      'message' in firstChoice &&
      firstChoice.message &&
      typeof firstChoice.message === 'object' &&
      'content' in firstChoice.message &&
      typeof firstChoice.message.content === 'string'
        ? firstChoice.message.content
        : null

    if (!reply) return sendError(response, 502, 'The AI provider returned an empty reply.')
    return response.status(200).json({ reply })
  } catch (error) {
    console.error('NVIDIA NIM chat request failed:', error)
    return sendError(response, 502, 'Could not reach the AI provider. Please try again.')
  }
}
