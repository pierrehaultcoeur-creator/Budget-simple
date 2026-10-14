const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const search = require('./bond-search');

const catalogueDir = path.join(__dirname, '..', '..', 'data', 'bonds-catalog');
const manifest = JSON.parse(fs.readFileSync(path.join(catalogueDir, 'manifest.json'), 'utf8'));

function firstIndexedIsin() {
  for (const entry of manifest.isinIndexes || []) {
    const index = JSON.parse(fs.readFileSync(path.join(catalogueDir, entry.file), 'utf8'));
    const isin = Object.keys(index).find(value => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value));
    if (isin) return isin;
  }
  throw new Error('No valid ISIN found in generated indexes');
}

test('exact ISIN lookup returns the indexed bond', () => {
  const isin = firstIndexedIsin();
  const results = search._test.shardedCatalogSearch(isin);
  assert.equal(results.length, 1);
  assert.equal(results[0].isin, isin);
  assert.equal(results[0].type, 'bond');
});

test('partial ISIN prefix lookup returns only matching ISINs', () => {
  const isin = firstIndexedIsin();
  const prefix = isin.slice(0, 4);
  const results = search._test.shardedCatalogSearch(prefix);
  assert.ok(results.length > 0, `Expected results for prefix ${prefix}`);
  assert.ok(results.length <= 30);
  assert.ok(results.every(item => item.isin.startsWith(prefix)));
});

test('canonical bond preserves missing maturity semantics and flags source sentinel', () => {
  const bond = search._test.canonicalBond({
    isin: 'FR0000047607',
    name: 'Example perpetual bond',
    maturityDate: null,
    maturityDateRaw: '9999-12-31',
    maturityDateStatus: 'SENTINEL_UNSPECIFIED'
  });
  assert.equal(bond.maturity, null);
  assert.equal(bond.maturityStatus, 'SENTINEL_UNSPECIFIED');
  assert.equal(bond.maturitySourceValue, '9999-12-31');
});

test('canonical bond never exposes sentinel maturity dates as real maturities', () => {
  const fromRawValue = search._test.canonicalBond({
    isin: 'FR0000047607',
    name: 'Example perpetual bond',
    maturityDate: '9999-12-31'
  });
  assert.equal(fromRawValue.maturity, null);
  assert.equal(fromRawValue.maturityStatus, 'SENTINEL_UNSPECIFIED');
  assert.equal(fromRawValue.maturitySourceValue, '9999-12-31');

  const fromNormalizedStatus = search._test.canonicalBond({
    isin: 'FR0000047608',
    name: 'Example perpetual bond',
    maturityDate: '2030-01-01',
    maturityDateRaw: '9999-12-31',
    maturityDateStatus: 'SENTINEL_UNSPECIFIED'
  });
  assert.equal(fromNormalizedStatus.maturity, null);
  assert.equal(fromNormalizedStatus.maturityStatus, 'SENTINEL_UNSPECIFIED');
  assert.equal(fromNormalizedStatus.maturitySourceValue, '9999-12-31');
});

test('canonical bond labels conventional bonds separately from structured products', () => {
  const conventional = search._test.canonicalBond({ isin: 'FR0000047607', name: 'Example bond', cfi: 'DBXXXX' });
  const structured = search._test.canonicalBond({ isin: 'FR0000047608', name: 'Example structured instrument', cfi: 'DEXXXX' });
  assert.equal(conventional.instrumentLabel, 'Obligation classique (CFI DB)');
  assert.equal(structured.instrumentLabel, 'Produit structuré sans protection du capital');
});

test('canonical bond withholds suspicious coupon and preserves source value', () => {
  const bond = search._test.canonicalBond({
    isin: 'GR0118017657',
    name: 'GGB 3.375 2/25 GREECE',
    couponRate: null,
    couponRateRaw: '3375',
    couponRateStatus: 'SUSPICIOUS_SOURCE_VALUE'
  });
  assert.equal(bond.coupon, null);
  assert.equal(bond.couponStatus, 'SUSPICIOUS_SOURCE_VALUE');
  assert.equal(bond.couponSourceValue, '3375');
});

test('invalid ISIN-like input does not claim an exact match', () => {
  assert.deepEqual(search._test.exactIsinSearch('NOT-AN-ISIN'), null);
});

test('catalogue search can find a real record by its name', () => {
  const shardName = manifest.parts[0].file;
  const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, shardName), 'utf8'));
  const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
  const sample = records.find(record => typeof record.name === 'string' && record.name.trim().length >= 8);
  assert.ok(sample, 'Expected a named record in the first catalogue shard');
  const query = sample.name.trim();
  const results = search._test.shardedCatalogSearch(query);
  assert.ok(results.some(item => item.isin === sample.isin), `Expected name search to find ISIN ${sample.isin}`);
});

test('public search handler returns a real catalogue record for a name query', async () => {
  const shardName = manifest.parts[0].file;
  const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, shardName), 'utf8'));
  const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
  const sample = records.find(record => typeof record.name === 'string' && record.name.trim().length >= 8);
  assert.ok(sample, 'Expected a named record in the first catalogue shard');

  const response = await search.handler({ queryStringParameters: { q: sample.name.trim() } });
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.source, 'bond-master');
  assert.ok(payload.results.some(item => item.isin === sample.isin),
    `Expected public handler to return ISIN ${sample.isin} for name query`);
});

test('OpenFIGI fallback never presents unverified coupon or dates as trusted terms', () => {
  const candidate = search._test.normalizeOpenFigi({
    figi: 'BBG000000001',
    name: 'Example corporate bond',
    marketSector: 'Corp',
    coupon: 8.75,
    issueDate: '2024-01-01',
    maturity: '2034-01-01'
  });
  assert.ok(candidate);
  assert.equal(candidate.isin, null);
  assert.equal(candidate.coupon, null);
  assert.equal(candidate.couponStatus, 'NOT_VERIFIED_EXTERNAL_SOURCE');
  assert.equal(candidate.issueDate, null);
  assert.equal(candidate.maturity, null);
  assert.equal(candidate.maturityStatus, 'NOT_VERIFIED_EXTERNAL_SOURCE');
  assert.equal(candidate.status, 'CANDIDATE_NOT_VERIFIED');
  assert.equal(candidate.confidence, 'candidate-only');
});

test('name search ranking prioritizes exact names over prefixes and issuer matches', () => {
  const score = search._test.scoreCatalogRecord;
  const query = search._test.normalize('Banque Exemple');
  assert.ok(score({ name: 'Banque Exemple', issuer: 'Autre' }, query)
    > score({ name: 'Banque Exemple 2030', issuer: 'Autre' }, query));
  assert.ok(score({ name: 'Autre titre', issuer: 'Banque Exemple' }, query)
    < score({ name: 'Banque Exemple 2030', issuer: 'Autre' }, query));
  assert.ok(score({ name: 'Exemple Banque 2030', issuer: 'Autre' }, query)
    > score({ name: 'Autre titre', issuer: 'Banque Exemple' }, query),
    'Expected reordered name tokens to rank above an issuer-only match');
  assert.ok(score({ name: 'Exemple Banque 2030', issuer: 'Autre' }, 'exemp banq') > 0,
    'Expected reordered partial tokens to find a bond name');
  assert.ok(score({ name: 'Autre titre', issuer: 'Exemple Banque' }, query) > 0,
    'Expected reordered issuer tokens to remain searchable');
  assert.equal(score({ name: 'Exemple Banque 2030', issuer: 'Autre' }, 'ex ba'), 0,
    'Expected very short tokens not to create loose token-prefix matches');
  assert.equal(score({ name: 'Sans rapport', issuer: 'Autre' }, query), 0);
});

test('name trigram index actually narrows candidate shards for a real catalogue name', () => {
  let sample = null;
  let shardName = null;
  let candidates = null;

  for (const part of manifest.parts) {
    const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, part.file), 'utf8'));
    const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
    for (const record of records) {
      if (typeof record.name !== 'string') continue;
      const key = search._test.normalize(record.name);
      if (key.length < 3) continue;
      const indexed = search._test.indexedNameParts(key, manifest);
      if (Array.isArray(indexed) && indexed.length < manifest.parts.length && indexed.some(item => item.file === part.file)) {
        sample = record;
        shardName = part.file;
        candidates = indexed;
        break;
      }
    }
    if (sample) break;
  }

  assert.ok(sample, 'Expected at least one real name query to narrow the shard candidates');
  assert.ok(candidates.length < manifest.parts.length,
    `Expected fewer than ${manifest.parts.length} candidate shards for "${sample.name}"`);
  assert.ok(candidates.some(part => part.file === shardName),
    `Expected trigram index for "${sample.name}" to include its source shard ${shardName}`);
});

test('catalogue search finds a real bond when name tokens are reordered', () => {
  let sample = null;
  for (const part of manifest.parts) {
    const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, part.file), 'utf8'));
    const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
    sample = records.find(record => {
      if (typeof record.name !== 'string') return false;
      const tokens = search._test.normalize(record.name).split(' ').filter(Boolean);
      return tokens.length >= 2 && tokens[0].length >= 3 && tokens[1].length >= 3 && tokens[0] !== tokens[1];
    });
    if (sample) break;
  }
  assert.ok(sample, 'Expected a real catalogue name with at least two searchable tokens');
  const tokens = search._test.normalize(sample.name).split(' ').filter(Boolean);
  const reorderedQuery = `${tokens[1]} ${tokens[0]}`;
  const results = search._test.shardedCatalogSearch(reorderedQuery);
  assert.ok(results.some(item => item.isin === sample.isin),
    `Expected reordered query "${reorderedQuery}" to find ISIN ${sample.isin} (${sample.name})`);
});

test('multi-token trigram lookup keeps the real record shard while narrowing candidates', () => {
  let sample = null;
  let sourceShard = null;
  for (const part of manifest.parts) {
    const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, part.file), 'utf8'));
    const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
    sample = records.find(record => {
      if (typeof record.name !== 'string') return false;
      const tokens = search._test.normalize(record.name).split(' ').filter(Boolean);
      return tokens.length >= 3 && tokens.filter(token => token.length >= 3).length >= 2;
    });
    if (sample) {
      sourceShard = part.file;
      break;
    }
  }
  assert.ok(sample, 'Expected a real catalogue name with at least two searchable tokens');
  const tokens = search._test.normalize(sample.name).split(' ').filter(token => token.length >= 3);
  const query = `${tokens[0]} ${tokens[tokens.length - 1]}`;
  const candidates = search._test.indexedNameParts(query, manifest);
  assert.ok(Array.isArray(candidates), 'Expected indexed candidates for a multi-token query');
  assert.ok(candidates.some(part => part.file === sourceShard),
    `Expected multi-token query "${query}" to retain source shard ${sourceShard}`);
  assert.ok(candidates.length < manifest.parts.length,
    `Expected multi-token query to narrow below all ${manifest.parts.length} shards`);
});

test('multi-token name lookup does not return unrelated records from candidate shards', () => {
  const results = search._test.shardedCatalogSearch('zzqvwx nonexistentbondtoken');
  assert.deepEqual(results, [], 'Expected unrelated multi-token query to return no catalogue matches');
});

test('name index normalization handles accents and punctuation consistently', () => {
  const normalize = search._test.normalize;
  assert.equal(normalize('Émission — Société Générale 2030'), 'emission societe generale 2030');
  assert.equal(normalize('Banque.Exemple/2030'), 'banque exemple 2030');
  assert.equal(normalize('  BANQUE   EXEMPLE  '), 'banque exemple');
});

test('reordered partial name tokens still find the real catalogue record', () => {
  let sample = null;
  for (const part of manifest.parts) {
    const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, part.file), 'utf8'));
    const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
    sample = records.find(record => {
      if (typeof record.name !== 'string') return false;
      const tokens = search._test.normalize(record.name).split(' ').filter(token => token.length >= 4);
      return tokens.length >= 2 && tokens[0] !== tokens[1];
    });
    if (sample) break;
  }
  assert.ok(sample, 'Expected a real catalogue name with two tokens of at least four characters');
  const tokens = search._test.normalize(sample.name).split(' ').filter(token => token.length >= 4);
  const query = `${tokens[1].slice(0, 3)} ${tokens[0].slice(0, 3)}`;
  const candidates = search._test.indexedNameParts(query, manifest);
  assert.ok(Array.isArray(candidates), 'Expected the partial multi-token query to use the name index');
  const results = search._test.shardedCatalogSearch(query);
  assert.ok(results.some(item => item.isin === sample.isin),
    `Expected partial reordered query "${query}" to find ISIN ${sample.isin} (${sample.name})`);
});

test('repeated partial name tokens do not duplicate shard candidates or match a single-token name', () => {
  const records = manifest.parts.flatMap(part => {
    const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, part.file), 'utf8'));
    return Array.isArray(shard) ? shard : (shard.records || shard.items || []);
  });
  const sample = records.find(record => {
    const tokens = search._test.normalize(record.name).split(' ').filter(token => token.length >= 4);
    return tokens.some(token => search._test.normalize(record.name).split(' ').filter(part => part === token).length === 1);
  });
  assert.ok(sample, 'Expected a real catalogue name with a token that appears once');
  const token = search._test.normalize(sample.name).split(' ').find(part => part.length >= 4
    && search._test.normalize(sample.name).split(' ').filter(value => value === part).length === 1);
  const partial = token.slice(0, 3);
  const indexedOnce = search._test.indexedNameParts(partial, manifest);
  const indexedRepeated = search._test.indexedNameParts(`${partial} ${partial}`, manifest);
  assert.deepEqual(indexedRepeated, indexedOnce,
    'Expected duplicate query tokens not to repeat shard-index work or change candidates');
  const results = search._test.shardedCatalogSearch(`${partial} ${partial}`);
  assert.ok(!results.some(item => item.isin === sample.isin),
    'Expected a repeated partial token not to match a record where that token appears only once');
});

test('repeated query tokens do not create unrelated name matches', () => {
  const score = search._test.scoreCatalogRecord;
  assert.equal(score({ name: 'Banque Exemple 2030', issuer: 'Autre' }, 'banque banque'), 0,
    'Expected repeated query terms not to match a name that contains the token only once');
});

test('name search falls back to all shards for queries shorter than a trigram', () => {
  const candidates = search._test.indexedNameParts('ab', manifest);
  assert.equal(candidates, null);
});
