import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The executive summary of a session's latest reply: the section after a "---" line headed
// "Executive summary" (or 執行摘要), and the numbered items under "Actions required from you".
export interface Summary {
  markdown: string;
  text: string;
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

interface Entry {
  type?: string;
  isSidechain?: boolean;
  message?: { content?: string | { type?: string; text?: string }[] };
}

// The text of the latest assistant reply, or undefined when the owner has written since.
export function latestReply(lines: string[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: Entry;
    try {
      entry = JSON.parse(lines[i]) as Entry;
    } catch {
      continue; // The first line of the tail may be cut.
    }
    if (entry.isSidechain) continue;
    const content = entry.message?.content;
    if (entry.type === 'user') {
      // A prompt (not a tool result) means a newer turn has started.
      const isPrompt = typeof content === 'string' || (content ?? []).some(c => c.type === 'text');
      if (isPrompt) return undefined;
    }
    if (entry.type === 'assistant' && Array.isArray(content)) {
      const text = content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n');
      if (text.trim()) return text;
    }
  }
  return undefined;
}

const SUMMARY_HEADING = /^[#*\s]*(executive summary|執行摘要)[*\s:：]*$/im;
const ACTIONS_HEADING = /^[#*\s]*(actions required from you|需要你處理的事項)[*\s:：]*$/im;

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
  return { markdown: section.trim(), text, actions };
}

const cache = new Map<string, { mtimeMs: number; size: number; summary?: Summary }>();

// The summary of the session's latest reply; re-read only when the transcript changed.
export function sessionSummary(sessionId: string, cwd: string): Summary | undefined {
  const file = transcriptPath(sessionId, cwd);
  if (!file) return undefined;
  const stat = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.summary;
  const reply = latestReply(readTail(file, stat.size).split('\n'));
  const summary = reply ? parseSummary(reply) : undefined;
  cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, summary });
  return summary;
}
