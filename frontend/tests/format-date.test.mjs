import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
function load(file) {
  const filename = path.resolve(import.meta.dirname, '../lib', file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = new Module(filename);
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const { formatRelative, formatDate, formatDateTime } = load('format-date.ts');
const now = Date.parse('2026-10-15T03:39:00Z');
const ago = ms => new Date(now - ms).toISOString();

test('Relative time reads naturally from seconds to weeks', () => {
  assert.equal(formatRelative(ago(20_000), now), 'just now');
  assert.equal(formatRelative(ago(12 * 60_000), now), '12 min ago');
  assert.equal(formatRelative(ago(3 * 3_600_000 + 59 * 60_000), now), '3 hr ago');
  assert.equal(formatRelative(ago(30 * 3_600_000), now), 'yesterday');
  assert.equal(formatRelative(ago(2 * 86_400_000 + 5), now), '2 days ago');
  assert.equal(formatRelative(ago(40 * 86_400_000), now), formatDate(ago(40 * 86_400_000)));
  // Clock skew must not produce "-1 min ago".
  assert.equal(formatRelative(new Date(now + 90_000).toISOString(), now), 'just now');
});

test('Calendar days compare by day and never shift to the previous evening', () => {
  assert.equal(formatRelative('2026-10-15', now), 'today');
  assert.equal(formatRelative('2026-10-14', now), 'yesterday');
  assert.equal(formatRelative('2026-10-12', now), '3 days ago');
  assert.equal(formatDate('2026-10-15'), 'Oct 15, 2026');
  // A day has no time of day to show.
  assert.equal(formatDateTime('2026-10-15'), 'Oct 15, 2026');
});

test('Instants format in the requested timezone', () => {
  assert.equal(formatDateTime('2026-10-15T03:39:12Z', { timeZone: 'America/Edmonton' }), 'Oct 14, 2026, 9:39 p.m.');
  assert.equal(formatDateTime('2026-10-15T03:39:12Z', { timeZone: 'America/Edmonton', seconds: true }), 'Oct 14, 2026, 9:39:12 p.m.');
  assert.equal(formatDate('not a date'), '');
});
