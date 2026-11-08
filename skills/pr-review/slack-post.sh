#!/bin/bash
# Posts stdin to Slack as the sohoffice bot and prints the message ts.
# Usage: slack-post.sh <channel id> [thread ts] < message.md
set -euo pipefail

token=$(security find-generic-password -s slack-sohoffice-bot -w)

jq -n --arg channel "$1" --arg thread_ts "${2:-}" --rawfile text /dev/stdin \
  '{channel: $channel, markdown_text: $text} + (if $thread_ts != "" then {thread_ts: $thread_ts} else {} end)' |
  curl -sS https://slack.com/api/chat.postMessage \
    -K <(printf 'header = "Authorization: Bearer %s"\n' "$token") \
    -H 'Content-Type: application/json; charset=utf-8' \
    -d @- |
  jq -er 'if .ok then .ts else error(.error) end'
