#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${PUBLIC_BACKEND_URL:-}" || -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "Missing TELEGRAM_BOT_TOKEN, PUBLIC_BACKEND_URL, or TELEGRAM_WEBHOOK_SECRET"
  exit 1
fi

WEBHOOK_URL="${PUBLIC_BACKEND_URL}/api/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}"

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"${WEBHOOK_URL}\"}" | jq .
