#!/usr/bin/env bash
# Prints a GitHub installation token for the project's reviewer GitHub App, valid for one hour.
# Usage: GH_TOKEN=$(~/.claude/skills/pr-review/reviewer-gh-token.sh <owner>/<repo> <App config directory>) gh ...
# Reads the App ID and private key from the App config directory (app-id, private-key.pem), named in the project's instructions.
set -euo pipefail

repo=${1:?usage: reviewer-gh-token.sh <owner>/<repo> <App config directory>}
dir=${2:?usage: reviewer-gh-token.sh <owner>/<repo> <App config directory>}
app_id=$(tr -d '[:space:]' < "$dir/app-id")
key="$dir/private-key.pem"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

now=$(date +%s)
header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$app_id" | b64url)
signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -sign "$key" | b64url)
jwt="$header.$payload.$signature"

api() { curl -fsS -H "Authorization: Bearer $jwt" -H "Accept: application/vnd.github+json" "$@"; }

installation=$(api "https://api.github.com/repos/$repo/installation" | jq -r .id)
api -X POST "https://api.github.com/app/installations/$installation/access_tokens" | jq -r .token
