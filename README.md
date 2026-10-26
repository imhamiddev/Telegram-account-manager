# Business Backup Bot (Cloudflare Worker + D1 + Mini App)

Private bot: everything works only for OWNER_ID (see wrangler.toml).
No message content is stored. Messages are forwarded straight to the group.
The database holds only settings, connections, topic ids and chat names.

## Features
- Forwards every incoming message of your Telegram Business account to a group (/setgr)
- Edited messages (new text) and deleted-message notices
- Optional: one forum topic per sender
- Optional: "Close DM" — instantly deletes every incoming private message for both sides
- Optional: auto-reply to an exact keyword (configured in the Mini App, under Settings)
- Mini App (shadcn/ui design): overview, chats on/off (paginated/lazy-loaded), account, settings
- Light/dark theme (manual override or follow system) and a selectable accent color

## Setup (PowerShell)
    npm install
    npx wrangler login
    npx wrangler d1 create business_bot          # put database_id in wrangler.toml (skip if you already have it)
    npx wrangler d1 execute business_bot --remote --file=schema.sql
    npx wrangler d1 execute business_bot --remote --file=cleanup.sql   # only if you used the previous archive version
    npx wrangler secret put BOT_TOKEN
    npx wrangler secret put WEBHOOK_SECRET
    npx wrangler deploy
    .\set-webhook.ps1 -BotToken "<TOKEN>" -WorkerUrl "https://<worker>.workers.dev" -Secret "<WEBHOOK_SECRET>"

Then send /start to the bot in a private chat to get the Console button.

## Auto-deploy from GitHub (CI/CD)
Every push to `main` deploys automatically via `.github/workflows/deploy.yml`.

One-time setup:
1. Create a Cloudflare API token: Cloudflare dashboard → My Profile → API Tokens → **Create Token** →
   use the **"Edit Cloudflare Workers"** template (or a custom token with `Workers Scripts: Edit`,
   `Workers KV/D1: Edit` if you also want schema changes automated, `Account Settings: Read`).
2. In the GitHub repo: Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: the token from step 1
3. If your Cloudflare account ID isn't picked up automatically, also add a secret
   `CLOUDFLARE_ACCOUNT_ID` and uncomment the `accountId` line in the workflow file.
4. Push to `main` — the Action installs dependencies and runs `wrangler deploy`.

This only deploys the Worker code. Database schema changes (`schema.sql`) are not applied
automatically — run those manually with `wrangler d1 execute` as shown above, since they can be
destructive and shouldn't run unattended on every push. Secrets like `BOT_TOKEN` and
`WEBHOOK_SECRET` are set once via `wrangler secret put` and are not touched by deploys.

## Updating an existing deployment
Re-run the schema (safe — it only adds the new `autoreplies` table, nothing is dropped):

    npx wrangler d1 execute business_bot --remote --file=schema.sql

### Notes on Close DM
Deleting a business message requires the delete-messages permission on the Telegram Business connection
(ask the user in Telegram → Settings → Business → Chatbots to enable it), and only works within Telegram's
normal 48-hour delete window. If it isn't enabled, the bot notifies you (rate-limited to once/minute)
instead of failing silently.

## Commands
Private chat: /start, /status      Group: /setgr
