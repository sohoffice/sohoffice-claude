#!/usr/bin/env bash
# Runs gh as the project's reviewer GitHub App, with a fresh installation token.
# Usage: ~/.claude/skills/pr-review/reviewer-gh.sh <owner>/<repo> <App config directory> <gh arguments...>
# One command a reviewer's permission rules can allow, in place of GH_TOKEN=$(reviewer-gh-token.sh ...) gh ...
set -euo pipefail

repo=${1:?usage: reviewer-gh.sh <owner>/<repo> <App config directory> <gh arguments...>}
dir=${2:?usage: reviewer-gh.sh <owner>/<repo> <App config directory> <gh arguments...>}
shift 2
GH_TOKEN=$("$(dirname "$0")/reviewer-gh-token.sh" "$repo" "$dir") exec gh "$@"
