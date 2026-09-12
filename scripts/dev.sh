#!/usr/bin/env bash

set -u

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIRECTORY="$(cd "$SCRIPT_DIRECTORY/.." && pwd)"
NPM_BIN="${DEV_NPM_BIN:-npm}"

cd "$PROJECT_DIRECTORY"

if [[ ! -f server/.env ]]; then
  echo "server/.env가 없습니다. 'cp server/.env.example server/.env' 후 환경변수를 설정해 주세요." >&2
  exit 1
fi

server_pid=''
frontend_pid=''

cleanup() {
  trap - EXIT INT TERM
  for pid in "$server_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$server_pid" "$frontend_pid"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

echo "백엔드: http://127.0.0.1:3001"
"$NPM_BIN" --prefix server run dev &
server_pid=$!

echo "프론트: http://localhost:5173"
echo "관리자: http://localhost:5173/admin/"
"$NPM_BIN" run dev -- --host localhost --port 5173 --strictPort &
frontend_pid=$!

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done

status=0
if ! kill -0 "$server_pid" 2>/dev/null; then
  wait "$server_pid" || status=$?
else
  wait "$frontend_pid" || status=$?
fi

exit "$status"
