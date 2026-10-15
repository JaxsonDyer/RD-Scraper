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
const { scoreMomentum, rankMomentum } = load('momentum.ts');
const now = Date.parse('2026-10-15T03:00:00Z');
const DAY = 86_400_000;
let next = 0;
// A post `daysAgo` old with counts captured `capturedAfter` days after posting (the daily scrape re-captures recent posts).
function post(username, daysAgo, likes, { comments = 0, capturedAfter } = {}) {
  const posted = now - daysAgo * DAY;
  const scraped = capturedAfter === undefined ? now : posted + capturedAfter * DAY;
  return { shortcode: `p${next++}`, username, likes, comments, posted_timestamp: new Date(posted).toISOString(), scraped_timestamp: new Date(scraped).toISOString() };
}
const account = (username, total_posts = 500) => ({ username, full_name: null, total_posts });
const usual = (username, likes) => [20, 30, 40, 50].map(days => post(username, days, likes, { capturedAfter: 10 }));

test('Momentum compares recent typical posts with the account’s own usual', () => {
  const rising = scoreMomentum(account('a'), [...usual('a', 100), post('a', 3, 200), post('a', 5, 180)], now);
  assert.equal(rising.status, 'ranked');
  assert.equal(rising.signal, 'rising');
  assert.equal(rising.ratio, 1.9);
  assert.equal(scoreMomentum(account('b'), [...usual('b', 100), post('b', 3, 105), post('b', 5, 95)], now).signal, 'steady');
  assert.equal(scoreMomentum(account('c'), [...usual('c', 100), post('c', 3, 50), post('c', 5, 60)], now).signal, 'fading');
});

test('Comments count as interactions alongside likes', () => {
  const result = scoreMomentum(account('a'), [...usual('a', 100), post('a', 3, 50, { comments: 100 }), post('a', 5, 50, { comments: 100 })], now);
  assert.equal(result.recentTypical, 150);
});

test('Accounts that only just started posting are New, not ranked', () => {
  const result = scoreMomentum(account('n', 3), [post('n', 2, 40), post('n', 6, 60), post('n', 20, 50)], now);
  assert.deepEqual(result, { status: 'new', recentTypical: 50, postCount: 3 });
});

test('A newly tracked account with a long history is not mistaken for New', () => {
  const result = scoreMomentum(account('old', 800), [post('old', 2, 40), post('old', 6, 60)], now);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.reason, 'No earlier posts yet');
});

test('Accounts with no recent posts are Quiet, with their last post date when known', () => {
  const last = post('q', 40, 10);
  assert.deepEqual(scoreMomentum(account('q'), [post('q', 60, 10), last], now), { status: 'quiet', lastPostedAt: last.posted_timestamp });
  assert.deepEqual(scoreMomentum(account('q'), [], now), { status: 'quiet', lastPostedAt: null });
});

test('Sparse history is reported instead of ranked', () => {
  const thinBaseline = scoreMomentum(account('s'), [post('s', 30, 100, { capturedAfter: 5 }), post('s', 3, 200), post('s', 5, 200)], now);
  assert.deepEqual([thinBaseline.status, thinBaseline.reason], ['insufficient', 'Only 1 earlier post']);
  const oneRecent = scoreMomentum(account('s'), [...usual('s', 100), post('s', 3, 200)], now);
  assert.deepEqual([oneRecent.status, oneRecent.reason], ['insufficient', 'Only 1 recent post']);
});

test('Counts captured within a day of posting are still climbing and are not scored', () => {
  const result = scoreMomentum(account('f'), [...usual('f', 100), post('f', 0.5, 5), post('f', 0.2, 3)], now);
  assert.deepEqual([result.status, result.reason], ['insufficient', 'Recent posts too new']);
});

test('The leaderboard ranks by momentum, then lists New, not-enough-data and Quiet accounts unranked', () => {
  const posts = [
    ...usual('steady', 100), post('steady', 3, 100), post('steady', 4, 100),
    ...usual('hot', 10), post('hot', 3, 40), post('hot', 4, 40),
    post('fresh', 2, 5),
    post('thin', 2, 5), post('thin', 3, 5),
  ];
  const board = rankMomentum([account('quiet'), account('thin'), account('fresh', 1), account('steady'), account('hot')], posts, now);
  assert.deepEqual(board.map(entry => [entry.account.username, entry.rank, entry.momentum.status]), [
    ['hot', 1, 'ranked'], ['steady', 2, 'ranked'], ['fresh', null, 'new'], ['thin', null, 'insufficient'], ['quiet', null, 'quiet'],
  ]);
});
