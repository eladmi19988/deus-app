const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateChatPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "INVALID_BODY" };
  }
  if (typeof body.conversationId !== "string" || !UUID_RE.test(body.conversationId)) {
    return { ok: false, error: "INVALID_CONVERSATION_ID" };
  }
  if (typeof body.system !== "string" || body.system.length < 1 || body.system.length > 20000) {
    return { ok: false, error: "INVALID_SYSTEM_PROMPT" };
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
    return { ok: false, error: "INVALID_MESSAGES" };
  }
  for (const message of body.messages) {
    if (!message || typeof message !== "object" ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.length < 1 || message.content.length > 12000) {
      return { ok: false, error: "INVALID_MESSAGE" };
    }
  }
  return { ok: true };
}

module.exports = { validateChatPayload };
