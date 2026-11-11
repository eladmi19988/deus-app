const { createClient } = require("@supabase/supabase-js");
const { validateChatPayload } = require("./_lib/chat-validation.cjs");
const { createAnthropicPayload, extractAnthropicText } = require("./_lib/chat-proxy.cjs");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } });
  }

  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "A valid sign-in session is required." } });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: { code: "INVALID_JSON", message: "The request body must be valid JSON." } });
    }
  }

  const validation = validateChatPayload(body);
  if (!validation.ok) {
    return res.status(422).json({ error: { code: validation.error, message: "The chat request is invalid." } });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ANTHROPIC_API_KEY || !ANTHROPIC_MODEL) {
    return res.status(503).json({ error: { code: "SERVER_CONFIGURATION", message: "The secure AI server is not configured yet." } });
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "The sign-in session is invalid or expired." } });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", body.conversationId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return res.status(404).json({ error: { code: "CONVERSATION_NOT_FOUND", message: "Conversation was not found or is not accessible." } });
    }

    let providerResponse;
    try {
      providerResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(createAnthropicPayload(body, ANTHROPIC_MODEL)),
        signal: AbortSignal.timeout(55000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.error("Claude request failed", timedOut ? "timeout" : error instanceof Error ? error.name : "unknown");
      return res.status(timedOut ? 504 : 502).json({
        error: {
          code: timedOut ? "AI_TIMEOUT" : "AI_PROVIDER_UNREACHABLE",
          message: timedOut ? "The AI response took too long. Please try again." : "Could not reach Claude. Try again.",
        },
      });
    }

    let result;
    try {
      result = await providerResponse.json();
    } catch {
      return res.status(502).json({ error: { code: "AI_PROVIDER_INVALID_RESPONSE", message: "Claude returned an invalid response." } });
    }

    if (!providerResponse.ok) {
      console.error("Claude API error", providerResponse.status, result?.error?.type || "unknown");
      const status = providerResponse.status === 429 ? 429 : providerResponse.status >= 500 ? 502 : 400;
      return res.status(status).json({
        error: {
          code: providerResponse.status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_ERROR",
          message: providerResponse.status === 429
            ? "The AI service is busy. Please try again shortly."
            : "Claude could not complete this request. Check the API key, model and account access.",
        },
      });
    }

    const content = extractAnthropicText(result);
    if (!content) {
      return res.status(502).json({ error: { code: "EMPTY_AI_RESPONSE", message: "Claude returned an empty response." } });
    }

    return res.status(200).json({
      content,
      usage: {
        inputTokens: Number(result.usage?.input_tokens || 0),
        outputTokens: Number(result.usage?.output_tokens || 0),
      },
      model: typeof result.model === "string" ? result.model : ANTHROPIC_MODEL,
    });
  } catch (error) {
    console.error("deus-chat proxy failed", error instanceof Error ? error.name : "unknown");
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } });
  }
};
