#!/bin/bash
# Uploads a file to a Slack thread as the sohoffice bot and prints the file ID.
# Usage: slack-upload.sh <channel id> <thread ts> <file> [comment]
set -euo pipefail

channel=$1
thread_ts=$2
file=$3
comment=${4:-}
name=$(basename "$file")
size=$(wc -c < "$file" | tr -d ' ')

token=$(security find-generic-password -s slack-sohoffice-bot -w)
auth() { printf 'header = "Authorization: Bearer %s"\n' "$token"; }

upload=$(curl -sS https://slack.com/api/files.getUploadURLExternal -K <(auth) \
  --data-urlencode "filename=$name" --data-urlencode "length=$size" |
  jq -er 'if .ok then . else error(.error) end')
url=$(jq -r .upload_url <<<"$upload")
id=$(jq -r .file_id <<<"$upload")

curl -sS --fail -o /dev/null -X POST "$url" -F "file=@$file"

jq -n --arg id "$id" --arg name "$name" --arg channel "$channel" --arg thread_ts "$thread_ts" --arg comment "$comment" \
  '{files: [{id: $id, title: $name}], channel_id: $channel, thread_ts: $thread_ts} + (if $comment != "" then {initial_comment: $comment} else {} end)' |
  curl -sS https://slack.com/api/files.completeUploadExternal -K <(auth) \
    -H 'Content-Type: application/json; charset=utf-8' -d @- |
  jq -er 'if .ok then .files[0].id else error(.error) end'
