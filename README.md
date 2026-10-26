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

## Auto-deploy from GitHub
This repo is connected to **Cloudflare Workers Builds** (set up from the Worker's dashboard →
Settings → Builds → Connect to a repository). Every push to `main` triggers a build and
`npx wrangler deploy` automatically — no GitHub Actions file needed.

Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) are configured as build environment variables in that
same Cloudflare setup screen (marked Encrypt), not committed to this repo.

Database schema changes (`schema.sql`) are **not** applied automatically on deploy — run those
manually with `wrangler d1 execute` as shown below, since they can be destructive and shouldn't
run unattended on every push.

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
