# Tech News Digest 🗞

A GitHub Actions agent that searches the web for tech news on your chosen topics every morning and sends a formatted summary to your Telegram.

## How it works

1. GitHub Actions triggers the script on a cron schedule
2. `agent.js` calls the Claude API with the built-in `web_search` tool
3. Claude searches for the last 24h of news per topic and writes a summary with links
4. The digest is sent to your Telegram chat via your bot

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
  "maxStoriesPerTopic": 5
}
```

### 3. Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com) |
| `TELEGRAM_BOT_TOKEN` | Your bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Your Telegram chat/user ID (see below) |

#### How to get your Telegram Chat ID
1. Start a conversation with your bot
2. Send it any message
3. Open: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id": XXXXXXXXX}` — that's your chat ID

### 4. Set your timezone

Edit `.github/workflows/morning-digest.yml` and adjust the cron time:

```yaml
- cron: "0 7 * * *"   # 07:00 UTC — change to match your morning
```

Use [crontab.guru](https://crontab.guru) to build your schedule.

### 5. Push and test

```bash
git add .
git commit -m "Initial setup"
git push
```

Then go to **Actions → Morning Tech Digest → Run workflow** to trigger it manually and verify everything works before waiting for the scheduled run.

## Local development

```bash
npm install

export ANTHROPIC_API_KEY=your_key
export TELEGRAM_BOT_TOKEN=your_token
export TELEGRAM_CHAT_ID=your_chat_id

node agent.js
```

## Customization tips

- **More topics**: just add entries to `topics.json`
- **Different language**: change `"language"` in `topics.json` (e.g. `"Portuguese"`, `"German"`)
- **More/fewer stories**: adjust `maxStoriesPerTopic`
- **Different schedule**: edit the cron expression in the workflow file
