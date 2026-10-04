/** Explicit, idempotent publisher for the issue-ready backlog. Requires authenticated gh. */
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const repository = process.argv[2];
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
  throw new Error('Usage: node scripts/publish-issues.mjs OWNER/REPOSITORY');
const temporary = mkdtempSync(join(tmpdir(), 'chromesthesia-issues-'));
const payloadPath = join(temporary, 'payload.json');
function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', shell: false });
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || 'GitHub request failed');
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
function api(endpoint, method, body) {
  writeFileSync(payloadPath, JSON.stringify(body));
  return gh(['api', endpoint, '--method', method, '--input', payloadPath]);
}
try {
  const milestones = gh(['api', `repos/${repository}/milestones?state=all&per_page=100`]);
  const names = {
    M0: 'Foundation',
    M1: 'Signals',
    M2: 'Inputs',
    M3: 'The world',
    M4: 'Perception',
    M5: 'Release foundation',
    V1: 'Listening accuracy',
  };
  const milestoneIds = {};
  for (const [key, label] of Object.entries(names)) {
    const title = `${key} · ${label}`;
    const milestone =
      milestones.find((item) => item.title === title) ??
      api(`repos/${repository}/milestones`, 'POST', { title });
    milestoneIds[key] = milestone.number;
  }
  const existing = gh([
    'issue',
    'list',
    '--repo',
    repository,
    '--state',
    'all',
    '--limit',
    '100',
    '--json',
    'number,title,body,url',
  ]);
  const sections = readFileSync('docs/ISSUES.md', 'utf8').matchAll(
    /^## (CH-\d+) · (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm,
  );
  const published = [];
  const completed = new Set(['CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-06', 'CH-07', 'CH-08']);
  for (const [, id, title, sourceBody] of sections) {
    const marker = `<!-- chromesthesia:${id} -->`;
    const milestoneKey = sourceBody.match(/\*\*Milestone:\*\* (M\d|V1)/)?.[1];
    if (!milestoneKey) throw new Error(`Missing milestone for ${id}`);
    const dependencyText = sourceBody.match(/\*\*Depends on:\*\* ([^.]+)/)?.[1] ?? '';
    const dependencies = [];
    for (const match of dependencyText.matchAll(/CH-(\d+)(?:[–-]CH-(\d+))?/g)) {
      for (let number = Number(match[1]); number <= Number(match[2] ?? match[1]); number++) {
        const dependency = published.find(
          (item) => item.id === `CH-${String(number).padStart(2, '0')}`,
        );
        if (dependency) dependencies.push(`#${dependency.number}`);
      }
    }
    const body = `${marker}\n\n${sourceBody.trim()}\n\n${dependencies.length ? `Dependency links: ${dependencies.join(', ')}.\n\n` : ''}Source: docs/ISSUES.md. Published in dependency order.\n`;
    let issue = existing.find((item) => item.body.includes(marker));
    if (!issue)
      issue = api(`repos/${repository}/issues`, 'POST', {
        title: `[${id}] ${title}`,
        body,
        milestone: milestoneIds[milestoneKey],
      });
    if (completed.has(id))
      api(`repos/${repository}/issues/${issue.number}`, 'PATCH', {
        state: 'closed',
        state_reason: 'completed',
      });
    const record = {
      id,
      number: issue.number,
      url: issue.html_url ?? issue.url,
      milestone: milestoneKey,
    };
    published.push(record);
    process.stdout.write(`${id}: ${record.url}\n`);
  }
  writeFileSync(
    'docs/github-issues.json',
    `${JSON.stringify({ repository, milestones: milestoneIds, issues: published }, null, 2)}\n`,
  );
} finally {
  try {
    unlinkSync(payloadPath);
  } catch {
    /* No payload was written. */
  }
  rmdirSync(temporary);
}
