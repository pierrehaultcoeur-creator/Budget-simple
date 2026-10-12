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

test('invalid ISIN-like input does not claim an exact match', () => {
  assert.deepEqual(search._test.exactIsinSearch('NOT-AN-ISIN'), null);
});
