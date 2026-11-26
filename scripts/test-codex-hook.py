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
    "gh pr view 20\n\ngh pr merge 20", "gh pr view 20;\ngh pr merge 20", "gh pr view 20 &&\ngh pr merge 20",
    "gh pr view 20 # read first\ngh pr merge 20", "env -u GH_DEBUG bash -c 'gh pr merge 20'",
    "timeout 10 gh pr merge 20", "timeout -s KILL 10 gh pr merge 20",
    "gh pr view 20 # don't\ngh pr merge 20 # won't", "env -u gh bash -c 'gh pr merge 20'",
    "env -u bash bash -c 'gh pr merge 20'", "env -S 'gh pr merge 20'", "env FOO=1 gh pr merge 20",
    "bash -co pipefail 'gh pr merge 20'", "bash -oc pipefail 'gh pr merge 20'", "bash -c -- '-x; gh pr merge 20'", "nice -n 5 gh pr merge 20", "xargs -n 1 gh pr merge < f",
]
ALLOW = [
    "gh pr view 5", "gh pr comment 5 --body merge", "gh pr diff 20 --name-only",
    "gh pr comment 5 --body 'gh pr merge is denied; see pulls/16/merge and mergePullRequest'",
    "gh pr comment 5 --body 'line one\ngh pr merge 5\nline three'",
    "reviewer-gh.sh o/r d api repos/o/r/pulls/16/reviews -X POST -f 'body=The mergePullRequest mutation needs review.'",
    "bash -c 'gh pr comment 20 --body \"$1\"' _ 'gh pr merge 20'", "bash script.sh 'gh pr merge 20'",
    "gh pr comment 20 --body 'see #3; gh pr merge is denied'", "gh pr view 20 # gh pr merge 20 later",
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
