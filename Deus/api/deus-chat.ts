import { createClient } from '@supabase/supabase-js';
import { validateChatPayload } from './_lib/chat-validation.cjs';
import { createAnthropicPayload, extractAnthropicText } from './_lib/chat-proxy.cjs';

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: Record<string, unknown>): void;
  end(): void;
};

function respond(res: ApiResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

function readAuthorization(req: ApiRequest): string | null {
  const value = req.headers.authorization;
  const header = Array.isArray(value) ? value[0] : value;
  return typeof header === 'string' && header.startsWith('Bearer ') ? header : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.DEUS_ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    respond(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
    return;
  }

  const authorization = readAuthorization(req);
  if (!authorization) {
    respond(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'A valid sign-in session is required.' } });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL;

  if (!supabaseUrl || !supabaseAnonKey || !anthropicApiKey || !anthropicModel) {
    respond(res, 503, { error: { code: 'SERVER_CONFIGURATION', message: 'The secure AI service is not fully configured.' } });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      respond(res, 400, { error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' } });
      return;
    }
  }

  const validation = validateChatPayload(body);
  if (!validation.ok) {
    respond(res, 422, { error: { code: validation.error, message: 'The conversation payload is invalid.' } });
    return;
  }

  try {
    const token = authorization.slice('Bearer '.length);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      respond(res, 401, { error: { code: 'UNAUTHENTICATED', message: 'The sign-in session is invalid or expired.' } });
      return;
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('assistant_conversations')
      .select('id')
      .eq('id', body.conversationId)
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (conversationError || !conversation) {
      respond(res, 404, { error: { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation was not found or is not accessible.' } });
      return;
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(createAnthropicPayload(body, anthropicModel)),
      signal: AbortSignal.timeout(55000),
    });

    const upstreamBody = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 400;
      respond(res, status, {
        error: {
          code: upstream.status === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_ERROR',
          message: upstream.status === 429
            ? 'The AI service is busy. Please try again shortly.'
            : 'The AI service could not complete this request.',
        },
      });
      return;
    }

    const content = extractAnthropicText(upstreamBody);
    if (!content) {
      respond(res, 502, { error: { code: 'EMPTY_AI_RESPONSE', message: 'The AI service returned an empty response.' } });
      return;
    }

    respond(res, 200, {
      content,
      model: typeof upstreamBody?.model === 'string' ? upstreamBody.model : anthropicModel,
      usage: {
        inputTokens: Number(upstreamBody?.usage?.input_tokens ?? 0),
        outputTokens: Number(upstreamBody?.usage?.output_tokens ?? 0),
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.error('D.E.U.S. Claude proxy failed', timedOut ? 'timeout' : error instanceof Error ? error.name : 'unknown');
    respond(res, timedOut ? 504 : 502, {
      error: {
        code: timedOut ? 'AI_TIMEOUT' : 'AI_PROXY_ERROR',
        message: timedOut ? 'The AI response took too long. Please try again.' : 'The secure AI service is temporarily unavailable.',
      },
    });
  }
}
