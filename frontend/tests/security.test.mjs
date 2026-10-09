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
const { safeNext, sameOrigin, requestOrigin } = load('security.ts');
const { configInput, jobInput } = load('validation.ts');
const { createRateLimiter, clientKey } = load('rate-limit.ts');
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
