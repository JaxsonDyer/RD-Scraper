export class InputError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function integer(value: unknown, min: number, max: number, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new InputError(`${label} must be between ${min} and ${max}.`);
  return value;
}
export function username(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.]{1,30}$/.test(value)) throw new InputError('Enter a valid Instagram username.');
  return value;
}
export function configInput(value: unknown) {
  const data = object(value);
  const targets = typeof data.target_accounts === 'string' ? data.target_accounts.split(',').map(s => s.trim()).filter(Boolean) : data.target_accounts;
  if (!Array.isArray(targets) || targets.length > 50) throw new InputError('Configure at most 50 accounts.');
  if (typeof data.daily_run_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.daily_run_time)) throw new InputError('Enter a time in HH:MM format.');
  if (typeof data.scheduler_enabled !== 'boolean') throw new InputError('Choose whether automatic scraping is enabled.');
  const llm = object(data.llm_config);
  if (typeof llm.model !== 'string' || llm.model.length < 1 || llm.model.length > 200) throw new InputError('Choose a valid model.');
  return {
    target_accounts: [...new Set(targets.map(username))],
    daily_run_time: data.daily_run_time,
    scheduler_enabled: data.scheduler_enabled,
    post_lookback_days: integer(data.post_lookback_days, 1, 3650, 'Post lookback'),
    incremental_post_limit: integer(data.incremental_post_limit, 1, 5000, 'Post limit'),
    llm_config: {
      lookback_days: integer(llm.lookback_days, 1, 365, 'AI lookback'),
      max_posts: integer(llm.max_posts, 1, 250, 'AI post limit'), model: llm.model,
    },
  };
}
export function jobInput(kind: string, value: unknown) {
  const data = object(value);
  if (kind === 'analyze') return { username: username(data.username) };
  if (kind === 'deep_scrape') return {
    username: username(data.username),
    limit: integer(data.limit, 1, 5000, 'Scrape limit'),
    delay: integer(data.delay, 1, 3600, 'Pagination delay'),
    ...(data.days_back === undefined ? {} : { days_back: integer(data.days_back, 1, 3650, 'Lookback') }),
  };
  if (kind === 'rescrape') {
    if (typeof data.shortcode !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.shortcode)) throw new InputError('Invalid post ID.');
    return { shortcode: data.shortcode };
  }
  return {};
}
