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
    npm run db:migrate                            # applies everything in migrations/, in order
    npx wrangler secret put BOT_TOKEN
    npx wrangler secret put WEBHOOK_SECRET
    npx wrangler deploy
    .\set-webhook.ps1 -BotToken "<TOKEN>" -WorkerUrl "https://<worker>.workers.dev" -Secret "<WEBHOOK_SECRET>"

Then send /start to the bot in a private chat to get the Console button.

## Database migrations
Schema lives in `migrations/`, as numbered, one-way SQL files (Wrangler's native D1 migrations —
`wrangler.toml` points at this folder via `migrations_dir`). Wrangler tracks which files have
already run in a `d1_migrations` table inside the database itself, so re-running is always safe:
already-applied files are skipped automatically.

- Apply to the live (remote) database:  `npm run db:migrate`
- Apply to a local dev database:        `npm run db:migrate:local`

To add a new table or column later, add a new file `migrations/0003_whatever.sql` (next number,
short name) and run `npm run db:migrate` again — don't edit old migration files once they've been
applied anywhere.

`db-legacy/` holds the old hand-run `schema.sql` / `cleanup.sql` from before this project used
Wrangler migrations. They're kept only for reference and are not used by anything anymore.

## Auto-deploy from GitHub
This repo is connected to **Cloudflare Workers Builds** (set up from the Worker's dashboard →
Settings → Builds → Connect to a repository). Every push to `main` triggers a build and
`npx wrangler deploy` automatically — no GitHub Actions file needed.

Secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`) are configured as build environment variables in that
same Cloudflare setup screen (marked Encrypt), not committed to this repo.

Database migrations are **not** applied automatically on deploy — run `npm run db:migrate`
yourself after pulling a change that adds a new migration file, since schema changes shouldn't
run unattended on every push.

## Updating an existing deployment
After pulling new migration files, apply them once:

    npm run db:migrate

### Notes on Close DM
Deleting a business message requires the delete-messages permission on the Telegram Business connection
(ask the user in Telegram → Settings → Business → Chatbots to enable it), and only works within Telegram's
normal 48-hour delete window. If it isn't enabled, the bot notifies you (rate-limited to once/minute)
instead of failing silently.

## Commands
Private chat: /start, /status      Group: /setgr
