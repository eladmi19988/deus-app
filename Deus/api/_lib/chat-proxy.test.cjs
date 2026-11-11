const test = require("node:test");
const assert = require("node:assert/strict");
const { createAnthropicPayload, extractAnthropicText } = require("./chat-proxy.cjs");

test("builds a minimal Anthropic request from validated conversation data", () => {
  const payload = createAnthropicPayload({
    system: "You are D.E.U.S.",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
  }, "claude-test-model");

  assert.deepEqual(payload, {
    model: "claude-test-model",
    max_tokens: 4096,
    system: "You are D.E.U.S.",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
  });
});

test("extracts and joins text blocks from Anthropic's response", () => {
  assert.equal(extractAnthropicText({
    content: [
      { type: "text", text: "Hello" },
      { type: "tool_use", id: "ignored" },
      { type: "text", text: " from D.E.U.S." },
    ],
  }), "Hello from D.E.U.S.");
});

test("returns an empty string when Anthropic has no text blocks", () => {
  assert.equal(extractAnthropicText({ content: [{ type: "tool_use" }] }), "");
});
