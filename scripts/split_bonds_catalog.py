#!/usr/bin/env python3
"""Split the generated ESMA debt catalogue into GitHub-safe JSON shards.

Usage: python scripts/split_bonds_catalog.py [input.json] [output_dir]
Defaults: data/bonds-catalog.json -> data/bonds-catalog/
Each part is kept below 8 MiB (target), leaving room below GitHub's 100 MB/file cap.
Supports catalog objects containing records/items/isins, or a top-level array.
"""
from __future__ import annotations
import json, os, sys, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'bonds-catalog.json'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'data' / 'bonds-catalog'
TARGET_BYTES = 8 * 1024 * 1024


def records_from(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ('records', 'items', 'isins', 'instruments', 'data'):
            if isinstance(payload.get(key), list):
                return payload[key]
    raise ValueError('Unsupported catalogue JSON: expected an array or an object with records/items/isins/instruments/data')


def compact_record(record):
    if isinstance(record, str):
        isin = record.replace(' ', '').upper()
        return {'isin': isin, 'name': None} if isin else None
    if not isinstance(record, dict):
        return None
    isin = str(record.get('isin') or record.get('ISIN') or record.get('isinCode') or '').replace(' ', '').upper()
    if not isin:
        return None
    # Keep the source record's fields; add a canonical lower-case ISIN for consumers.
    out = dict(record)
    out['isin'] = isin
    out.setdefault('name', record.get('instrumentName') or record.get('nameOfFinancialInstrument'))
    return out


def write_shards(records):
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('part-*.json'):
        old.unlink()
    shards, current, current_bytes = [], [], 2
    for raw in records:
        item = compact_record(raw)
        if not item:
            continue
        encoded = json.dumps(item, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        extra = len(encoded) + (1 if current else 0)
        if current and current_bytes + extra > TARGET_BYTES:
            shards.append(current)
            current, current_bytes = [], 2
            extra = len(encoded)
        current.append(item)
        current_bytes += extra
    if current:
        shards.append(current)
    manifest_parts = []
    total = 0
    has_names = False
    for idx, shard in enumerate(shards, 1):
        filename = f'part-{idx:04d}.json'
        target = OUT / filename
        target.write_text(json.dumps({'version': 1, 'records': shard}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        raw = target.read_bytes()
        total += len(shard)
        has_names = has_names or any(bool(x.get('name') or x.get('issuer')) for x in shard)
        manifest_parts.append({'file': filename, 'records': len(shard), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        if len(raw) >= 100 * 1024 * 1024:
            raise RuntimeError(f'{filename} exceeds GitHub 100 MB limit')
    manifest = {
        'version': 1,
        'generatedAt': None,
        'sourceFile': SOURCE.name,
        'recordCount': total,
        'partCount': len(manifest_parts),
        'hasSearchableNames': has_names,
        'parts': manifest_parts,
        'notes': 'ISIN discovery catalogue only; an ISIN is not a verified quote or a fully enriched bond record.'
    }
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Sharded {total:,} records into {len(manifest_parts)} files in {OUT}')
    print(f'Largest part: {max((p["bytes"] for p in manifest_parts), default=0):,} bytes')

if __name__ == '__main__':
    if not SOURCE.exists():
        raise SystemExit(f'Input catalogue not found: {SOURCE}')
    payload = json.loads(SOURCE.read_text(encoding='utf-8'))
    write_shards(records_from(payload))
