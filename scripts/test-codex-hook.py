#!/usr/bin/env python3
"""Checks skills/pr-review/codex-hook.py on commands it must deny or allow. Usage: scripts/test-codex-hook.py"""
import json
import pathlib
import subprocess
import sys

hook = pathlib.Path(__file__).resolve().parent.parent / "skills/pr-review/codex-hook.py"
DENY = [
    "gh pr merge 5", "gh pr --repo o/r merge 5", "gh -R o/r pr merge 5", "cd x && gh pr merge 5 --squash",
    "GH_TOKEN=x gh pr merge 5", "/usr/local/bin/gh pr merge 5", "env -i gh pr merge 5", "xargs gh pr merge < f",
    "~/.claude/skills/pr-review/reviewer-gh.sh o/r ~/.config/x pr merge 5",
    "reviewer-gh.sh o/r d -R o/r pr --repo o/r merge 1",
    "gh pr view 20\ngh pr merge 20", "gh pr view 20\nreviewer-gh.sh o/r d pr merge 20",
    "bash -lc 'gh pr merge 5'", "bash -l -c 'gh pr merge 20'", "sh -e -c 'gh pr merge 20'",
    "bash -o pipefail -c 'gh pr merge 20'", 'zsh -c "cd x; gh pr --repo o/r merge 1"',
    "gh api -X PUT repos/o/r/pulls/5/merge", "gh api -X PUT /repos/o/r/pulls/5/merge",
    "gh api -X PUT https://api.github.com/repos/o/r/pulls/20/merge",
    "reviewer-gh.sh o/r d api -X PUT https://api.github.com/repos/o/r/pulls/20/merge?x=1",
    "gh api graphql -f query='mutation{mergePullRequest(input:{}){clientMutationId}}'",
    "gh api graphql --raw-field=query='mutation { mergePullRequest(input:{}) { clientMutationId } }'",
    "gh api graphql -fquery='mutation{mergePullRequest(input:{}){clientMutationId}}'",
    "gh api graphql -F 'query=mutation {\n mergePullRequest(input:{}) { clientMutationId }\n}'",
    "echo 'unbalanced merge",
]
ALLOW = [
    "gh pr view 5", "gh pr comment 5 --body merge", "gh pr diff 20 --name-only",
    "gh pr comment 5 --body 'gh pr merge is denied; see pulls/16/merge and mergePullRequest'",
    "gh pr comment 5 --body 'line one\ngh pr merge 5\nline three'",
    "reviewer-gh.sh o/r d api repos/o/r/pulls/16/reviews -X POST -f 'body=The mergePullRequest mutation needs review.'",
    "git log --merges a..b", "git diff a b -- x", "bash -lc 'gh pr view 5'", "jq -r .x f | head",
]


def denied(tool, command):
    event = json.dumps({"tool_name": tool, "tool_input": {"command": command}})
    out = subprocess.run([sys.executable, str(hook)], input=event, capture_output=True, text=True, check=True).stdout
    return '"deny"' in out


failures = [f"not denied: {c!r}" for c in DENY if not denied("Bash", c)]
failures += [f"denied: {c!r}" for c in ALLOW if denied("Bash", c)]
if not denied("apply_patch", "*** Begin Patch"):
    failures.append("apply_patch not denied")
print("\n".join(failures) or f"ok: {len(DENY) + 1} denied, {len(ALLOW)} allowed")
sys.exit(1 if failures else 0)
