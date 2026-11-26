#!/usr/bin/env python3
"""PreToolUse hook run-review.sh gives the Codex reviewer for its run alone (#19).

Denies file edits through apply_patch, and any command that merges a pull request: `gh ... pr ... merge`, the same
through reviewer-gh.sh, `gh api` on a pulls/<n>/merge endpoint, and a GraphQL mergePullRequest query. Words are split
as the shell splits them, so a quoted review body that mentions a merge is not a merge.
"""
import json
import re
import shlex
import sys

PUNCTUATION = ";&|()\n"
# Each wrapper's options that take a value, and the operands it reads before the command it runs.
WRAPPERS = {
    "env": ({"-u", "--unset", "-C", "--chdir", "-P", "-S", "--split-string"}, 0),
    "timeout": ({"-s", "--signal", "-k", "--kill-after"}, 1),
    "nice": ({"-n", "--adjustment"}, 0),
    "xargs": ({"-n", "-I", "-L", "-P", "-s", "-d", "-E", "-a", "--max-args", "--replace", "--max-lines",
               "--max-procs", "--max-chars", "--delimiter", "--eof", "--arg-file"}, 0),
    "exec": ({"-a"}, 0),
    "time": ({"-f", "-o", "--format", "--output"}, 0),
    "command": (set(), 0),
    "nohup": (set(), 0),
}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
SHELL_LONG_OPTIONS_WITH_VALUE = {"--rcfile", "--init-file"}
MERGE_ENDPOINT = re.compile(r"(?:https?://[^/\s]+)?/?(?:api/v3/)?repos/[^/\s]+/[^/\s]+/pulls/\d+/merge/?(?:\?.*)?")
MERGE_QUERY = re.compile(r"(?:-[fF]|--(?:raw-)?field=)?query=.*mergePullRequest", re.S)


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": f"pr-review: {reason}"}}))
    sys.exit(0)


def shell_script(words):
    """The -c script of a shell's arguments, or None when it runs a script file or reads stdin."""
    has_c, values, ended = False, 0, False
    for w in words:
        if values:
            values -= 1
        elif ended or w[:1] not in "-+" or len(w) == 1:
            return w if has_c else None
        elif w == "--":
            ended = True
        elif w.startswith("--"):
            values = 1 if w in SHELL_LONG_OPTIONS_WITH_VALUE else 0
        else:
            # A cluster such as -lc or -co: c marks a -c script; each o or O takes the next word as its value.
            has_c = has_c or (w[0] == "-" and "c" in w[1:])
            values = sum(w[1:].count(x) for x in "oO")
    return None


def wrapped(tool, words):
    """The command a wrapper runs: its words, a command line given to env -S, or None when there is none."""
    valued, operands = WRAPPERS[tool]
    for i, w in enumerate(words):
        if tool == "env" and w.startswith(("-S", "--split-string")):
            value = words[i + 1] if w in ("-S", "--split-string") and i + 1 < len(words) else w.split("=", 1)[-1] if w.startswith("--") else w[2:]
            return " ".join([value] + [shlex.quote(x) for x in words[i + 2 if w in ("-S", "--split-string") else i + 1:]])
    skip = False
    for i, w in enumerate(words):
        if skip:
            skip = False
        elif w == "--":
            return words[i + 1:]
        elif w.startswith("-") and len(w) > 1:
            skip = w in valued
        elif tool == "env" and re.fullmatch(r"[A-Za-z_]\w*=.*", w):
            continue
        elif operands:
            operands -= 1
        else:
            return words[i:]
    return None


def merges(words):
    """Whether one simple command, as words, merges a pull request."""
    while words and re.fullmatch(r"[A-Za-z_]\w*=.*", words[0]):  # VAR=value before the command
        words = words[1:]
    if not words:
        return False
    tool = words[0].rsplit("/", 1)[-1]
    if tool in WRAPPERS:
        command = wrapped(tool, words[1:])
        return command_merges(command) if isinstance(command, str) else bool(command) and merges(command)
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


def strip_comments(command):
    """The command line with each unquoted comment removed up to, not including, its newline."""
    out, quote, i = [], None, 0
    while i < len(command):
        ch = command[i]
        if quote == "'":
            quote = None if ch == "'" else quote
        elif ch == "\\":
            out.append(command[i:i + 2])
            i += 2
            continue
        elif quote == '"':
            quote = None if ch == '"' else quote
        elif ch in "'\"":
            quote = ch
        elif ch == "#" and (not out or out[-1][-1:] in " \t\n;&|()"):
            end = command.find("\n", i)
            i = len(command) if end < 0 else end
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def command_merges(command):
    """Whether a shell command line merges a pull request in any of its simple commands."""
    try:
        # An unquoted newline ends a command, as ; does; a quoted one stays in its word.
        # An unquoted newline ends a command, as ; does; a quoted one stays in its word. Comments are removed
        # first, since shlex's own comment handling would swallow the newline that ends one.
        lexer = shlex.shlex(strip_comments(command), posix=True, punctuation_chars=PUNCTUATION)
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
