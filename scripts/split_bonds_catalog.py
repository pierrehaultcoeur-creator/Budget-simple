#!/usr/bin/env python3
"""Split the ESMA debt catalogue into GitHub-safe shards and build ISIN indexes.

Usage: python scripts/split_bonds_catalog.py [input.json] [output_dir]
Defaults: data/bonds-catalog.json -> data/bonds-catalog/
Each catalogue part targets 8 MiB. The ISIN index is partitioned by the first
two ISIN letters so no single index file grows without bound.
"""
from __future__ import annotations
import json, sys, hashlib, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'bonds-catalog.json'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'data' / 'bonds-catalog'
TARGET_BYTES = 8 * 1024 * 1024
ISIN_RE = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$')
NAME_INDEX_PREFIX = 'name-index-'

def normalize_search(value):
    text = unicodedata.normalize('NFKD', str(value or ''))
    text = ''.join(char for char in text if not unicodedata.category(char).startswith('M'))
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()

def trigrams(value):
    # Search queries are tokenized before lookup, so index trigrams within each
    # token only. Cross-word trigrams (for example, a gram starting with a
    # space) can never be queried and only create unnecessary index entries.
    grams = set()
    for token in normalize_search(value).split():
        grams.update(token[i:i + 3] for i in range(len(token) - 2))
    return grams



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
        isin = ''.join(record.split()).upper()
        return {'isin': isin, 'name': None} if isin else None
    if not isinstance(record, dict):
        return None
    isin = ''.join(str(record.get('isin') or record.get('ISIN') or record.get('isinCode') or '').split()).upper()
    if not isin:
        return None
    out = dict(record)
    out['isin'] = isin
    out.setdefault('name', record.get('instrumentName') or record.get('nameOfFinancialInstrument'))
    return out


def write_shards(records, source_metadata=None):
    # Preserve the previous manifest timestamp when the catalogue and all generated
    # indexes are byte-for-byte equivalent. A timestamp-only diff should not create
    # a new commit on every scheduled rebuild.
    previous_manifest = None
    previous_manifest_path = OUT / 'manifest.json'
    if previous_manifest_path.exists():
        try:
            previous_manifest = json.loads(previous_manifest_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            previous_manifest = None

    OUT.mkdir(parents=True, exist_ok=True)
    for pattern in ('part-*.json', 'isin-index-*.json', 'name-index-*.json', 'manifest.json'):
        for old in OUT.glob(pattern):
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
    index_buckets = {}
    name_index_buckets = {}
    total = 0
    has_names = False
    for idx, shard in enumerate(shards, 1):
        filename = f'part-{idx:04d}.json'
        target = OUT / filename
        target.write_text(json.dumps({'version': 1, 'records': shard}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        raw = target.read_bytes()
        total += len(shard)
            has_names = has_names or any(
            bool(record.get(field))
            for record in shard
            for field in (
                'name', 'shortName', 'short_name', 'issuer',
                'instrumentName', 'nameOfFinancialInstrument'
            )
        )
        manifest_parts.append({'file': filename, 'records': len(shard), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        if len(raw) >= 100 * 1024 * 1024:
            raise RuntimeError(f'{filename} exceeds GitHub 100 MB limit')
        for record in shard:
            isin = str(record.get('isin') or '').upper()
            if ISIN_RE.fullmatch(isin):
                index_buckets.setdefault(isin[:2], {})[isin] = filename
            searchable = ' '.join(str(record.get(field) or '') for field in (
                'name', 'shortName', 'short_name', 'issuer', 'instrumentName', 'nameOfFinancialInstrument'
            ))
            for gram in trigrams(searchable):
                name_index_buckets.setdefault(gram[0], {}).setdefault(gram, set()).add(filename)

    index_files = []
    for prefix, mapping in sorted(index_buckets.items()):
        filename = f'isin-index-{prefix}.json'
        target = OUT / filename
        target.write_text(json.dumps(mapping, separators=(',', ':'), sort_keys=True) + '\n', encoding='utf-8')
        raw = target.read_bytes()
        if len(raw) >= 100 * 1024 * 1024:
            raise RuntimeError(f'{filename} exceeds GitHub 100 MB limit')
        index_files.append({'prefix': prefix, 'file': filename, 'entries': len(mapping), 'bytes': len(raw)})

    name_index_files = []
    for prefix, mapping in sorted(name_index_buckets.items()):
        filename = f'name-index-{prefix}.json'
        serializable = {gram: sorted(files) for gram, files in sorted(mapping.items())}
        target = OUT / filename
        target.write_text(json.dumps(serializable, separators=(',', ':'), sort_keys=True) + '\n', encoding='utf-8')
        raw = target.read_bytes()
        if len(raw) >= 100 * 1024 * 1024:
            raise RuntimeError(f'{filename} exceeds GitHub 100 MB limit')
        name_index_files.append({'prefix': prefix, 'file': filename, 'trigrams': len(mapping), 'bytes': len(raw)})

    source_metadata = source_metadata if isinstance(source_metadata, dict) else {}
    manifest = {
        'version': 3,
        'generatedAt': source_metadata.get('generatedAt'),
        'sourcePublicationDate': source_metadata.get('publicationDate'),
        'source': source_metadata.get('source'),
        'sourceFileType': source_metadata.get('sourceFileType'),
        'sourceFile': SOURCE.name,
        'recordCount': total,
        'partCount': len(manifest_parts),
        'hasSearchableNames': has_names,
        'parts': manifest_parts,
        'isinIndexes': index_files,
        'nameIndexes': name_index_files,
        'notes': 'ISIN discovery catalogue only; an ISIN is not a verified quote or a fully enriched bond record.'
    }
    if isinstance(previous_manifest, dict):
        previous_comparable = dict(previous_manifest)
        current_comparable = dict(manifest)
        previous_generated_at = previous_comparable.pop('generatedAt', None)
        current_comparable.pop('generatedAt', None)
        if previous_comparable == current_comparable and previous_generated_at:
            manifest['generatedAt'] = previous_generated_at

    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Sharded {total:,} records into {len(manifest_parts)} catalogue files.')
    print(f'Built {sum(len(x) for x in index_buckets.values()):,} ISIN index entries across {len(index_files)} index files.')
    print(f'Largest catalogue part: {max((p["bytes"] for p in manifest_parts), default=0):,} bytes')
    print(f'Largest ISIN index: {max((x["bytes"] for x in index_files), default=0):,} bytes')
    print(f'Built {sum(x["trigrams"] for x in name_index_files):,} name trigrams across {len(name_index_files)} index files.')
    print(f'Largest name index: {max((x["bytes"] for x in name_index_files), default=0):,} bytes')


if __name__ == '__main__':
    if not SOURCE.exists():
        raise SystemExit(f'Input catalogue not found: {SOURCE}')
    payload = json.loads(SOURCE.read_text(encoding='utf-8'))
    metadata = payload if isinstance(payload, dict) else {}
    write_shards(records_from(payload), metadata)
