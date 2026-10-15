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
const { safeNext, sameOrigin, requestOrigin, devLoginEnabled } = load('security.ts');
const { configInput, jobInput } = load('validation.ts');
const { createRateLimiter, clientKey } = load('rate-limit.ts');
const { pollAfterMs, clampPoll } = load('poll-estimate.ts');
test('Status polling waits for the estimated next change, between 2 seconds and 2 minutes', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const at = seconds => new Date(now + seconds * 1000).toISOString();
  const done = (kind, start, seconds) => ({ kind, status: 'success', created_at: at(start), started_at: at(start), completed_at: at(start + seconds) });
  // Idle: wait the maximum.
  assert.equal(pollAfterMs([done('daily_scrape', -900, 100)], now), 120_000);
  // Queued: the worker claims within about 10 seconds.
  assert.equal(pollAfterMs([{ kind: 'insights', status: 'queued', created_at: at(0), started_at: null, completed_at: null }], now), 5_000);
  // Running: past runs took 100s and this one started 40s ago, so wait about 60s more.
  const running = { kind: 'daily_scrape', status: 'running', created_at: at(-40), started_at: at(-40), completed_at: null };
  assert.equal(pollAfterMs([running, done('daily_scrape', -900, 100), done('daily_scrape', -9000, 100)], now), 62_000);
  // Overdue: check often.
  assert.equal(pollAfterMs([{ ...running, started_at: at(-130) }, done('daily_scrape', -900, 100)], now), 5_000);
  // Deep scrape: 3 pages with a 30s delay is about 92s, so the 2-minute cap is not hit.
  const deep = { kind: 'deep_scrape', status: 'running', payload: { limit: 120, delay: 30 }, created_at: at(0), started_at: at(0), completed_at: null };
  assert.equal(pollAfterMs([deep], now), 94_000);
  // Long deep scrapes are capped at 2 minutes.
  assert.equal(pollAfterMs([{ ...deep, payload: { limit: 5000, delay: 60 } }], now), 120_000);
  // A scheduled run 30s away: check shortly after the worker should queue it.
  assert.equal(pollAfterMs([], now, now + 30_000), 45_000);
  assert.equal(clampPoll(1), 2_000);
  assert.equal(clampPoll('soon'), 120_000);
});
test('Public reads are limited per client and reset after a minute', () => {
  let time = 0;
  const allow = createRateLimiter(2, () => time);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false);
  assert.equal(allow('b'), true);
  time = 60_000;
  assert.equal(allow('a'), true);
  assert.equal(clientKey(new Request('https://app.test', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })), '1.2.3.4');
});
test('OAuth return paths reject external URLs, protocol-relative URLs, and backslashes', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/\nevil.test', null]) assert.equal(safeNext(value), '/');
  assert.equal(safeNext('/scraper'), '/scraper');
});
test('Write requests require the same origin', () => {
  assert.equal(sameOrigin(new Request('https://app.test/api/config', { headers: { origin: 'https://evil.test' } })), false);
  assert.equal(sameOrigin(new Request('https://app.test/api/config')), false);
  assert.equal(sameOrigin(new Request('https://app.test/api/config', { headers: { origin: 'https://app.test' } })), true);
});
test('Deep scraping has bounded volume and delay', () => {
  for (const payload of [{ username: 'test', limit: 5001, delay: 1 }, { username: 'test', limit: 10, delay: -1 }, { username: '../../bad', limit: 10, delay: 1 }]) assert.throws(() => jobInput('deep_scrape', payload));
  assert.deepEqual(jobInput('deep_scrape', { username: 'test', limit: 10, delay: 1 }), { username: 'test', limit: 10, delay: 1 });
});
test('Configuration validates time and AI cost bounds', () => {
  const valid = { target_accounts: 'reddeer, reddeer', daily_run_time: '00:00', scheduler_enabled: false, post_lookback_days: 30, incremental_post_limit: 250, llm_config: { lookback_days: 7, max_posts: 10, model: 'test/model' } };
  assert.deepEqual(configInput(valid).target_accounts, ['reddeer']);
  assert.throws(() => configInput({ ...valid, daily_run_time: '25:00' }));
  assert.throws(() => configInput({ ...valid, llm_config: { ...valid.llm_config, max_posts: 10000 } }));
  assert.throws(() => configInput({ ...valid, scheduler_enabled: 'false' }));
});

test('Origin checks use the public host when Next uses localhost internally', () => {
  const request = new Request('http://localhost:3036/api/config', { headers: { host: 'app.example', 'x-forwarded-proto': 'https', origin: 'https://app.example' } });
  assert.equal(requestOrigin(request), 'https://app.example');
  assert.equal(sameOrigin(request), true);
});

test('Email sign-in is only enabled by the development server', () => {
  assert.equal(devLoginEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(devLoginEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(devLoginEnabled({ NODE_ENV: 'test' }), false);
  assert.equal(devLoginEnabled({}), false);
});
