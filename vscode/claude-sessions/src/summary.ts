import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The executive summary of a session's latest reply: the section after a "---" line headed
// "Executive summary" (or 執行摘要), and the numbered items under "Actions required from you".
export interface Summary {
  markdown: string;
  text: string;
  // The first sentence of the text, for the row; the whole summary goes in the tooltip.
  headline: string;
  // Written under 執行摘要, so the row's labels are in Chinese.
  chinese: boolean;
  actions: string[];
}

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const TAIL_BYTES = 512 * 1024;

// Claude Code keeps each session's transcript at ~/.claude/projects/<cwd with non-alphanumerics as "-">/<id>.jsonl.
const pathCache = new Map<string, string>();
function transcriptPath(sessionId: string, cwd: string): string | undefined {
  const known = pathCache.get(sessionId);
  if (known) return known;
  const found = findTranscript(sessionId, cwd);
  if (found) pathCache.set(sessionId, found);
  return found;
}

function findTranscript(sessionId: string, cwd: string): string | undefined {
  const direct = path.join(PROJECTS_DIR, cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
  if (fs.existsSync(direct)) return direct;
  try {
    for (const dir of fs.readdirSync(PROJECTS_DIR)) {
      const candidate = path.join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // No projects directory: no transcripts.
  }
  return undefined;
}

function readTail(file: string, size: number): string {
  const fd = fs.openSync(file, 'r');
  try {
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

type Content = { type?: string; text?: string; name?: string; input?: Record<string, unknown> };

interface Entry {
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  timestamp?: string;
  message?: { content?: string | Content[] };
}

// What a session is doing in its current turn, and the summary its latest reply ended with.
export interface Activity {
  // The latest phase line (the marker, such as "▸", at the start of a line, outside code fences) written in this turn.
  phase?: string;
  phaseAt?: number;
  // The latest tool call in this turn, for when no phase line has been written yet.
  tool?: string;
  summary?: Summary;
}

// The entries of the current turn, oldest first: everything after the latest prompt from the owner.
// Skill text and other injected context (isMeta) and tool results are not prompts.
export function currentTurn(lines: string[]): Entry[] {
  const turn: Entry[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: Entry;
    try {
      entry = JSON.parse(lines[i]) as Entry;
    } catch {
      continue; // The first line of the tail may be cut.
    }
    if (entry.isSidechain) continue;
    const content = entry.message?.content;
    if (entry.type === 'user' && !entry.isMeta) {
      const isPrompt = typeof content === 'string' || (content ?? []).some(c => c.type === 'text');
      if (isPrompt) break;
    }
    turn.unshift(entry);
  }
  return turn;
}

export const DEFAULT_MARKER = '▸';

// The last phase line in a text, skipping fenced code.
export function lastPhase(text: string, marker = DEFAULT_MARKER): string | undefined {
  const phaseLine = new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(.+)$`);
  let fenced = false;
  let phase: string | undefined;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const m = fenced ? null : phaseLine.exec(line);
    if (m) phase = m[1].replace(/\*\*|__|`/g, '').trim();
  }
  return phase;
}

// A short label for a tool call: its own description where it has one, else the file or the tool name.
export function toolLabel(c: Content): string {
  const input = c.input ?? {};
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  if (str('description')) return str('description');
  if (c.name === 'Skill' && str('skill')) return `skill ${str('skill')}`;
  const file = str('file_path') || str('notebook_path') || str('path');
  if (file) return `${c.name} ${path.basename(file)}`;
  return c.name ?? 'tool';
}

export function parseActivity(lines: string[], marker = DEFAULT_MARKER): Activity {
  const activity: Activity = {};
  let reply: string | undefined;
  for (const entry of currentTurn(lines)) {
    const content = entry.message?.content;
    if (entry.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const c of content) {
      if (c.type === 'tool_use') activity.tool = toolLabel(c);
      if (c.type === 'text' && c.text?.trim()) {
        reply = c.text;
        const phase = lastPhase(c.text, marker);
        if (phase) {
          activity.phase = phase;
          activity.phaseAt = entry.timestamp ? Date.parse(entry.timestamp) : undefined;
        }
      }
    }
  }
  if (reply) activity.summary = parseSummary(reply);
  return activity;
}

const SUMMARY_HEADING = /^[#*\s]*(executive summary|執行摘要)[*\s:：]*$/im;
const ACTIONS_HEADING = /^[#*\s]*(actions required from you|需要你處理的事項)[*\s:：]*$/im;
const HEADLINE_MAX = 120;

// The first sentence of the summary, cut to HEADLINE_MAX characters.
export function headline(text: string): string {
  const first = text.split('\n')[0] ?? '';
  const sentence = /^.+?(。|[.!?](\s|$))/.exec(first)?.[0].trim() ?? first;
  return sentence.length > HEADLINE_MAX ? `${sentence.slice(0, HEADLINE_MAX - 1)}…` : sentence;
}

export function parseSummary(reply: string): Summary | undefined {
  const heading = SUMMARY_HEADING.exec(reply);
  if (!heading) return undefined;
  const section = reply.slice(heading.index);
  // The summary text runs from the end of the heading to the next "---" or actions heading.
  const body = reply.slice(heading.index + heading[0].length);
  const end = body.search(/^\s*(---+\s*$|[#*\s]*(actions required from you|需要你處理的事項))/im);
  const text = (end < 0 ? body : body.slice(0, end))
    .replace(/\*\*|__|`/g, '').trim()
    .split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  const actionsAt = section.search(ACTIONS_HEADING);
  const actionsText = actionsAt < 0 ? '' : section.slice(actionsAt);
  const actions = [...actionsText.matchAll(/^\d+\.\s+(.+)$/gm)]
    .map(m => m[1].replace(/\*\*|__|`/g, '').trim().replace(/[:：]$/, ''));
  return { markdown: section.trim(), text, headline: headline(text), chinese: heading[1] === '執行摘要', actions };
}

const cache = new Map<string, { mtimeMs: number; size: number; marker: string; activity: Activity }>();

// The session's current activity; re-read only when the transcript changed.
export function sessionActivity(sessionId: string, cwd: string, marker = DEFAULT_MARKER): Activity | undefined {
  const file = transcriptPath(sessionId, cwd);
  if (!file) return undefined;
  const stat = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size && hit.marker === marker) return hit.activity;
  const activity = parseActivity(readTail(file, stat.size).split('\n'), marker);
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, marker, activity });
  return activity;
}
