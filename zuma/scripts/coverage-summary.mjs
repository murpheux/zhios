#!/usr/bin/env node
// Prints a markdown coverage table from each workspace's coverage/coverage-summary.json (written by
// `npm run test:coverage`) plus test counts from coverage/test-results.json (jest --json). No deps.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined);

// Expands the root package.json "workspaces" entries (plain paths or a trailing "/*").
const workspaces = (readJson(join(root, 'package.json'))?.workspaces ?? []).flatMap((pattern) => {
  if (!pattern.endsWith('/*')) return [pattern];
  const dir = join(root, pattern.slice(0, -2));
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => statSync(join(dir, name)).isDirectory())
        .map((name) => `${pattern.slice(0, -2)}/${name}`)
    : [];
});

const pct = (metric) => (metric ? `${metric.pct.toFixed(2)}% (${metric.covered}/${metric.total})` : 'n/a');

const rows = [];
const totals = { statements: [0, 0], branches: [0, 0], functions: [0, 0], lines: [0, 0], tests: 0 };
for (const workspace of workspaces.sort()) {
  const pkg = readJson(join(root, workspace, 'package.json'));
  if (!pkg) continue;
  const summary = readJson(join(root, workspace, 'coverage', 'coverage-summary.json'))?.total;
  const results = readJson(join(root, workspace, 'coverage', 'test-results.json'));
  const tests = results ? `${results.numPassedTests}/${results.numTotalTests}` : 'n/a';
  if (summary) {
    for (const key of ['statements', 'branches', 'functions', 'lines']) {
      totals[key][0] += summary[key].covered;
      totals[key][1] += summary[key].total;
    }
  }
  totals.tests += results?.numPassedTests ?? 0;
  rows.push([
    pkg.name ?? workspace,
    pct(summary?.statements),
    pct(summary?.branches),
    pct(summary?.functions),
    pct(summary?.lines),
    tests,
  ]);
}

const total = (key) => {
  const [covered, all] = totals[key];
  return all ? `${((covered / all) * 100).toFixed(2)}% (${covered}/${all})` : 'n/a';
};
rows.push([
  '**total**',
  total('statements'),
  total('branches'),
  total('functions'),
  total('lines'),
  String(totals.tests),
]);

const header = ['workspace', 'statements', 'branches', 'functions', 'lines', 'tests'];
const lines = [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
];
process.stdout.write(`${lines.join('\n')}\n`);
