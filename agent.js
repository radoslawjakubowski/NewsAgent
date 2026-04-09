import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

// ── Config ────────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!ANTHROPIC_API_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error(
    "Missing required env vars: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync("topics.json", "utf-8"));
const { topics, language, maxStoriesPerTopic } = config;

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Claude agent: search + summarize one topic ────────────────────────────────
async function summarizeTopic(topic) {
  console.log(`  Researching: ${topic}`);

  const today = new Date().toISOString().split("T")[0];

  // Agentic loop: Claude may call web_search multiple times before answering
  const messages = [
    {
      role: "user",
      content: `Today is ${today}. Search the web for the most important technology news about "${topic}" from the last 24 hours.

Return a summary in ${language} with this exact format:

**${topic}**

For each story (up to ${maxStoriesPerTopic}):
• [Story title](URL) — 1-2 sentence summary of what happened and why it matters.

If there are no significant stories in the last 24h, say so briefly.
Do not include anything outside this format.`,
    },
  ];

  let response;

  // Agentic loop: keep going while Claude wants to use tools
  while (true) {
    response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    });

    if (response.stop_reason !== "tool_use") break;

    // Append assistant turn
    messages.push({ role: "assistant", content: response.content });

    // Process tool calls and append tool results
    const toolResults = response.content
      .filter((b) => b.type === "tool_use")
      .map((toolUse) => ({
        type: "tool_result",
        tool_use_id: toolUse.id,
        // The SDK handles injecting the actual search results automatically
        // when using the built-in web_search tool type
        content: "",
      }));

    messages.push({ role: "user", content: toolResults });
  }

  // Extract the final text response
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text;
}

// ── Telegram sender ───────────────────────────────────────────────────────────
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

// ── Split long messages (Telegram limit: 4096 chars) ─────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const date = new Date().toLocaleDateString(language === "English" ? "en-US" : "default", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  console.log(`\n🤖 Tech News Digest — ${date}`);
  console.log(`Topics: ${topics.join(", ")}\n`);

  const summaries = [];

  for (const topic of topics) {
    try {
      const summary = await summarizeTopic(topic);
      summaries.push(summary);
    } catch (err) {
      console.error(`  ✗ Failed for topic "${topic}":`, err.message);
      summaries.push(`**${topic}**\n_Could not fetch news for this topic._`);
    }
  }

  const header = `🗞 *Tech News Digest — ${date}*\n\n`;
  const fullMessage = header + summaries.join("\n\n---\n\n");

  console.log("\nSending to Telegram...");

  const chunks = splitMessage(fullMessage);
  for (const chunk of chunks) {
    await sendToTelegram(chunk);
  }

  console.log(`✓ Sent ${chunks.length} message(s) to Telegram.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
