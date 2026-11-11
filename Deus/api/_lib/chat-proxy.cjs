function createAnthropicPayload(body, model) {
  return {
    model,
    max_tokens: 4096,
    system: body.system,
    messages: body.messages.map(({ role, content }) => ({ role, content })),
  };
}

function extractAnthropicText(response) {
  if (!response || !Array.isArray(response.content)) return "";
  return response.content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}

module.exports = { createAnthropicPayload, extractAnthropicText };
