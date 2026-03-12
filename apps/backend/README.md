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
- Gemini calls use Google Vertex AI (`VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_MODEL`, `VERTEX_SERVICE_ACCOUNT_JSON_B64`).
- Optional: set `INSTAGRAM_COOKIES_B64` (base64 Netscape cookie file) for Instagram reels that require login.
