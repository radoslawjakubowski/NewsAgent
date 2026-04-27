import { readFileSync } from "fs";

// -- Config -------------------------------------------------------------------
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("Missing required env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID");
  process.exit(1);
}

const config = JSON.parse(readFileSync("topics.json", "utf-8"));
const { topics, language, maxStoriesPerTopic, provider = "claude" } = config;

const DEFAULT_MODELS = {
  claude: "claude-sonnet-4-20250514",
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o",
};

const model = config.model ?? DEFAULT_MODELS[provider];

if (!model) {
  console.error(`Unknown provider "${provider}". Supported: claude, gemini, openai`);
  process.exit(1);
}

// -- Build the prompt ---------------------------------------------------------
function buildPrompt(topic, today) {
  return (
    `Today is ${today}. Search the web for the most important technology news about "${topic}" from the last 24 hours.\n\n` +
    `If there are no significant stories published in the last 24 hours, output ONLY the single token: NO_NEWS — nothing else, no explanation, no apology.\n\n` +
    `Otherwise return a summary in ${language} with this exact format:\n\n` +
    `**${topic}**\n\n` +
    `For each story (up to ${maxStoriesPerTopic}):\n` +
    `- [Story title](URL) -- 1-2 sentence summary of what happened and why it matters.\n\n` +
    `Output ONLY the formatted list above or ONLY the token NO_NEWS. No other text whatsoever.`
  );
}

// -- Provider init (runs once before the topic loop) --------------------------
async function initProvider() {
  if (provider === "claude") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing env var: ANTHROPIC_API_KEY");
    return new Anthropic({ apiKey });
  }

  if (provider === "gemini") {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing env var: GEMINI_API_KEY");
    return new GoogleGenAI({ apiKey });
  }

  if (provider === "openai") {
    const { default: OpenAI } = await import("openai");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing env var: OPENAI_API_KEY");
    return new OpenAI({ apiKey });
  }

  throw new Error(`Unknown provider "${provider}". Supported: claude, gemini, openai`);
}

// -- Provider: Claude ---------------------------------------------------------
async function summarizeWithClaude(client, topic, today) {
  const messages = [{ role: "user", content: buildPrompt(topic, today) }];

  let response;
  while (true) {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    });

    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = response.content
      .filter((b) => b.type === "tool_use")
      .map((t) => ({ type: "tool_result", tool_use_id: t.id, content: "" }));
    messages.push({ role: "user", content: toolResults });
  }

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// -- Provider: Gemini ---------------------------------------------------------
async function summarizeWithGemini(client, topic, today) {
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: buildPrompt(topic, today) }] }],
    config: { tools: [{ googleSearch: {} }] },
  });

  return response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("\n")
    .trim() ?? "";
}

// -- Provider: OpenAI ---------------------------------------------------------
async function summarizeWithOpenAI(client, topic, today) {
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    input: buildPrompt(topic, today),
  });

  return response.output_text?.trim() ?? "";
}

// -- Dispatch -----------------------------------------------------------------
const SUMMARIZERS = {
  claude: summarizeWithClaude,
  gemini: summarizeWithGemini,
  openai: summarizeWithOpenAI,
};

async function summarizeTopic(client, topic) {
  console.log(`  Researching: ${topic}`);

  const today = new Date().toISOString().split("T")[0];
  const text = await SUMMARIZERS[provider](client, topic, today);

  if (/^NO.?NEWS$/i.test(text) || /\bNO.?NEWS\b/i.test(text)) {
    console.log(`  No significant news for: ${topic} — skipping`);
    return null;
  }

  return text;
}

// -- Telegram sender ----------------------------------------------------------
async function sendToTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram error ${res.status}: ${err}`);
  }

  return res.json();
}

// -- Split long messages (Telegram limit: 4096 chars) -------------------------
function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let current = "";

  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

// -- Main ---------------------------------------------------------------------
async function main() {
  const date = new Date().toLocaleDateString(
    language === "English" ? "en-US" : "default",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }
  );

  console.log(`\nTech News Digest -- ${date}`);
  console.log(`Provider: ${provider} / Model: ${model}`);
  console.log(`Topics: ${topics.join(", ")}\n`);

  // Load SDK and validate API key once before processing any topics
  const client = await initProvider();

  const summaries = [];

  for (const topic of topics) {
    try {
      const summary = await summarizeTopic(client, topic);
      if (summary) summaries.push(summary);
    } catch (err) {
      console.error(`  Failed for topic "${topic}":`, err.message);
    }
  }

  if (summaries.length === 0) {
    console.log("No significant news found for any topic today. Nothing sent.");
    return;
  }

  const header = `*Tech News Digest -- ${date}*\n\n`;
  const fullMessage = header + summaries.join("\n\n---\n\n");

  console.log(`\nSending ${summaries.length} topic(s) to Telegram...`);

  const chunks = splitMessage(fullMessage);
  for (const chunk of chunks) {
    await sendToTelegram(chunk);
  }

  console.log(`Sent ${chunks.length} message(s) to Telegram.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
