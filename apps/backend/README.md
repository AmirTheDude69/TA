# Backend

Express + Telegraf webhook backend for Travel AI Agent.

## Endpoints

- `POST /api/telegram/webhook/:secret`
- `GET /api/health`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs`
- `POST /api/jobs/:id/retry`
- `GET /api/users`

## Run

```bash
npm run dev -w apps/backend
```

## Notes

- Requires `yt-dlp` and `ffmpeg` available in PATH.
- Worker polls queued jobs and processes them asynchronously.
