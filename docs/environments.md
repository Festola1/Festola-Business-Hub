# Festola Business Hub — Environment Separation & Secrets Policy

Festola maintains three strictly isolated environments: **Development**, **Staging**, and **Production** (`System Architecture §11`, `NFR-06`).

## Environment Matrix

| Property         | Development                | Staging                   | Production                                   |
| ---------------- | -------------------------- | ------------------------- | -------------------------------------------- |
| Git Branch       | `feat/*` -> `develop`      | `staging`                 | `main` (tagged releases)                     |
| Env Template     | `.env.development.example` | `.env.staging.example`    | `.env.production.example`                    |
| Supabase Project | Dedicated Dev Project      | Dedicated Staging Project | Dedicated Production Project                 |
| Database         | Dev PostgreSQL             | Staging PostgreSQL        | Production PostgreSQL (PITR + Daily Backups) |
| Storage Buckets  | Dev Private Buckets        | Staging Private Buckets   | Prod Private Buckets                         |
| Payment Keys     | Test / Sandbox Only        | Test / Sandbox Only       | Live Keys (Secret Manager Only)              |

## Non-Negotiable Secret Rules

1. **Client Bundle Isolation**: Only variables prefixed with `VITE_` (`VITE_APP_ENV`, `VITE_APP_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) may ever enter the browser bundle.
2. **Server-Only Secrets**: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `FLUTTERWAVE_SECRET_KEY`, and `FLUTTERWAVE_WEBHOOK_SECRET` MUST live exclusively in server-side secret stores and are verified absent from `dist/` via `npm run verify:secrets`.
3. **Never Commit `.env` Files**: `.gitignore` blocks `.env`, `.env.local`, and `.env.*.local` while preserving `*.example` templates.
