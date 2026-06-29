# manage-team

## Run with pnpm

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` runs both backend and frontend in parallel from the repo root.
`pnpm start` does the same with the packages' `start` scripts.
`pnpm build` builds the frontend bundle.

This project is structured for multi-platform content performance reporting.

## TikTok OAuth

The backend handles TikTok OAuth entirely server-side. Configure `backend/.env` with:

```bash
PORT=8000
FRONTEND_URL=http://localhost:3005
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://localhost:8000/api/channels/oauth/tiktok/callback
TIKTOK_SCOPES=user.info.basic
```

Before deploying, set `TIKTOK_TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET` to separate, unique secrets of at least 32 characters. Set `VITE_PRIVACY_CONTACT_EMAIL` in the frontend environment to the monitored address used for privacy and deletion requests.

After TikTok redirects back, the backend exchanges the code, stores/updates the channel, and sends the browser to the frontend channels page with a status message.

### TikTok sandbox login errors

If TikTok shows `non_sandbox_target`, the current TikTok app is still using a sandbox configuration and the TikTok account trying to authorize has not been added as a sandbox target user. In TikTok for Developers, open the same app that owns `TIKTOK_CLIENT_KEY`, switch to Sandbox, add the TikTok account under Sandbox settings > Target users, authorize it for Login Kit, then apply changes. TikTok says target users can take up to an hour to appear after refresh.

Also verify that the Login Kit redirect URI in the TikTok app exactly matches `TIKTOK_REDIRECT_URI`, including protocol, domain, path, and trailing slash. For the current local tunnel, that value should be the ngrok HTTPS callback URL exposed by the backend, not `localhost`.

## Daily TikTok sync

The scheduler worker uses `TIKTOK_SYNC_SCHEDULE` (a five-field cron expression) and `TIKTOK_SYNC_TIMEZONE` from `backend/.env`. It refreshes OAuth access tokens as needed, processes up to `TIKTOK_SYNC_CONCURRENCY` channels in parallel, and uses a PostgreSQL advisory lock so overlapping job runs do not sync the same channel concurrently.

```bash
cd backend
TIKTOK_SYNC_SCHEDULE="0 2 * * *"
TIKTOK_SYNC_TIMEZONE=Asia/Ho_Chi_Minh
pnpm run sync:tiktok:scheduler
```

Run this as exactly one dedicated worker process (for example through systemd, PM2, or a container worker). To run a sync once without the scheduler:

```bash
pnpm run sync:tiktok
```

## Database check

The backend never changes the schema while starting. Apply versioned migrations explicitly; `db:migrate` and `db:rollback` create a PostgreSQL custom-format backup in `backend/backups/` first (override with `DB_BACKUP_DIR`).

```bash
cd backend
pnpm run db:migrate
pnpm run db:rollback
pnpm run db:backup
```

Use `-- --no-backup` only when a backup is handled by deployment infrastructure.

Use the backend DB connection to verify the target database before running migrations:

```bash
cd backend
pnpm run db:check
```

If you use `psql` manually, connect to the `report` database, not `postgres`:

```bash
psql "$DATABASE_URL"
```

Inside `psql`, confirm:

```sql
SELECT current_database(), current_user;
```

If you are already inside `psql` and see `postgres=#`, switch to the right database first:

```sql
\c report
```
