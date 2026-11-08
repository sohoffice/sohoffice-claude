#!/usr/bin/env bash
# Deploys the global skills in skills/ to ~/.claude/skills, or checks the deployed copies for changes made there.
# Usage: skills.sh check            report changes made in ~/.claude/skills since the last deploy; exit 1 if any
#        skills.sh deploy [force]   copy skills/ over; stop on changes made there unless "force"
#        skills.sh hook             like check, but print a Claude Code hook message and always exit 0
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
src="$repo/skills"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
# One line per skill this repo deployed: "<name> <content hash>".
record="$dest/.sohoffice-claude-deployed"
# Skill folders Claude Code manages itself; never ours.
unmanaged=(synced)

hash() { (cd "$1" && find . -type f ! -name .DS_Store -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1); }
recorded() { [ -f "$record" ] && awk -v n="$1" '$1 == n { print $2 }' "$record"; }
repo_skills() { for dir in "$src"/*/; do basename "$dir"; done; }

# Problems made outside this repo, one per line: "edited <name>" (a deployed skill changed since its deploy, or,
# never deployed, differs from the repo), "deleted <name>" (a deployed skill is gone), "unknown <name>" (a skill
# folder this repo never deployed and does not hold).
problems() {
  local name target expected
  for name in $(repo_skills); do
    target="$dest/$name"
    expected=$(recorded "$name")
    if [ ! -d "$target" ]; then
      [ -z "$expected" ] || echo "deleted $name"
      continue
    fi
    [ -n "$expected" ] || expected=$(hash "$src/$name")
    [ "$(hash "$target")" = "$expected" ] || echo "edited $name"
  done
  [ -d "$dest" ] || return 0
  for target in "$dest"/*/; do
    [ -d "$target" ] || continue
    name=$(basename "$target")
    [ -d "$src/$name" ] && continue
    [ -n "$(recorded "$name")" ] && continue
    [[ " ${unmanaged[*]} " == *" $name "* ]] && continue
    echo "unknown $name"
  done
}

show() {
  local kind name
  while read -r kind name; do
    case $kind in
      edited) diff -ru -x .DS_Store "$src/$name" "$dest/$name" || true ;;
      deleted) echo "Only in $src: $name (deleted from $dest)" ;;
      unknown) echo "Only in $dest: $name (not in $src)" ;;
    esac
  done <<<"$1"
}

deploy() {
  local found name
  found=$(problems)
  if [ -n "$found" ] && [ "${1:-}" != force ]; then
    echo "Changed in $dest outside sohoffice-claude since the last deploy:" >&2
    show "$found" >&2
    echo "Bring the changes into $src and run again, or discard them with: just deploy-skills force" >&2
    exit 1
  fi
  mkdir -p "$dest"
  local new_record
  new_record=$(mktemp)
  for name in $(repo_skills); do
    # --delete removes files deleted from the skill in the repo.
    rsync -a --delete --exclude .DS_Store "$src/$name/" "$dest/$name/"
    echo "$name $(hash "$dest/$name")" >>"$new_record"
    echo "deployed $name"
  done
  # Remove skills this repo deployed before but no longer holds.
  if [ -f "$record" ]; then
    while read -r name _; do
      if [ -n "$name" ] && [ ! -d "$src/$name" ] && [ -d "$dest/$name" ]; then
        rm -rf "${dest:?}/$name"
        echo "removed $name"
      fi
    done <"$record"
  fi
  mv "$new_record" "$record"
  echo "Running sessions load skills at start: tell them to reread the changed SKILL.md files."
}

case "${1:-}" in
  check)
    found=$(problems)
    [ -z "$found" ] && { echo "~/.claude/skills matches the last deploy."; exit 0; }
    echo "Changed in $dest outside sohoffice-claude since the last deploy:"
    show "$found"
    exit 1
    ;;
  hook)
    found=$(problems 2>/dev/null || true)
    [ -z "$found" ] && exit 0
    list=$(echo "$found" | tr '\n' ',' | sed 's/,$//; s/,/, /g')
    msg="Global skills changed in $dest outside sohoffice-claude ($list). Bring the changes into $src, or run: just -f $repo/justfile check-skills"
    jq -n --arg m "$msg" '{systemMessage: $m}'
    ;;
  deploy) deploy "${2:-}" ;;
  *) echo "usage: skills.sh check | deploy [force] | hook" >&2; exit 2 ;;
esac
