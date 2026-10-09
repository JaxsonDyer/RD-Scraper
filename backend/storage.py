"""Private Supabase Data API client. Never expose this worker's key to Next.js."""
import os
from urllib.parse import urlparse
import requests
from dotenv import load_dotenv

load_dotenv()

class StorageError(RuntimeError):
    pass

class Storage:
    def __init__(self, url=None, key=None):
        self.url = (url or os.getenv('SUPABASE_URL', '')).rstrip('/')
        self.key = key or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
        parsed = urlparse(self.url)
        if not self.key or not parsed.hostname or parsed.scheme not in ('http', 'https'):
            raise StorageError('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the worker environment.')
        if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1'):
            raise StorageError('Supabase connections must use HTTPS outside local development.')
        self.headers = {'apikey': self.key, 'Authorization': f'Bearer {self.key}', 'Content-Type': 'application/json'}

    def request(self, method, path, *, params=None, data=None, prefer=None):
        headers = dict(self.headers)
        if prefer:
            headers['Prefer'] = prefer
        try:
            response = requests.request(method, f'{self.url}/rest/v1/{path}', headers=headers,
                                        params=params, json=data, timeout=(5, 20))
        except requests.RequestException as exc:
            raise StorageError('Supabase request failed.') from exc
        if not response.ok:
            # Don't put response bodies, headers, credentials, or SQL internals in logs.
            raise StorageError(f'Supabase request failed (HTTP {response.status_code}).')
        return response.json() if response.content else None

    def select(self, table, **params):
        return self.request('GET', table, params=params) or []

    def upsert(self, table, data, conflict):
        return self.request('POST', table, params={'on_conflict': conflict}, data=data,
                            prefer='resolution=merge-duplicates,return=minimal')

    def rpc(self, name, **params):
        return self.request('POST', f'rpc/{name}', data=params)

    def config(self):
        rows = self.select('app_config', id='eq.1', select='data')
        if not rows:
            raise StorageError('Apply the Supabase schema before starting the worker.')
        return rows[0]['data']
