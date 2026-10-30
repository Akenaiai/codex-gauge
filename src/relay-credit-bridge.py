"""Read-only quota bridge to the separately installed Agent Relay.

Never starts its scheduler or dispatches a model. Credentials remain inside the
owning process; only a one-way source fingerprint is included in the receipt.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor

root = Path(sys.argv[1]).resolve()
manifest = json.loads((root / '.codex-plugin/plugin.json').read_text(encoding='utf-8'))
if manifest.get('name') != 'agent-relay':
    raise ValueError('Unexpected companion')
sys.path.insert(0, str(root))
from relay import quota, kimi, kimi_runtime

def fingerprint(pool):
    try:
        if pool == 'kimi':
            info = kimi.request(kimi_runtime.ensure(), '/api/v1/oauth/userinfo', timeout=8)
            if info.get('kind') != 'ok' or not info.get('userInfo'):
                return None
            data = info['userInfo']
            value = next((str(data[k]) for k in ('id','uid','userId','user_id') if data.get(k)), None)
            if value is None:
                return None
            return hashlib.sha256(value.encode()).hexdigest()
        if pool == 'minimax':
            config = json.loads((Path.home()/'.claude/settings.json').read_text(encoding='utf-8')).get('env', {})
            if config.get('ANTHROPIC_BASE_URL','').rstrip('/') != 'https://api.minimax.io/anthropic':
                return None
            value = config.get('ANTHROPIC_AUTH_TOKEN') or config.get('ANTHROPIC_API_KEY')
            return hashlib.sha256(value.encode()).hexdigest() if value else None
        if pool == 'zcode':
            # Conservative credential-source binding: a token rotation creates a
            # new source rather than accidentally inheriting another account's dates.
            return hashlib.sha256((Path.home()/'.zcode/v2/credentials.json').read_bytes()).hexdigest()
    except Exception:
        return None

def read(pool):
    before = fingerprint(pool)
    try:
        row = quota.read(pool, refresh=True)
        after = fingerprint(pool)
        if before is None or after != before:
            row['binding_error'] = 'identity_unverified' if before is None else 'account_changed'
        else:
            row['identity_ref'] = before
        return row
    except Exception:
        return {'id': pool, 'error': 'query_failed', 'windows': []}

with ThreadPoolExecutor(max_workers=3) as executor:
    rows = list(executor.map(read, ('kimi','minimax','zcode')))
print(json.dumps(rows, ensure_ascii=True))
