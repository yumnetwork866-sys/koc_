# manage-team

## Run with pnpm

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` runs both backend and frontend in parallel from the repo root.
`pnpm start` does the same with the packages' `start` scripts.

This project is structured for multi-platform content performance reporting.

## TikTok OAuth

The backend handles TikTok OAuth entirely server-side. Configure `backend/.env` with:

```bash
FRONTEND_URL=http://localhost:5173
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://localhost:5000/api/channels/oauth/tiktok/callback
TIKTOK_SCOPES=user.info.basic
```

After TikTok redirects back, the backend exchanges the code, stores/updates the channel, and sends the browser to the frontend channels page with a status message.

## Database check

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
