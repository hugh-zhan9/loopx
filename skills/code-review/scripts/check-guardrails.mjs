#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHECKS = [
  {
    id: 'no-db-lock',
    severity: 'error',
    pattern: /\b(?:SELECT\b[^\n]*\bFOR\s+(?:UPDATE|SHARE)|LOCK\s+TABLES?|pg_advisory_lock|GET_LOCK\s*\()/i,
    message: 'Prohibited application-controlled DB lock; prefer uniqueness/idempotency or optimistic CAS.',
  },
  {
    id: 'no-float-money',
    severity: 'error',
    pattern: /\b(?:price|amount|total|balance|discount|refund|fee|cost|qty|quantity|shares|ratio|rate)\w*\b[^\n]{0,30}\b(?:float32|float64|parseFloat)\b/i,
    message: 'Floating-point type/parse used for exact financial or quantity value; use integer minor units or decimal.',
  },
  {
    id: 'no-debug-tag',
    severity: 'error',
    pattern: /\[DEBUG-[A-Za-z0-9_-]+\]/,
    message: 'Leftover temporary [DEBUG-...] instrumentation tag.',
  },
];

export function scanLines(filePath, lines) {
  const findings = [];
  for (const { lineNumber, text } of lines) {
    for (const check of CHECKS) {
      if (check.pattern.test(text)) {
        findings.push({
          file: filePath,
          line: lineNumber,
          rule: check.id,
          severity: check.severity,
          message: check.message,
          snippet: text.trim().slice(0, 140),
        });
      }
    }
  }
  return findings;
}

export function parseUnifiedDiffAddedLines(diffText) {
  const byFile = new Map();
  let currentFile = null;
  let lineNo = 0;

  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      currentFile = raw.slice(6);
      if (!byFile.has(currentFile)) byFile.set(currentFile, []);
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = Number.parseInt(hunk[1], 10);
      continue;
    }
    if (!currentFile) continue;
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      byFile.get(currentFile).push({ lineNumber: lineNo, text: raw.slice(1) });
      lineNo += 1;
    } else if (!raw.startsWith('-')) {
      lineNo += 1;
    }
  }
  return byFile;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node check-guardrails.mjs [--diff <git-ref>] [file ...]');
    return;
  }

  const findings = [];
  const diffIndex = args.indexOf('--diff');
  if (diffIndex !== -1) {
    const baseRef = args[diffIndex + 1] || 'HEAD';
    const { stdout } = await execFileAsync('git', ['diff', '-U0', baseRef], { maxBuffer: 16 * 1024 * 1024 });
    const addedByFile = parseUnifiedDiffAddedLines(stdout);
    for (const [file, lines] of addedByFile) {
      if (/\.(md|txt|json)$/i.test(file)) continue;
      findings.push(...scanLines(file, lines));
    }
  } else if (args.length > 0) {
    for (const target of args) {
      const content = await readFile(resolve(target), 'utf8');
      const lines = content.split('\n').map((text, idx) => ({ lineNumber: idx + 1, text }));
      findings.push(...scanLines(target, lines));
    }
  } else {
    const { stdout } = await execFileAsync('git', ['diff', '-U0'], { maxBuffer: 16 * 1024 * 1024 });
    const addedByFile = parseUnifiedDiffAddedLines(stdout);
    for (const [file, lines] of addedByFile) {
      if (/\.(md|txt|json)$/i.test(file)) continue;
      findings.push(...scanLines(file, lines));
    }
  }

  if (findings.length === 0) {
    console.log('ok: no guardrail violations found');
    return;
  }

  for (const finding of findings) {
    console.error(`[${finding.rule}] ${finding.file}:${finding.line}: ${finding.message}`);
    console.error(`  ${finding.snippet}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
