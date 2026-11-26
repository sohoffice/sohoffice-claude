#!/usr/bin/env python3
"""PreToolUse hook run-review.sh gives the Codex reviewer for its run alone (#19).

Denies file edits through apply_patch, and any command that merges a pull request: `gh ... pr ... merge`, the same
through reviewer-gh.sh, `gh api` on a pulls/<n>/merge endpoint, and a GraphQL mergePullRequest query given inline.
A query read from a file or stdin is not seen, nor a command built at run time, such as through eval. Words are split as the shell splits them, so a quoted review body
that mentions a merge is not a merge.
"""
import json
import re
import shlex
import sys

SEPARATORS = {";", "&&", "||", "|", "&", "(", ")"}


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": f"pr-review: {reason}"}}))
    sys.exit(0)


def merges(words):
    """Whether one simple command, as words, merges a pull request."""
    while words and re.fullmatch(r"[A-Za-z_]\w*=.*", words[0]):  # VAR=value before the command
        words = words[1:]
    if not words:
        return False
    tool = words[0].rsplit("/", 1)[-1]
    if tool in ("sh", "bash", "zsh") and len(words) > 2 and re.fullmatch(r"-\w*c\w*", words[1]):
        return command_merges(words[2])
    if tool == "reviewer-gh.sh":
        words = words[3:]
    elif tool == "gh":
        words = words[1:]
    else:
        return False
    # gh's only flag that takes a value before a pr subcommand is the repository.
    plain, skip = [], False
    for w in words:
        if skip:
            skip = False
        elif w in ("-R", "--repo"):
            skip = True
        elif not w.startswith("-"):
            plain.append(w)
    if plain[:2] == ["pr", "merge"]:
        return True
    if plain[:1] == ["api"]:
        if any(re.fullmatch(r"/?repos/[^/=\s]+/[^/=\s]+/pulls/\d+/merge/?", w) for w in words):
            return True
        if any(re.match(r"query=", w) and "mergePullRequest" in w for w in words):
            return True
    return False


def command_merges(command):
    """Whether a shell command line merges a pull request in any of its simple commands."""
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()")
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return "merge" in command
    words = []
    for token in tokens + [";"]:
        if token in SEPARATORS:
            if merges(words):
                return True
            words = []
        else:
            words.append(token)
    return False


def main():
    event = json.load(sys.stdin)
    if event.get("tool_name") == "apply_patch":
        deny("a reviewer does not edit files")
    command = (event.get("tool_input") or {}).get("command")
    if isinstance(command, list):
        command = shlex.join(command)
    if isinstance(command, str) and command_merges(command):
        deny("a reviewer never merges a pull request")


main()
