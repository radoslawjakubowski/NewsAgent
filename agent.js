import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

// -- Config -------------------------------------------------------------------
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

// -- Claude agent: search + summarize one topic -------------------------------
async function summarizeTopic(topic) {
  console.log(`  Researching: ${topic}`);

  const today = new Date().toISOString().split("T")[0];

  const messages = [
    {
      role: "user",
      content:
        `Today is ${today}. Search the web for the most important technology news about "${topic}" from the last 24 hours.\n\n` +
        `If there are no significant stories published in the last 24 hours, output ONLY the single token: NO_NEWS — nothing else, no explanation, no apology.\n\n` +
        `Otherwise return a summary in ${language} with this exact format:\n\n` +
        `**${topic}**\n\n` +
        `For each story (up to ${maxStoriesPerTopic}):\n` +
        `- [Story title](URL) -- 1-2 sentence summary of what happened and why it matters.\n\n` +
        `Output ONLY the formatted list above or ONLY the token NO_NEWS. No other text whatsoever.`,
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

    messages.push({ role: "assistant", content: response.content });

    const toolResults = response.content
      .filter((b) => b.type === "tool_use")
      .map((toolUse) => ({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: "",
      }));

    messages.push({ role: "user", content: toolResults });
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Return null if no significant news found
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
  console.log(`Topics: ${topics.join(", ")}\n`);

  const summaries = [];

  for (const topic of topics) {
    try {
      const summary = await summarizeTopic(topic);
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
