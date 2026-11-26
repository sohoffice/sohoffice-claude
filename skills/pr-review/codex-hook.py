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

PUNCTUATION = ";&|()\n"
WRAPPERS = {"env", "command", "exec", "nohup", "time", "xargs", "nice", "timeout"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
SHELL_OPTIONS_WITH_VALUE = {"-o", "+o", "-O", "+O", "--rcfile", "--init-file"}
MERGE_ENDPOINT = re.compile(r"(?:https?://[^/\s]+)?/?(?:api/v3/)?repos/[^/\s]+/[^/\s]+/pulls/\d+/merge/?(?:\?.*)?")
MERGE_QUERY = re.compile(r"(?:-[fF]|--(?:raw-)?field=)?query=.*mergePullRequest", re.S)


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": f"pr-review: {reason}"}}))
    sys.exit(0)


def shell_script(words):
    """The -c script of a shell's arguments, or None when it runs a script file or reads stdin."""
    has_c, skip = False, False
    for w in words:
        if skip:
            skip = False
        elif w in SHELL_OPTIONS_WITH_VALUE:
            skip = True
        elif w.startswith("--"):
            continue
        elif w[:1] in "-+" and len(w) > 1:
            has_c = has_c or (w[0] == "-" and "c" in w[1:])
        else:
            return w if has_c else None
    return None


def merges(words):
    """Whether one simple command, as words, merges a pull request."""
    while words and re.fullmatch(r"[A-Za-z_]\w*=.*", words[0]):  # VAR=value before the command
        words = words[1:]
    if not words:
        return False
    # A wrapper such as env, timeout or xargs runs the command after its options and their values.
    if words[0].rsplit("/", 1)[-1] in WRAPPERS:
        commands = [i for i, w in enumerate(words) if w.rsplit("/", 1)[-1] in SHELLS | {"gh", "reviewer-gh.sh"}]
        return bool(commands) and merges(words[commands[0]:])
    tool = words[0].rsplit("/", 1)[-1]
    if tool in SHELLS:
        script = shell_script(words[1:])
        return script is not None and command_merges(script)
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
        return any(MERGE_ENDPOINT.fullmatch(w) or MERGE_QUERY.match(w) for w in words)
    return False


def command_merges(command):
    """Whether a shell command line merges a pull request in any of its simple commands."""
    try:
        # An unquoted newline ends a command, as ; does; a quoted one stays in its word.
        # An unquoted newline ends a command, as ; does; a quoted one stays in its word. A comment is kept as
        # words of its command, since shlex's comment handling would swallow the newline that ends it.
        lexer = shlex.shlex(command, posix=True, punctuation_chars=PUNCTUATION)
        lexer.whitespace = " \t\r"
        lexer.commenters = ""
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return "merge" in command
    words = []
    for token in tokens + [";"]:
        if set(token) <= set(PUNCTUATION):  # a run such as ";\n" or "&&\n" separates commands
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
