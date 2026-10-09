"""One persistent worker; Vercel handlers enqueue work and never spawn threads."""
import argparse
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import signal
import threading
import traceback
import uuid
from datetime import datetime, timezone
from storage import Storage, StorageError
import main as scraper
from insights import generate_insights

log = logging.getLogger('rd.worker')
shutdown = threading.Event()


def execute_job(store, job):
    payload, kind = job['payload'], job['kind']
    if kind == 'daily_scrape':
        result = scraper.run_daily_scrape(store)
        failures = [item for item in result['accounts'] if item['status'] == 'error']
        # One broken account must not block insights for the accounts that did collect.
        if result['accounts_scraped']:
            try:
                store.rpc('enqueue_insights_after_scrape', p_request_key=f"insights:{job['id']}")
            except StorageError:
                log.error('Could not enqueue insights after scrape %s', job['id'])
        # Retain account-level results; don't claim a partial run was successful.
        if failures:
            details = '; '.join(f'@{item.get("username", "unknown")}: {item.get("error", "Collection failed.")}' for item in failures)
            return result, f'{len(failures)} account(s) could not be scraped. {details}'[:1000]
        return result, None
    if kind == 'deep_scrape':
        return scraper.run_deep_scrape(payload['username'], payload['limit'], payload['delay'], payload.get('days_back'), store), None
    if kind == 'rescrape':
        return scraper.rescrape_single_post(payload['shortcode'], store), None
    if kind == 'analyze':
        return scraper.fetch_account_count(payload['username']), None
    if kind == 'insights':
        return generate_insights(store), None
    raise ValueError('Unknown job type.')


def run_claimed(store, job, worker_id):
    done = threading.Event()
    if not shutdown.is_set():
        scraper.cancelled.clear()
    def heartbeat():
        heartbeat_store = Storage()
        while not done.wait(30):
            try:
                if not heartbeat_store.rpc('heartbeat_job', p_job=job['id'], p_worker=worker_id):
                    scraper.cancelled.set()
                    return
            except StorageError:
                # Stop writes on an uncertain lease; don't run a competing job.
                scraper.cancelled.set()
                return
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    result, error = None, None
    try:
        log.info('Starting %s job %s', job['kind'], job['id'])
        result, error = execute_job(store, job)
    except (scraper.ScrapeError, StorageError, ValueError) as exc:
        error = str(exc)[:1000]
        log.error('Job %s (%s) failed: %s', job['id'], job['kind'], error)
    except Exception as exc:
        # Provider exceptions can include credentials or request details.
        log.error('Job %s (%s) failed (%s)\n%s', job['id'], job['kind'],
                  type(exc).__name__, ''.join(traceback.format_tb(exc.__traceback__)))
        error = f'Job failed ({type(exc).__name__}). Check worker logs using job ID {job["id"]}.'
    finally:
        done.set()
        thread.join(timeout=30)
    if not store.rpc('finish_job', p_job=job['id'], p_worker=worker_id, p_result=result, p_error=error):
        log.error('Job %s could not finish because its lease expired.', job['id'])
    else:
        if error:
            log.error('Finished job %s with error: %s', job['id'], error)
        else:
            log.info('Finished job %s: success', job['id'])


def configure_logging(log_file=None):
    handlers = [logging.StreamHandler()]
    if log_file:
        path = Path(log_file).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(RotatingFileHandler(path, maxBytes=2_000_000, backupCount=3, encoding='utf-8'))
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s',
                        handlers=handlers, force=True)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    if log_file:
        log.info('Worker log file: %s', path.resolve())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true', help='Run at most one queued job, then exit.')
    parser.add_argument('--log-file', help='Also save rotating logs to this file. Credentials and raw provider requests are not logged.')
    args = parser.parse_args()
    configure_logging(args.log_file)
    def stop(*_):
        shutdown.set()
        scraper.cancelled.set()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    store = Storage()
    worker_id = str(uuid.uuid4())
    while not shutdown.is_set():
        try:
            store.upsert('worker_status', {'id': 1, 'worker_id': worker_id,
                'last_seen': datetime.now(timezone.utc).isoformat()}, 'id')
            store.rpc('schedule_daily')
            jobs = store.rpc('claim_job', p_worker=worker_id) or []
            if jobs:
                run_claimed(store, jobs[0], worker_id)
        except StorageError as exc:
            log.error('%s', exc)
            if args.once:
                raise SystemExit(1)
        if args.once:
            break
        shutdown.wait(10)

if __name__ == '__main__':
    main()
