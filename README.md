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
