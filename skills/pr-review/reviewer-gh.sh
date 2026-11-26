#!/usr/bin/env bash
# Runs gh as the project's reviewer GitHub App, with a fresh installation token.
# Usage: ~/.claude/skills/pr-review/reviewer-gh.sh <owner>/<repo> <App config directory> <gh arguments...>
# One command a reviewer's permission rules can allow, in place of GH_TOKEN=$(reviewer-gh-token.sh ...) gh ...
# Stops if no token is minted: gh with an empty GH_TOKEN would post with the human's own login.
# Refuses to merge, whichever tool runs it (#15): a reviewer never merges, and the author session never runs this script.
set -euo pipefail

repo=${1:?usage: reviewer-gh.sh <owner>/<repo> <App config directory> <gh arguments...>}
dir=${2:?usage: reviewer-gh.sh <owner>/<repo> <App config directory> <gh arguments...>}
shift 2
prev=
for arg in "$@"; do
  if [[ ($prev == pr && $arg == merge) || $arg =~ pulls/[0-9]+/merge || $arg == *mergePullRequest* ]]; then
    echo "reviewer-gh.sh: a reviewer never merges a pull request" >&2
    exit 1
  fi
  prev=$arg
done
token=$("$(dirname "$0")/reviewer-gh-token.sh" "$repo" "$dir")
[[ -n $token && $token != null ]] || { echo "reviewer-gh.sh: could not mint a token for $repo" >&2; exit 1; }
GH_TOKEN=$token exec gh "$@"
