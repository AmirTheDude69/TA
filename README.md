# Travel AI Agent (URL Drop Mode)

Monorepo for Telegram-first travel itinerary generation from TikTok/Instagram Reels/Douyin URLs.

## Workspace Layout

- `apps/backend`: Express API + Telegraf webhook + async processing worker
- `apps/dashboard`: Next.js admin dashboard
- `packages/shared`: shared contracts, schemas, and formatters
- `database/migrations`: SQL migrations for Supabase

## Quick Start

1. Copy envs:
   - `cp .env.example .env`
2. Install dependencies:
   - `npm install`
3. Build shared package:
   - `npm run build -w packages/shared`
4. Start backend + dashboard:
   - `npm run dev`

## Required External Binaries

- `yt-dlp`
- `ffmpeg`

## Database

Apply `database/migrations/001_initial.sql` in Supabase SQL editor.

## Deploy

- Backend: Railway (production)
- Dashboard: Vercel (production)

Detailed app runbooks are in each app README.
