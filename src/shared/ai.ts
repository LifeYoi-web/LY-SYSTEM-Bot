// Gated Claude client. Every caller must check `aiEnabled(config)` first; when the
// ANTHROPIC_API_KEY is absent these helpers no-op (return null) and the feature stays off.
import type { AppConfig } from './config';

export function aiEnabled(config: Pick<AppConfig, 'anthropicApiKey'>): boolean {
  return Boolean(config.anthropicApiKey);
}

const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap; summaries don't need a frontier model

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

/** Produce a short Arabic summary of a ticket transcript, or null on any failure. */
export async function summarizeTranscript(text: string, apiKey: string): Promise<string | null> {
  const prompt =
    'لخّص محادثة تذكرة الدعم التالية في 3-4 أسطر بالعربية فقط. اذكر سبب فتح التذكرة، وما الذي طُلب، وهل تم حلها وكيف. لا تضف مقدمات.\n\n' +
    text.slice(0, 12_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AnthropicResponse;
    const out = data.content?.find((c) => c.type === 'text')?.text;
    return out && out.trim() ? out.trim() : null;
  } catch {
    return null;
  }
}
