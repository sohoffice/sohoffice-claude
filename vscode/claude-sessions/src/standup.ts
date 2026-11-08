import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// A project's agent sessions, declared in <workspace folder>/.claude/sessions.json:
// {
//   "project": "myapp",
//   "sessions": [
//     { "role": "orchestrator", "skill": "orchestrator", "remoteControl": true },
//     { "role": "developer", "skill": "ticket-developer" }
//   ]
// }
// The session name is "<project> <role>"; the system prompt and stand-up message come from the templates below.
export interface SessionSpec {
  role: string;
  skill: string;
  remoteControl?: boolean;
}

export interface Manifest {
  project: string;
  sessions: SessionSpec[];
}

export const MANIFEST_PATH = path.join('.claude', 'sessions.json');

export const STAND_UP =
  "Stand up: load your role's instructions as your system prompt says, confirm your role in one or two lines, " +
  'then wait for instructions. Do not start any work yet.';

export function readManifest(folder: string): Manifest | undefined {
  const file = path.join(folder, MANIFEST_PATH);
  if (!fs.existsSync(file)) return undefined;
  const json = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Manifest>;
  const project = json.project || path.basename(folder);
  const sessions = (json.sessions ?? []).filter(s => s && s.role && s.skill);
  return { project, sessions };
}

export function sessionName(manifest: Manifest, spec: SessionSpec): string {
  return `${manifest.project} ${spec.role}`;
}

export function systemPrompt(manifest: Manifest, spec: SessionSpec): string {
  return `You are the ${spec.role} of the ${manifest.project} project. ` +
    'At session start, and whenever their content is no longer in your context (for example after a compaction), ' +
    `follow the project CLAUDE.md and invoke the ${spec.skill} skill, which defines your role.`;
}

// Claude Code keeps transcripts in ~/.claude/projects/<cwd with non-alphanumerics as "-">/<session id>.jsonl.
export function transcriptDir(cwd: string): string {
  return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

const TITLE = /"type":"custom-title".*?"customTitle":"((?:[^"\\]|\\.)*)"/g;

// The latest title a transcript was given (by --name or /rename), if any.
export function latestTitle(text: string): string | undefined {
  let title: string | undefined;
  for (const m of text.matchAll(TITLE)) title = JSON.parse(`"${m[1]}"`) as string;
  return title;
}

// The newest conversation in the folder whose latest title is the name;
// "claude --resume <name>" fails when several conversations share it.
export function latestSessionId(cwd: string, name: string): string | undefined {
  const dir = transcriptDir(cwd);
  let files: { file: string; mtime: number }[];
  try {
    files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return undefined;
  }
  for (const { file } of files) {
    try {
      if (latestTitle(fs.readFileSync(file, 'utf8')) === name) return path.basename(file, '.jsonl');
    } catch {
      // Unreadable transcript: skip it.
    }
  }
  return undefined;
}

// The claude arguments that resume the session's latest conversation, or start a new one with the stand-up message.
export function claudeArgs(manifest: Manifest, spec: SessionSpec, resumeId: string | undefined): string[] {
  const name = sessionName(manifest, spec);
  const args = ['--name', name, '--append-system-prompt', systemPrompt(manifest, spec)];
  // Remote Control lets the owner drive the session from claude.ai/code or the Claude app.
  if (spec.remoteControl) args.push('--remote-control', name);
  return resumeId ? ['--resume', resumeId, ...args] : [...args, STAND_UP];
}
