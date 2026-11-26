#!/usr/bin/env bash
# Runs one review round with the first reviewer in reviewers.json that can run it, in the file's order.
# Usage: ~/.claude/skills/pr-review/run-review.sh <prompt file> <output file> [effort]
# Run it from the repository root. The effort defaults to reviewers.json's; PR_REVIEW_REVIEWERS names another file.
# Prints "reviewer: <tool> <model> <effort>" for the reviewer that ran the round.
# Exit 0: a reviewer ran the round. 2: it started but failed. 3: no reviewer could run it; the reasons follow.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
config=${PR_REVIEW_REVIEWERS:-$here/reviewers.json}
prompt=${1:?usage: run-review.sh <prompt file> <output file> [effort]}
out=${2:?usage: run-review.sh <prompt file> <output file> [effort]}
effort=${3:-$(jq -r '.effort' "$config")}
logs=${out%.md}

# Each reviewer may read, run gh and read-only git, post as the App and reply in Slack; none may write files or merge.
# The skill's scripts are named as the permission rules spell them, with a literal ~.
claude_allow=("Bash(gh *)" "Bash(git diff *)" "Bash(git log *)" "Bash(git show *)" "Bash(git merge-base *)"
  "Bash(git rev-parse *)" "Bash(git cat-file *)" "Bash(jq *)" "Bash(cat *)" "Bash(~/.claude/skills/pr-review/*)"
  Read Grep Glob)
claude_deny=("Bash(gh pr merge *)" "Bash(gh * pr merge *)" "Bash(~/.claude/skills/pr-review/reviewer-gh.sh * pr merge *)")
agy_settings='{"permissions":{
  "allow":["command(gh)","command(git diff)","command(git log)","command(git show)","command(git merge-base)",
    "command(git rev-parse)","command(git cat-file)","command(jq)","command(~/.claude/skills/pr-review/reviewer-gh.sh)",
    "command(~/.claude/skills/pr-review/slack-post.sh)","read_file(*)"],
  "deny":["command(gh pr merge)","command(~/.claude/skills/pr-review/reviewer-gh.sh .* .* pr merge)","write_file(*)"]}}'

run_codex() {
  codex exec -m "$1" -c model_reasoning_effort="\"$2\"" --approve-for-me \
    -c sandbox_workspace_write.network_access=true -o "$out" - < "$prompt" > "$logs.codex.log" 2>&1
}
run_claude() {
  claude -p --model "$1" --effort "$2" --setting-sources user --allowedTools "${claude_allow[@]}" \
    --disallowedTools "${claude_deny[@]}" --output-format text < "$prompt" > "$out" 2> "$logs.claude.log"
}
run_agy() {
  agy --model "$1-$2" --output-format text --settings "$agy_settings" -p="$(cat "$prompt")" > "$out" 2> "$logs.agy.log"
}

# The line that says a reviewer cannot run the round: a usage limit, or not signed in. Codex logs the review too,
# so only its own ERROR lines count; Claude and agy are checked only when they fail or print nothing.
unavailable() {
  case $1 in
    codex) grep -m1 -E '^ERROR: .*(usage limit|log ?in|sign(ed)? in)' "$logs.codex.log" ;;
    claude) grep -h -m1 -i -E 'usage limit|limit reached|hit your limit|/login|not logged in|invalid api key' "$out" "$logs.claude.log" ;;
    agy) grep -h -m1 -i -E 'exhausted your quota|quota|sign in|log ?in|unauthenticated' "$out" "$logs.agy.log" ;;
  esac
}

reasons=()
count=$(jq '.reviewers | length' "$config")
for ((i = 0; i < count; i++)); do
  tool=$(jq -r ".reviewers[$i].tool" "$config")
  model=$(jq -r ".reviewers[$i].model" "$config")
  level=$effort
  # A model with a fixed set of efforts takes the highest it has when the one asked for is not among them.
  if jq -e ".reviewers[$i].efforts" "$config" > /dev/null && ! jq -e --arg e "$level" ".reviewers[$i].efforts | index(\$e)" "$config" > /dev/null; then
    level=$(jq -r ".reviewers[$i].efforts[-1]" "$config")
  fi
  if ! command -v "$tool" > /dev/null; then reasons+=("$tool: not installed"); continue; fi
  rm -f "$out"
  "run_$tool" "$model" "$level"; rc=$?
  if [[ $tool == codex || $rc -ne 0 || ! -s $out ]] && line=$(unavailable "$tool"); then
    reasons+=("$tool: $line"); continue
  fi
  if [[ $rc -ne 0 || ! -s $out ]]; then
    echo "reviewer: $tool $model $level failed (exit $rc); see $logs.$tool.log"; exit 2
  fi
  echo "reviewer: $tool $model $level"; exit 0
done
echo "no reviewer could run the round:"; printf '  %s\n' "${reasons[@]}"; exit 3
