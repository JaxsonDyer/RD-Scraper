import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function load(file, mocks = {}) {
  const filename = path.resolve(import.meta.dirname, '..', file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    // Real project modules (shared UI, utils) load through the same transpiler.
    if (id.startsWith('@/')) {
      const base = path.resolve(import.meta.dirname, '..', id.slice(2));
      const file = ['.tsx', '.ts'].map(ext => base + ext).find(candidate => fs.existsSync(candidate));
      if (file) return load(path.relative(path.resolve(import.meta.dirname, '..'), file), mocks);
    }
    return originalRequire(id);
  };
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const runHistory = load('lib/run-history.ts');
const { getRunErrorSummary, getRunStatus, getRunDetail, formatDuration } = runHistory;
const formatDate = load('lib/format-date.ts');
const id = 'd3bea4c1-e539-49cf-9b21-f4a74ade97a4';
const run = {
  id, kind: 'daily_scrape', status: 'error',
  error: '1 account(s) could not be scraped. @reddeervtv: Profile not found.',
  created_at: '2026-10-09T01:32:27Z', started_at: '2026-10-09T01:32:27Z', completed_at: '2026-10-09T01:34:06Z',
  result: { accounts_scraped: 4, accounts: [
    { username: 'reddeervtv', status: 'error', error: 'Profile not found.' },
    { username: 'reddeer', status: 'success' },
  ] },
};

function setup({ auth = { user: { id: 'admin' }, isAdmin: true }, data = run, error = null } = {}) {
  let reads = 0;
  const query = {
    select: () => query,
    eq: (field, value) => { assert.equal(field, 'id'); assert.equal(value, id); return query; },
    maybeSingle: async () => ({ data, error }),
  };
  const Page = load('app/scraper/runs/[id]/page.tsx', {
    '@/lib/auth': { getAuth: async () => auth },
    '@/lib/run-history': runHistory,
    '@/lib/format-date': formatDate,
    '@/lib/supabase/server': { createClient: async () => {
      reads++;
      return { from: table => { assert.equal(table, 'jobs'); return query; } };
    } },
    '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', {}, children) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/navigation': {
      redirect: url => { throw new Error(`redirect:${url}`); },
      notFound: () => { throw new Error('notFound'); },
    },
  }).default;
  return { page: (value = id) => Page({ params: Promise.resolve({ id: value }) }), reads: () => reads };
}

test('History summaries preserve the cause while shortening provider and account failures', () => {
  assert.equal(getRunErrorSummary('OpenRouter HTTP 401: API key expired. Check the OpenRouter API key.'), 'OpenRouter: API key expired');
  assert.equal(getRunErrorSummary(run.error), '1 account couldn’t be scraped');
  assert.equal(getRunErrorSummary('2 account(s) could not be scraped. @a: Missing; @b: Missing.'), '2 accounts couldn’t be scraped');
  assert.equal(getRunErrorSummary(null), 'Run failed');
  assert.ok(getRunErrorSummary('A'.repeat(200)).length <= 80);
});

test('Partial scrapes are warnings; only runs that collected nothing are failures', () => {
  assert.deepEqual(getRunStatus(run), { label: 'Warning', variant: 'warning' });
  assert.deepEqual(getRunStatus({ ...run, result: { accounts_scraped: 0 } }), { label: 'Failed', variant: 'destructive' });
  assert.deepEqual(getRunStatus({ kind: 'insights', status: 'error', error: 'OpenRouter HTTP 401', result: null }), { label: 'Failed', variant: 'destructive' });
  assert.equal(getRunStatus({ kind: 'insights', status: 'success', error: null }).label, 'Success');
  assert.equal(getRunStatus({ kind: 'daily_scrape', status: 'running', error: null }).label, 'Running');
});

test('Run details show account counts only for tasks that cover several accounts', () => {
  const partial = { kind: 'daily_scrape', status: 'error', error: 'x', result: { accounts_scraped: 1, accounts: [{ username: 'a', status: 'success' }, { username: 'b', status: 'error' }] } };
  assert.equal(getRunDetail(partial), '1 of 2 accounts');
  assert.equal(getRunDetail({ kind: 'deep_scrape', status: 'success', error: null, result: { username: 'reddeer', posts_collected: 1200 } }), '@reddeer · 1,200 posts');
  assert.equal(getRunDetail({ kind: 'insights', status: 'success', error: null, result: { model: 'x' } }), null);
  assert.equal(formatDuration(45_000), '45s');
  assert.equal(formatDuration(99_000), '1m 39s');
  assert.equal(formatDuration(3_900_000), '1h 5m');
});

test('Run details require an administrator before reading any job data', async () => {
  const signedOut = setup({ auth: { user: null, isAdmin: false } });
  await assert.rejects(signedOut.page(), /redirect:\/login\?next=/);
  assert.equal(signedOut.reads(), 0);
  const viewer = setup({ auth: { user: { id: 'viewer' }, isAdmin: false } });
  await assert.rejects(viewer.page(), /redirect:\/scraper/);
  assert.equal(viewer.reads(), 0);
});

test('Invalid and missing run IDs return not found', async () => {
  const invalid = setup();
  await assert.rejects(invalid.page('invalid'), /notFound/);
  assert.equal(invalid.reads(), 0);
  await assert.rejects(setup({ data: null }).page(), /notFound/);
});

test('The detail page retains the complete error and failed account context', async () => {
  const html = renderToStaticMarkup(await setup().page());
  assert.ok(html.includes(run.error));
  assert.ok(html.includes('@reddeervtv'));
  assert.ok(html.includes('Failed accounts'));
  assert.ok(html.includes(run.id));
  assert.ok(html.includes('America/Edmonton'));
  assert.ok(html.includes('/scraper#activity'));
  assert.ok(html.includes('Warning'));
});

test('Unavailable data offers a reload without exposing database errors', async () => {
  const html = renderToStaticMarkup(await setup({ data: null, error: { message: 'private database failure' } }).page());
  assert.ok(html.includes('Could not load run details'));
  assert.ok(html.includes('Try again'));
  assert.ok(!html.includes('private database failure'));
});
