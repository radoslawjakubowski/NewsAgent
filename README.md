# Tech News Digest 🗞

A GitHub Actions agent that searches the web for tech news on your chosen topics every morning and sends a formatted summary to your Telegram.

## How it works

1. GitHub Actions triggers the script on a cron schedule
2. `agent.js` calls your chosen LLM with its native web search tool
3. The model searches for the last 24h of news per topic and writes a summary with links
4. Topics with no recent news are silently skipped
5. The digest is sent to your Telegram chat via your bot

## Setup

### 1. Clone / fork this repo

```bash
git clone <your-repo-url>
cd tech-news-digest
```

### 2. Customize your topics

Edit `topics.json`:

```json
{
  "topics": [
    "Artificial Intelligence and LLM releases",
    "Cybersecurity vulnerabilities and breaches",
    "JavaScript and frontend ecosystem",
    "Cloud infrastructure and DevOps"
  ],
  "language": "English",
  "maxStoriesPerTopic": 5,
  "provider": "claude",
  "model": "claude-sonnet-4-20250514"
}
```

### 3. Choose your LLM provider

Set `provider` and (optionally) `model` in `topics.json`:

| `provider` | Default `model` | API key env var |
|---|---|---|
| `"claude"` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| `"gemini"` | `gemini-2.0-flash` | `GEMINI_API_KEY` |
| `"openai"` | `gpt-4o` | `OPENAI_API_KEY` |

Each provider uses its own native web-search tool — no external search API needed.

### 4. Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | From [console.anthropic.com](https://console.anthropic.com) — if using Claude |
| `GEMINI_API_KEY` | From [aistudio.google.com](https://aistudio.google.com) — if using Gemini |
| `OPENAI_API_KEY` | From [platform.openai.com](https://platform.openai.com) — if using OpenAI |
| `TELEGRAM_BOT_TOKEN` | Your bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Your Telegram chat/user ID (see below) |

#### How to get your Telegram Chat ID
1. Start a conversation with your bot
2. Send it any message
3. Open: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id": XXXXXXXXX}` — that's your chat ID

### 5. Set your schedule

Edit `.github/workflows/morning-digest.yml` and adjust the cron time:

```yaml
- cron: "45 2 * * *"   # 02:45 UTC — change to match your morning
```

Use [crontab.guru](https://crontab.guru) to build your schedule.

### 6. Push and test

```bash
git add .
git commit -m "Initial setup"
git push
```

Then go to **Actions → Morning Tech Digest → Run workflow** to trigger it manually and verify everything works before waiting for the scheduled run.

## Local development

```bash
npm install

# Set the key for your chosen provider:
export ANTHROPIC_API_KEY=your_key   # Claude
export GEMINI_API_KEY=your_key      # Gemini
export OPENAI_API_KEY=your_key      # OpenAI

export TELEGRAM_BOT_TOKEN=your_token
export TELEGRAM_CHAT_ID=your_chat_id

node agent.js
```

## Customization tips

- **More topics**: add entries to `topics.json`
- **Different language**: change `"language"` in `topics.json` (e.g. `"Portuguese"`, `"German"`)
- **More/fewer stories**: adjust `maxStoriesPerTopic`
- **Different schedule**: edit the cron expression in the workflow file
- **Switch provider**: change `provider` (and optionally `model`) in `topics.json` and ensure the matching API key secret is set
