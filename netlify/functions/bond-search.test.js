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
  assert.equal(score({ name: 'Sans rapport', issuer: 'Autre' }, query), 0);
});

test('name trigram index narrows candidate shards for a real catalogue name', () => {
  const shardName = manifest.parts[0].file;
  const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, shardName), 'utf8'));
  const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
  const sample = records.find(record => typeof record.name === 'string' && search._test.normalize(record.name).length >= 3);
  assert.ok(sample, 'Expected a searchable name in the first catalogue shard');

  const key = search._test.normalize(sample.name);
  const candidates = search._test.indexedNameParts(key, manifest);
  assert.ok(Array.isArray(candidates), 'Expected a usable trigram index');
  assert.ok(candidates.some(part => part.file === shardName),
    `Expected trigram index for "${sample.name}" to include ${shardName}`);
});

test('name index normalization handles accents and punctuation consistently', () => {
  const normalize = search._test.normalize;
  assert.equal(normalize('Émission — Société Générale 2030'), 'emission societe generale 2030');
  assert.equal(normalize('Banque.Exemple/2030'), 'banque exemple 2030');
  assert.equal(normalize('  BANQUE   EXEMPLE  '), 'banque exemple');
});

test('name search falls back to all shards for queries shorter than a trigram', () => {
  const candidates = search._test.indexedNameParts('ab', manifest);
  assert.equal(candidates, null);
});
