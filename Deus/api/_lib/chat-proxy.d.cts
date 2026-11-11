export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export function createAnthropicPayload(body: { system: string; messages: ChatMessage[] }, model: string): {
  model: string;
  max_tokens: number;
  system: string;
  messages: ChatMessage[];
};
export function extractAnthropicText(response: unknown): string;
