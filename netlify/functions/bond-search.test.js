const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

test('full and partial FIGI identifiers bypass ISIN-prefix and name-index routing', () => {
  const isFigiLikeQuery = search._test.isFigiLikeQuery;
  assert.equal(isFigiLikeQuery('BBG000B9XRY4'), true);
  assert.equal(isFigiLikeQuery(' bbg000b9xry4 '), true, 'Expected whitespace and case normalization');
  assert.equal(isFigiLikeQuery('BBG000'), true, 'Expected a partial FIGI prefix to bypass ISIN routing');
  assert.equal(isFigiLikeQuery('FR0000047607'), false, 'Expected a full ISIN not to be classified as a FIGI');
  assert.equal(isFigiLikeQuery('BOND ISSUER'), false, 'Expected ordinary name queries not to be classified as FIGIs');
});

test('FIGI queries skip the ESMA shard scan and continue to OpenFIGI fallback', () => {
  const shouldSearchShardedCatalog = search._test.shouldSearchShardedCatalog;
  assert.equal(shouldSearchShardedCatalog('BBG000B9XRY4'), false);
  assert.equal(shouldSearchShardedCatalog('BBG000'), false);
  assert.equal(shouldSearchShardedCatalog('FR0000047607'), true);
  assert.equal(shouldSearchShardedCatalog('Banque Exemple'), true);
});

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
  assert.equal(conventional.instrumentCategory, 'conventional-bond');
  assert.equal(structured.instrumentLabel, 'Produit structuré sans protection du capital');
  assert.equal(structured.instrumentCategory, 'structured-product');

  const protectedStructured = search._test.canonicalBond({
    isin: 'FR0000047609', name: 'Protected structured instrument', cfi: 'DSXXXX'
  });
  assert.equal(protectedStructured.instrumentCategory, 'structured-product');

  const mediumTermNote = search._test.canonicalBond({
    isin: 'FR0000047610', name: 'Example medium-term note', cfi: 'DTXXXX'
  });
  assert.equal(mediumTermNote.instrumentCategory, 'related-debt-instrument');

  const unknownGroup = search._test.canonicalBond({
    isin: 'FR0000047611', name: 'Unknown debt group', cfi: 'DXXXXXX'
  });
  assert.equal(unknownGroup.instrumentCategory, 'unclassified-debt-instrument');
});

test('public bond master records expose normalized CFI instrument categories', () => {
  const conventional = search._test.publicBond({
    figi: 'BBG000TEST01',
    isin: 'FR0000047607',
    name: 'Example conventional bond',
    cfi: 'DBXXXX'
  });
  assert.equal(conventional.assetClass, 'debt-instrument');
  assert.equal(conventional.instrumentGroup, 'DB');
  assert.equal(conventional.instrumentCategory, 'conventional-bond');
  assert.equal(conventional.instrumentLabel, 'Obligation classique (CFI DB)');

  const structured = search._test.publicBond({
    figi: 'BBG000TEST02',
    isin: 'FR0000047608',
    name: 'Example structured product',
    cfi: 'DEXXXX'
  });
  assert.equal(structured.instrumentCategory, 'structured-product');
  assert.equal(structured.instrumentLabel, 'Produit structuré sans protection du capital');
});

test('canonical bond preserves ESMA short name, issuer LEI and market MIC fields', () => {
  const bond = search._test.canonicalBond({
    isin: 'FR0000047607',
    name: 'Full legal instrument name',
    shortName: 'Example Note 2030',
    issuerLei: '549300EXAMPLE00000000',
    marketMic: 'XETR'
  });
  assert.equal(bond.name, 'Full legal instrument name');
  assert.equal(bond.shortName, 'Example Note 2030');
  assert.equal(bond.issuerLei, '549300EXAMPLE00000000');
  assert.equal(bond.mic, 'XETR');
  assert.equal(bond.exchange, 'XETR');
});

test('short names are eligible for bond search ranking', () => {
  const score = search._test.scoreCatalogRecord;
  assert.ok(score({ name: 'Full legal instrument name', shortName: 'Example Note 2030' }, 'example note') > 0,
    'Expected a short-name prefix query to match the bond');
});

test('exact short-name matches outrank broad name fragments but not exact legal names', () => {
  const score = search._test.scoreCatalogRecord;
  const exactShortName = score({
    name: 'Long legal instrument description containing Example Note 2030',
    shortName: 'Example Note 2030'
  }, 'example note 2030');
  const nameSubstring = score({
    name: 'Long legal instrument description containing Example Note 2030',
    shortName: 'Other short name'
  }, 'example note 2030');
  const exactLegalName = score({
    name: 'Example Note 2030',
    shortName: 'Example Note'
  }, 'example note 2030');
  assert.ok(exactShortName > nameSubstring,
    'Expected an exact short-name match to outrank a broad full-name substring');
  assert.ok(exactLegalName > exactShortName,
    'Expected an exact full legal name to remain the strongest match');
});

test('canonical bond defensively withholds coupon values flagged as suspicious', () => {
  const bond = search._test.canonicalBond({
    isin: 'GR0118017657',
    name: 'Example bond',
    couponRate: '3375',
    couponRateRaw: '3375',
    couponRateStatus: 'SUSPICIOUS_SOURCE_VALUE'
  });
  assert.equal(bond.coupon, null);
  assert.equal(bond.couponStatus, 'SUSPICIOUS_SOURCE_VALUE');
  assert.equal(bond.couponSourceValue, '3375');
});

test('canonical bond withholds invalid and unverified maturity values', () => {
  const invalid = search._test.canonicalBond({
    isin: 'FR0000047607',
    name: 'Example bond',
    maturityDate: '2030-02-31',
    maturityDateRaw: '2030-02-31',
    maturityDateStatus: 'NOT_VERIFIED_EXTERNAL_SOURCE'
  });
  assert.equal(invalid.maturity, null);
  assert.equal(invalid.maturityStatus, 'INVALID_SOURCE_VALUE');
  assert.equal(invalid.maturitySourceValue, '2030-02-31');

  const unverified = search._test.canonicalBond({
    isin: 'FR0000047608',
    name: 'Unverified example bond',
    maturityDate: '2030-02-28',
    maturityDateStatus: 'NOT_VERIFIED_EXTERNAL_SOURCE'
  });
  assert.equal(unverified.maturity, null);
  assert.equal(unverified.maturityStatus, 'NOT_VERIFIED_EXTERNAL_SOURCE');
  assert.equal(unverified.maturitySourceValue, null);
});

test('canonical bond rejects invalid ISO maturity dates without a precomputed status', () => {
  const invalid = search._test.canonicalBond({
    isin: 'FR0000047607',
    name: 'Example bond',
    maturityDate: '2030-02-31'
  });
  assert.equal(invalid.maturity, null);
  assert.equal(invalid.maturityStatus, 'INVALID_SOURCE_VALUE');
  assert.equal(invalid.maturitySourceValue, '2030-02-31');

  const validLeapDay = search._test.canonicalBond({
    isin: 'FR0000047608',
    name: 'Example bond',
    maturityDate: '2032-02-29'
  });
  assert.equal(validLeapDay.maturity, '2032-02-29');
  assert.equal(validLeapDay.maturityStatus, null);
});

test('canonical bond rejects non-ISO maturity strings without a precomputed status', () => {
  for (const value of ['31/12/2030', '2030-13-01', 'not-a-date']) {
    const bond = search._test.canonicalBond({
      isin: 'FR0000047609',
      name: 'Example bond',
      maturityDate: value
    });
    assert.equal(bond.maturity, null, `Expected non-ISO maturity "${value}" to be withheld`);
    assert.equal(bond.maturityStatus, 'INVALID_SOURCE_VALUE');
    assert.equal(bond.maturitySourceValue, value);
  }
});

test('invalid and sentinel maturity values override contradictory trusted statuses', () => {
  const invalid = search._test.canonicalBond({
    isin: 'FR0000047610',
    name: 'Invalid maturity example',
    maturity: '2030-02-31',
    maturityStatus: 'VERIFIED'
  });
  assert.equal(invalid.maturity, null);
  assert.equal(invalid.maturityStatus, 'INVALID_SOURCE_VALUE');
  assert.equal(invalid.maturitySourceValue, '2030-02-31');

  const sentinel = search._test.canonicalBond({
    isin: 'FR0000047611',
    name: 'Sentinel maturity example',
    maturity: '9999-12-31',
    maturityStatus: 'VERIFIED'
  });
  assert.equal(sentinel.maturity, null);
  assert.equal(sentinel.maturityStatus, 'SENTINEL_UNSPECIFIED');
  assert.equal(sentinel.maturitySourceValue, '9999-12-31');
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

test('canonical bond withholds suspicious coupon values without precomputed status', () => {
  for (const value of ['3375', '101', '-101']) {
    const bond = search._test.canonicalBond({
      isin: 'FR0000047612',
      name: 'Suspicious coupon example',
      couponRate: value
    });
    assert.equal(bond.coupon, null, `Expected coupon "${value}" to be withheld`);
    assert.equal(bond.couponStatus, 'SUSPICIOUS_SOURCE_VALUE');
    assert.equal(bond.couponSourceValue, value);
  }
});

test('canonical bond withholds non-numeric coupon values without precomputed status', () => {
  const bond = search._test.canonicalBond({
    isin: 'FR0000047613',
    name: 'Invalid coupon example',
    couponRate: 'not-a-rate'
  });
  assert.equal(bond.coupon, null);
  assert.equal(bond.couponStatus, 'INVALID_SOURCE_VALUE');
  assert.equal(bond.couponSourceValue, 'not-a-rate');
});

test('local investment-page canonicalization withholds invalid coupon and maturity data', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'investissement.html'), 'utf8');
  const start = html.indexOf('function cfiLabel(group){');
  const end = html.indexOf('\nasync function searchLocal', start);
  assert.ok(start >= 0 && end > start, 'Expected to locate investment-page canonicalization functions');
  const canonical = vm.runInNewContext(`${html.slice(start, end)}; canonical`);

  const invalid = canonical({
    isin: 'FR0000047607',
    name: 'Local validation example',
    couponRate: '3375',
    couponRateStatus: 'VERIFIED',
    maturityDate: '2030-02-31',
    maturityDateStatus: 'VERIFIED',
    cfi: 'DBXXXX'
  });
  assert.equal(invalid.instrumentCategory, 'conventional-bond');
  assert.equal(invalid.instrumentGroup, 'DB');
  assert.equal(invalid.coupon, null);
  assert.equal(invalid.couponStatus, 'SUSPICIOUS_SOURCE_VALUE');
  assert.equal(invalid.couponSourceValue, '3375');
  assert.equal(invalid.maturity, null);
  assert.equal(invalid.maturityStatus, 'INVALID_SOURCE_VALUE');
  assert.equal(invalid.maturitySourceValue, '2030-02-31');

  const valid = canonical({
    isin: 'FR0000047615',
    name: 'Local valid example',
    couponRate: '3,375',
    maturityDate: '2032-02-29',
    cfi: 'DEXXXX'
  });
  assert.equal(valid.instrumentCategory, 'structured-product');
  assert.equal(valid.instrumentGroup, 'DE');
  assert.equal(valid.coupon, '3,375');
  assert.equal(valid.couponStatus, null);
  assert.equal(valid.maturity, '2032-02-29');
  assert.equal(valid.maturityStatus, null);
});

test('server and investment page classify every supported CFI debt group consistently', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'investissement.html'), 'utf8');
  const start = html.indexOf('function cfiLabel(group){');
  const end = html.indexOf('\nasync function searchLocal', start);
  assert.ok(start >= 0 && end > start, 'Expected to locate investment-page canonicalization functions');
  const localCanonical = vm.runInNewContext(`${html.slice(start, end)}; canonical`);

  const cases = [
    ['DA', 'related-debt-instrument'],
    ['DB', 'conventional-bond'],
    ['DC', 'related-debt-instrument'],
    ['DD', 'related-debt-instrument'],
    ['DE', 'structured-product'],
    ['DG', 'related-debt-instrument'],
    ['DM', 'related-debt-instrument'],
    ['DN', 'related-debt-instrument'],
    ['DS', 'structured-product'],
    ['DT', 'related-debt-instrument'],
    ['DW', 'related-debt-instrument'],
    ['DY', 'other-debt-instrument'],
    ['D?', 'unclassified-debt-instrument']
  ];

  for (const [group, expectedCategory] of cases) {
    const record = {
      isin: 'FR0000047607',
      name: 'CFI classification consistency check',
      cfi: `${group}XXXX`
    };
    const server = search._test.canonicalBond(record);
    const local = localCanonical(record);
    assert.equal(server.instrumentCategory, expectedCategory, `Server category for ${group}`);
    assert.equal(local.instrumentCategory, expectedCategory, `Investment page category for ${group}`);
    assert.equal(local.instrumentCategory, server.instrumentCategory, `Category parity for ${group}`);
    assert.equal(local.instrumentLabel, server.instrumentLabel, `Human-readable label parity for ${group}`);
  }
});

test('canonical bond normalizes blank coupon values to null', () => {
  for (const value of ['', '   ']) {
    const bond = search._test.canonicalBond({
      isin: 'FR0000047607',
      name: 'Blank coupon example',
      couponRate: value
    });
    assert.equal(bond.coupon, null);
    assert.equal(bond.couponStatus, null);
  }
});

test('canonical bond keeps valid coupon percentages and decimal commas', () => {
  const dot = search._test.canonicalBond({
    isin: 'FR0000047614',
    name: 'Valid coupon example',
    couponRate: '3.375'
  });
  assert.equal(dot.coupon, '3.375');
  assert.equal(dot.couponStatus, null);

  const comma = search._test.canonicalBond({
    isin: 'FR0000047615',
    name: 'Valid comma coupon example',
    couponRate: '3,375'
  });
  assert.equal(comma.coupon, '3,375');
  assert.equal(comma.couponStatus, null);
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
  const result = payload.results.find(item => item.isin === sample.isin);
  assert.ok(result, `Expected public handler to return ISIN ${sample.isin} for name query`);

  const group = sample.instrumentGroup || sample.cfiGroup
    || (sample.cfi ? String(sample.cfi).slice(0, 2) : null);
  const code = String(group || '').slice(0, 2).toUpperCase();
  const expectedCategory = code === 'DB'
    ? 'conventional-bond'
    : ['DE', 'DS'].includes(code)
      ? 'structured-product'
      : code === 'DY'
        ? 'other-debt-instrument'
        : ['DA', 'DC', 'DD', 'DG', 'DM', 'DN', 'DT', 'DW'].includes(code)
          ? 'related-debt-instrument'
          : 'unclassified-debt-instrument';

  assert.equal(result.assetClass, 'debt-instrument');
  assert.equal(result.instrumentGroup, group);
  assert.equal(result.instrumentCategory, expectedCategory,
    'Expected public handler to expose the CFI-derived instrument category');
});

test('public handler sends a FIGI query to OpenFIGI without scanning ESMA shards', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        data: [{
          figi: 'BBG000B9XRY4',
          name: 'Example corporate bond',
          marketSector: 'Corp'
        }]
      })
    };
  };
  try {
    const response = await search.handler({ queryStringParameters: { q: 'BBG000B9XRY4' } });
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(request.url, 'https://api.openfigi.com/v3/filter');
    assert.equal(request.body.query, 'BBG000B9XRY4');
    assert.equal(payload.source, 'openfigi');
    assert.equal(payload.results[0].figi, 'BBG000B9XRY4');
    assert.equal(payload.results[0].confidence, 'candidate-only');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenFIGI fallback excludes preferred stock from debt-instrument candidates', () => {
  const preferredStock = search._test.normalizeOpenFigi({
    figi: 'BBG000PREF01',
    name: 'Example preferred stock',
    marketSector: 'Pfd',
    securityType: 'Preferred Stock'
  });
  assert.equal(preferredStock, null);
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

test('partial multi-token matching requires distinct target tokens', () => {
  const score = search._test.scoreCatalogRecord;
  assert.equal(score({ name: 'Banque', issuer: '' }, 'ban banque'), 0,
    'Expected one name token not to satisfy two distinct query tokens');
  assert.ok(score({ name: 'Banque Nationale', issuer: '' }, 'ban nat') > 0,
    'Expected distinct partial tokens to match separate name tokens');
  assert.equal(score({ name: 'Banque', issuer: 'Banque' }, 'ban banque'), 0,
    'Expected issuer matching to require distinct issuer tokens too');
  assert.ok(score({ name: 'Autre titre', issuer: 'Banque Nationale' }, 'ban nat') > 0,
    'Expected distinct partial tokens to match separate issuer tokens');
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

test('short name queries skip expensive sharded scans after master lookup', () => {
  assert.equal(search._test.shouldSearchShardedNames('ab'), false);
  assert.equal(search._test.shouldSearchShardedNames('  AB  '), false,
    'Expected normalization and trimming to be applied before the minimum-length check');
  assert.equal(search._test.shouldSearchShardedNames('bond'), true);
  assert.equal(search._test.shouldSearchShardedNames('FRAB'), true,
    'Expected potentially useful partial ISIN prefixes to remain eligible for sharded lookup');
});

test('name search falls back when every query token is shorter than a trigram', () => {
  const candidates = search._test.indexedNameParts('a bc de', manifest);
  assert.equal(candidates, null,
    'Expected a full-scan fallback when no query token can use the trigram index');
});

test('mixed short and long name tokens keep the source shard while narrowing candidates', () => {
  let sample = null;
  let sourceShard = null;
  for (const part of manifest.parts) {
    const shard = JSON.parse(fs.readFileSync(path.join(catalogueDir, part.file), 'utf8'));
    const records = Array.isArray(shard) ? shard : (shard.records || shard.items || []);
    sample = records.find(record => {
      if (typeof record.name !== 'string') return false;
      const tokens = search._test.normalize(record.name).split(' ').filter(Boolean);
      return tokens.some(token => token.length === 2) && tokens.some(token => token.length >= 3);
    });
    if (sample) {
      sourceShard = part.file;
      break;
    }
  }
  assert.ok(sample, 'Expected a real catalogue name containing both a two-character token and a searchable token');
  const tokens = search._test.normalize(sample.name).split(' ').filter(Boolean);
  const shortToken = tokens.find(token => token.length === 2);
  const longToken = tokens.find(token => token.length >= 3);
  const query = `${shortToken} ${longToken}`;
  const candidates = search._test.indexedNameParts(query, manifest);
  assert.ok(Array.isArray(candidates), 'Expected the long token to enable indexed lookup');
  assert.ok(candidates.some(part => part.file === sourceShard),
    `Expected mixed-token query "${query}" to retain source shard ${sourceShard}`);
  assert.ok(candidates.length < manifest.parts.length,
    'Expected mixed-token query to narrow candidates despite the short token');
  const results = search._test.shardedCatalogSearch(query);
  assert.ok(results.some(item => item.isin === sample.isin),
    `Expected mixed-token query "${query}" to find ISIN ${sample.isin} (${sample.name})`);
});

test('catalogue shard filenames reject path traversal and non-JSON files', () => {
  const isSafe = search._test.isSafeCatalogFilename;
  assert.equal(isSafe('part-0001.json'), true);
  assert.equal(isSafe('__missing_name_index_test__.json'), true);
  assert.equal(isSafe('../part-0001.json'), false);
  assert.equal(isSafe('nested/part-0001.json'), false);
  assert.equal(isSafe('/tmp/part-0001.json'), false);
  assert.equal(isSafe('part-0001.csv'), false);
  assert.equal(isSafe(''), false);
  assert.equal(isSafe(null), false);
});

test('malformed trigram entries trigger a safe full-scan fallback', () => {
  const filesFor = search._test.nameIndexFiles;
  assert.deepEqual(filesFor({}, 'ban'), [],
    'Expected a genuinely missing trigram to be treated as a valid no-match');
  assert.deepEqual(filesFor({ ban: ['part-0001.json'] }, 'ban'), ['part-0001.json'],
    'Expected a valid trigram entry to return its shard list');
  assert.equal(filesFor({ ban: 'part-0001.json' }, 'ban'), null,
    'Expected a malformed trigram value to trigger fallback rather than hide valid matches');
  assert.equal(filesFor({ ban: null }, 'ban'), null,
    'Expected null index entries to be treated as malformed');
  assert.equal(filesFor({ ban: [42] }, 'ban'), null,
    'Expected non-string shard references to trigger fallback');
  assert.equal(filesFor({ ban: ['missing-shard.json'] }, 'ban', new Set(['part-0001.json'])), null,
    'Expected unknown shard references to trigger fallback');
  assert.deepEqual(filesFor({ ban: ['part-0001.json'] }, 'ban', new Set(['part-0001.json'])), ['part-0001.json'],
    'Expected valid references to known shards to be accepted');
});

test('name search falls back safely for malformed manifest index entries', () => {
  const indexedNameParts = search._test.indexedNameParts;
  assert.equal(indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: [null]
  }), null, 'Expected null name-index entries to trigger a full-scan fallback');
  assert.equal(indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: [{ prefix: 'b', file: '../outside.json' }]
  }), null, 'Expected unsafe index filenames to trigger a full-scan fallback');
  assert.equal(indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: [
      { prefix: 'b', file: 'name-index-b-1.json' },
      { prefix: 'b', file: 'name-index-b-2.json' }
    ]
  }), null, 'Expected duplicate prefixes to trigger a full-scan fallback');
  assert.equal(indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: [
      { prefix: 'b', file: manifest.parts[0].file },
      { prefix: 'e', file: manifest.nameIndexes.find(item => item.prefix === 'e')?.file || 'name-index-e.json' }
    ]
  }), null, 'Expected catalogue shards not to be accepted as name-index files');
  assert.equal(indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: [
      { prefix: 'b', file: 'shared-name-index.json' },
      { prefix: 'e', file: 'shared-name-index.json' }
    ]
  }), null, 'Expected duplicate name-index filenames to trigger a full-scan fallback');
  assert.equal(indexedNameParts('banque exemple', {
    parts: [null],
    nameIndexes: []
  }), null, 'Expected malformed shard entries to trigger a full-scan fallback');
  assert.equal(indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: []
  }), null, 'Expected missing index entries to trigger a full-scan fallback');
});

test('name search falls back to full shard scan when an index file cannot be read', () => {
  assert.equal(search._test.indexedNameParts('banque exemple', {
    parts: manifest.parts,
    nameIndexes: [{ prefix: 'b', file: '__missing_name_index_test__.json' }]
  }), null, 'Expected unreadable name-index files to trigger a full-scan fallback');
});


test('OpenFIGI fallback filters out unrelated equity candidates', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [{
        figi: 'BBG000000002',
        name: 'Example common stock',
        marketSector: 'Equity',
        securityType: 'Common Stock'
      }]
    })
  });
  try {
    const response = await search.handler({ queryStringParameters: { q: 'unrelated instrument query' } });
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(payload.source, 'openfigi');
    assert.deepEqual(payload.results, [], 'Expected equity candidates not to leak into the bond search');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenFIGI outage returns a safe unavailable response instead of throwing', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('simulated network outage'); };
  try {
    const response = await search.handler({ queryStringParameters: { q: 'BBG000B9XRY4' } });
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(payload.source, 'unavailable');
    assert.deepEqual(payload.results, []);
    assert.equal(payload.warning, 'BOND_SEARCH_UNAVAILABLE');
  } finally {
    global.fetch = originalFetch;
  }
});


test('issuer-only query scoring works when issuer metadata is available', () => {
  const record = search._test.canonicalBond({
    isin: 'FR0000047607',
    name: '2029 Senior Notes',
    issuer: 'Example International Holdings'
  });
  assert.ok(record);
  assert.ok(search._test.scoreCatalogRecord(record, 'example') > 0,
    'Expected a query matching only issuer metadata to receive a positive score');
  assert.equal(search._test.scoreCatalogRecord(record, 'unrelated'), 0,
    'Expected unrelated issuer queries not to match');
});

test('OpenFIGI fallback keeps genuine fixed-income candidates but withholds unverified terms', () => {
  const corporate = search._test.normalizeOpenFigi({
    figi: 'BBG000DEBT01',
    name: 'Example corporate notes',
    marketSector: 'Corp',
    securityType: 'CORP',
    coupon: 5.25,
    maturity: '2030-06-15'
  });
  const government = search._test.normalizeOpenFigi({
    figi: 'BBG000GOVT01',
    name: 'Example government bond',
    marketSector: 'Govt',
    securityType: 'Government'
  });

  assert.ok(corporate, 'Expected corporate debt to remain eligible for fallback search');
  assert.ok(government, 'Expected government debt to remain eligible for fallback search');
  assert.equal(corporate.status, 'CANDIDATE_NOT_VERIFIED');
  assert.equal(corporate.confidence, 'candidate-only');
  assert.equal(corporate.coupon, null, 'Expected unverified coupon terms to be withheld');
  assert.equal(corporate.maturity, null, 'Expected unverified maturity terms to be withheld');
  assert.equal(corporate.couponStatus, 'NOT_VERIFIED_EXTERNAL_SOURCE');
  assert.equal(corporate.maturityStatus, 'NOT_VERIFIED_EXTERNAL_SOURCE');
});

test('master catalogue search ranks exact names above prefixes and issuer-only matches', () => {
  const results = search._test.rankCatalogRecords([
    { figi: 'BBGISSUER001', name: 'Other instrument', issuer: 'Banque Exemple' },
    { figi: 'BBGPREFIX0001', name: 'Banque Exemple 2030', issuer: 'Different issuer' },
    { figi: 'BBGEXACT0001', name: 'Banque Exemple', issuer: 'Different issuer' },
    { figi: 'BBGUNRELATED1', name: 'Unrelated instrument', issuer: 'Other issuer' }
  ], search._test.normalize('Banque Exemple'));

  assert.deepEqual(results.map(item => item.figi), [
    'BBGEXACT0001',
    'BBGPREFIX0001',
    'BBGISSUER001'
  ], 'Expected master catalogue results to be relevance-ranked and unrelated records excluded');
});

test('master catalogue ranking puts exact short names between exact legal names and broad matches', () => {
  const results = search._test.rankCatalogRecords([
    {
      figi: 'BBGSUBSTRING1',
      name: 'Long legal instrument description containing Example Note 2030',
      shortName: 'Different short name'
    },
    {
      figi: 'BBGSHORT001',
      name: 'Long legal instrument description containing Example Note 2030',
      shortName: 'Example Note 2030'
    },
    {
      figi: 'BBGLEGAL001',
      name: 'Example Note 2030',
      shortName: 'Example Note'
    }
  ], 'example note 2030');
  assert.deepEqual(results.map(item => item.figi), [
    'BBGLEGAL001',
    'BBGSHORT001',
    'BBGSUBSTRING1'
  ], 'Expected exact legal name, exact short name, then broad substring relevance order');
});

test('master catalogue search does not match across separate fields by concatenation', () => {
  const results = search._test.rankCatalogRecords([
    { figi: 'BBGJOINED001', name: 'Banque', issuer: 'Exemple' }
  ], search._test.normalize('Banque Exemple'));

  assert.deepEqual(results, [],
    'Expected tokens split across name and issuer fields not to create a false phrase match');
});

test('ISIN prefix ranking beats a coincidental name substring', () => {
  const results = search._test.rankCatalogRecordsByIsin([
    { figi: 'BBGNAME0001', isin: 'DE0001234567', name: 'FRAB issuer notes' },
    { figi: 'BBGISIN0001', isin: 'FRAB12345678', name: 'Different issuer notes' },
    { figi: 'BBGEXACT001', isin: 'FRAB', name: 'Exact invalid sample' }
  ], 'FRAB');
  assert.deepEqual(results.map(item => item.isin), ['FRAB', 'FRAB12345678'],
    'Expected exact identifier matches to rank above partial ISIN-prefix matches and exclude unrelated name-only hits');
});

test('ISIN ranking normalizes whitespace in query and catalogue identifiers', () => {
  const results = search._test.rankCatalogRecordsByIsin([
    { figi: 'BBGSPACE001', isin: 'FR 00 123 45678', name: 'Spaced catalogue ISIN' },
    { figi: 'BBGSPACE002', isin: 'FR00987654321', name: 'Other instrument' }
  ], ' FR 00 123 45678 ');

  assert.deepEqual(results.map(item => item.figi), ['BBGSPACE001'],
    'Expected spaces in both the query and source ISIN to be ignored during identifier matching');
});

test('public search handler resolves an ISIN with embedded whitespace', async () => {
  const isin = firstIndexedIsin();
  const spacedIsin = isin.split('').join(' ');
  const response = await search.handler({ queryStringParameters: { q: spacedIsin } });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.source, 'bond-master');
  assert.ok(payload.results.some(item => item.isin === isin),
    `Expected spaced ISIN query to resolve to the exact catalogue record ${isin}`);
});

test('public search handler resolves a partial ISIN prefix with embedded whitespace', async () => {
  const isin = firstIndexedIsin();
  const prefix = isin.slice(0, 4);
  const spacedPrefix = prefix.split('').join(' ');
  const response = await search.handler({ queryStringParameters: { q: spacedPrefix } });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.source, 'bond-master');
  assert.ok(payload.results.length > 0, 'Expected a partial ISIN prefix to return catalogue candidates');
  assert.ok(payload.results.every(item => String(item.isin || '').replace(/\\s+/g, '').toUpperCase().startsWith(prefix)),
    `Expected all results to start with normalized ISIN prefix ${prefix}`);
});

test('four-character word queries fall through when no ISIN prefix matches', () => {
  const results = search._test.shardedCatalogSearch('BOND');
  assert.ok(results.length > 0, 'Expected ordinary word "BOND" to reach name search when no ISIN prefix matches');
  assert.ok(results.some(item => search._test.normalize(item.name).includes('bond')
    || search._test.normalize(item.shortName).includes('bond')
    || search._test.normalize(item.issuer).includes('bond')),
  'Expected at least one result to match the ordinary word query');
});


test('cached ISIN indexes are revalidated against the current manifest', () => {
  const readIndex = search._test.readIsinIndex;
  const realIndex = readIndex('FR', manifest);
  assert.ok(realIndex && typeof realIndex === 'object');
  const mappedFile = Object.values(realIndex)[0];
  assert.ok(mappedFile);
  const differentPart = manifest.parts.find(part => part.file !== mappedFile);
  assert.ok(differentPart);
  const changedManifest = {
    parts: [differentPart],
    isinIndexes: manifest.isinIndexes
  };
  assert.equal(readIndex('FR', changedManifest), null,
    'A cached index must not bypass validation against the current shard list');
});

test('ISIN index contents must contain only valid ISINs mapped to declared shards for their prefix', () => {
  const validate = search._test.isValidIsinIndex;
  const fakeManifest = { parts: [{ file: 'part-0001.json' }, { file: 'part-0002.json' }] };
  assert.equal(validate({ FR0000047607: 'part-0001.json' }, 'FR', fakeManifest), true);
  assert.equal(validate({ FR0000047607: 'missing-shard.json' }, 'FR', fakeManifest), false);
  assert.equal(validate({ DE0000047607: 'part-0001.json' }, 'FR', fakeManifest), false,
    'A country index must not contain identifiers for another prefix');
  assert.equal(validate({ 'not-an-isin': 'part-0001.json' }, 'FR', fakeManifest), false);
  assert.equal(validate({ FR0000047607: 'part-0001.json', broken: 'part-0002.json' }, 'FR', fakeManifest), false,
    'One malformed entry must invalidate the whole index and trigger shard scanning');
  assert.equal(validate([], 'FR', fakeManifest), false);
  assert.equal(validate({ FR0000047607: 'part-0001.json' }, 'FR', { parts: [] }), false);
});

test('ISIN index manifest rejects duplicate files and shard/index overlap', () => {
  const readIsinIndex = search._test.readIsinIndex;
  const validIndexFile = manifest.isinIndexes[0].file;
  assert.equal(readIsinIndex('FR', {
    parts: manifest.parts,
    isinIndexes: [
      { prefix: 'FR', file: validIndexFile },
      { prefix: 'DE', file: validIndexFile }
    ]
  }), null, 'Expected duplicate ISIN-index filenames to trigger fallback');
  assert.equal(readIsinIndex('FR', {
    parts: manifest.parts,
    isinIndexes: [{ prefix: 'FR', file: manifest.parts[0].file }]
  }), null, 'Expected a catalogue shard not to be accepted as an ISIN-index file');
});

test('ISIN index references must point to declared catalogue shards', () => {
  const isAllowed = search._test.isAllowedShardReference;
  const allowed = {
    parts: [{ file: 'part-0001.json' }, { file: 'part-0002.json' }]
  };

  assert.equal(isAllowed('part-0001.json', allowed), true);
  assert.equal(isAllowed('part-0002.json', allowed), true);
  assert.equal(isAllowed('manifest.json', allowed), false,
    'Expected a safe JSON filename that is not a declared shard to be rejected');
  assert.equal(isAllowed('isin-index-FR.json', allowed), false,
    'Expected index files not to be accepted as catalogue shards');
  assert.equal(isAllowed('missing-shard.json', allowed), false,
    'Expected undeclared shard references to be rejected');
  assert.equal(isAllowed('../part-0001.json', allowed), false);
  assert.equal(isAllowed(42, allowed), false);
  assert.equal(isAllowed(null, allowed), false);
});


test('ISIN shard scan fallback resolves exact identifiers without trusting the index', () => {
  const isin = firstIndexedIsin();
  const results = search._test.scanShardsByIsin(isin, manifest, true);
  assert.equal(results.length, 1);
  assert.equal(results[0].isin, isin);
});

test('ISIN shard scan fallback returns only records matching a partial prefix', () => {
  const isin = firstIndexedIsin();
  const prefix = isin.slice(0, 4);
  const results = search._test.scanShardsByIsin(prefix, manifest);
  assert.ok(results.length > 0, `Expected shard scan to find ISIN prefix ${prefix}`);
  assert.ok(results.length <= 30);
  assert.ok(results.every(item => String(item.isin || '').startsWith(prefix)),
    'Expected the fallback to exclude unrelated identifiers');
});


test('exact ISIN lookup scans shards when an indexed shard does not contain the record', () => {
  const isin = firstIndexedIsin();
  const fakeManifest = {
    parts: [{ file: 'part-0001.json' }, { file: 'part-0002.json' }]
  };
  let fallbackCalled = false;
  const expected = search._test.canonicalBond({ isin, name: 'Recovered from fallback scan' });
  const results = search._test.resolveExactIsinFromIndex(
    isin,
    fakeManifest,
    { [isin]: 'part-0001.json' },
    () => [],
    (query, receivedManifest, exact) => {
      fallbackCalled = true;
      assert.equal(query, isin);
      assert.equal(receivedManifest, fakeManifest);
      assert.equal(exact, true);
      return [expected];
    }
  );

  assert.equal(fallbackCalled, true, 'Expected a stale index hit to trigger a full shard scan');
  assert.equal(results.length, 1);
  assert.equal(results[0].isin, isin);
  assert.equal(results[0].name, 'Recovered from fallback scan');
});


test('exact ISIN lookup scans shards when the index has no entry for the identifier', () => {
  const isin = firstIndexedIsin();
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  const expected = search._test.canonicalBond({ isin, name: 'Recovered from incomplete index' });
  let fallbackCalled = false;
  const results = search._test.resolveExactIsinFromIndex(
    isin,
    fakeManifest,
    {},
    () => [],
    (query, receivedManifest, exact) => {
      fallbackCalled = true;
      assert.equal(query, isin);
      assert.equal(receivedManifest, fakeManifest);
      assert.equal(exact, true);
      return [expected];
    }
  );

  assert.equal(fallbackCalled, true, 'Expected a missing index entry to trigger the shard scan');
  assert.equal(results.length, 1);
  assert.equal(results[0].isin, isin);
  assert.equal(results[0].name, 'Recovered from incomplete index');
});

test('malformed ISIN index metadata is treated as unavailable and does not throw', () => {
  const readIndex = search._test.readIsinIndex;
  assert.equal(readIndex('FR', { isinIndexes: null }), null);
  assert.equal(readIndex('FR', { isinIndexes: 'not-an-array' }), null);
  assert.equal(readIndex('FR', { isinIndexes: { prefix: 'FR', file: 'isin-index-FR.json' } }), null);
  assert.equal(readIndex('FR', { isinIndexes: [null, 42, { prefix: 'DE', file: 'isin-index-DE.json' }] }), null);
  assert.equal(readIndex('FR', { isinIndexes: [{ prefix: '../', file: 'isin-index-FR.json' }] }), null);
  assert.equal(readIndex('FR', { isinIndexes: [{ prefix: 'FR', file: '../isin-index-FR.json' }] }), null);
  assert.equal(readIndex('FR', { isinIndexes: [
    { prefix: 'FR', file: 'isin-index-FR-a.json' },
    { prefix: 'FR', file: 'isin-index-FR-b.json' }
  ] }), null, 'Duplicate country prefixes must disable the index and trigger fallback');
});


test('ISIN prefix lookup scans shards when the index has no matching prefix entries', () => {
  const query = 'ZZ99';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  let fallbackCalled = false;
  const expected = search._test.canonicalBond({ isin: 'ZZ9912345678', name: 'Recovered partial ISIN' });
  const results = search._test.resolveIsinPrefixFromIndex(
    query,
    fakeManifest,
    { 'ZZ0012345678': 'part-0001.json' },
    () => { throw new Error('Shard reader should not be called when there are no matching entries'); },
    (receivedQuery, receivedManifest) => {
      fallbackCalled = true;
      assert.equal(receivedQuery, query);
      assert.equal(receivedManifest, fakeManifest);
      return [expected];
    }
  );
  assert.equal(fallbackCalled, true);
  assert.deepEqual(results.map(item => item.isin), ['ZZ9912345678']);
});

test('ISIN prefix lookup scans shards when indexed records are missing from their shard', () => {
  const query = 'FR12';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }, { file: 'part-0002.json' }] };
  let fallbackCalled = false;
  const expected = search._test.canonicalBond({ isin: 'FR1234567890', name: 'Recovered stale partial ISIN' });
  const results = search._test.resolveIsinPrefixFromIndex(
    query,
    fakeManifest,
    { 'FR1234567890': 'part-0001.json' },
    () => [],
    (receivedQuery, receivedManifest) => {
      fallbackCalled = true;
      assert.equal(receivedQuery, query);
      assert.equal(receivedManifest, fakeManifest);
      return [expected];
    }
  );
  assert.equal(fallbackCalled, true);
  assert.deepEqual(results.map(item => item.isin), ['FR1234567890']);
});


test('ISIN prefix lookup ignores malformed keys in the index and recovers from shards', () => {
  const query = 'FR00';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  let fallbackCalled = false;
  const expected = search._test.canonicalBond({ isin: 'FR0000047607', name: 'Recovered valid ISIN' });
  const results = search._test.resolveIsinPrefixFromIndex(
    query,
    fakeManifest,
    { 'FRAB12345678': 'part-0001.json' },
    () => { throw new Error('Malformed index key must not be trusted'); },
    (receivedQuery, receivedManifest) => {
      fallbackCalled = true;
      assert.equal(receivedQuery, query);
      assert.equal(receivedManifest, fakeManifest);
      return [expected];
    }
  );
  assert.equal(fallbackCalled, true);
  assert.deepEqual(results.map(item => item.isin), ['FR0000047607']);
});

test('ISIN prefix lookup ignores malformed keys when valid indexed entries exist', () => {
  const query = 'FR00';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  const record = { isin: 'FR0000047607', name: 'Valid indexed ISIN' };
  let fallbackCalled = false;
  const results = search._test.resolveIsinPrefixFromIndex(
    query,
    fakeManifest,
    {
      'FRAB12345678': 'part-0001.json',
      'FR0000047607': 'part-0001.json'
    },
    () => [record],
    () => {
      fallbackCalled = true;
      throw new Error('A valid indexed entry should avoid fallback scanning');
    }
  );
  assert.equal(fallbackCalled, false);
  assert.deepEqual(results.map(item => item.isin), ['FR0000047607']);
});

test('ISIN shard scan excludes malformed identifiers from catalogue records', () => {
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  const records = [
    { isin: 'FR1234567890', name: 'Valid ISIN' },
    { isin: 'FRAB', name: 'Malformed short identifier' },
    { isin: 'FR123456789X', name: 'Malformed check digit' }
  ];
  const results = search._test.scanShardsByIsin('FR', fakeManifest, false, () => records);
  assert.deepEqual(results.map(item => item.isin), ['FR1234567890']);
});


test('ISIN prefix lookup normalizes whitespace in shard records before comparing indexed identifiers', () => {
  const query = 'FR12';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  const results = search._test.resolveIsinPrefixFromIndex(
    query,
    fakeManifest,
    { 'FR1234567890': 'part-0001.json' },
    () => [{ isin: 'FR12 34567890', name: 'Whitespace ISIN example' }],
    () => { throw new Error('A normalized indexed hit should not need a fallback scan'); }
  );

  assert.deepEqual(results.map(item => item.isin), ['FR1234567890']);
  assert.equal(results[0].name, 'Whitespace ISIN example');
});


test('exact ISIN lookup normalizes whitespace in the indexed shard record', () => {
  const isin = 'FR0000047607';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  let fallbackCalled = false;
  const results = search._test.resolveExactIsinFromIndex(
    isin,
    fakeManifest,
    { [isin]: 'part-0001.json' },
    () => [{ isin: ' FR00\t00047607\n', name: 'Whitespace exact ISIN example' }],
    () => {
      fallbackCalled = true;
      throw new Error('A valid indexed record should not require a full shard scan');
    }
  );

  assert.equal(fallbackCalled, false);
  assert.deepEqual(results.map(item => item.isin), [isin]);
  assert.equal(results[0].name, 'Whitespace exact ISIN example');
});


test('exact ISIN lookup falls back when the index points outside declared catalogue shards', () => {
  const isin = 'FR0000047607';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  let fallbackCalled = false;
  const expected = search._test.canonicalBond({ isin, name: 'Recovered from safe fallback' });
  const results = search._test.resolveExactIsinFromIndex(
    isin,
    fakeManifest,
    { [isin]: '../manifest.json' },
    () => { throw new Error('Untrusted index reference must never be read'); },
    (query, receivedManifest, exact) => {
      fallbackCalled = true;
      assert.equal(query, isin);
      assert.equal(receivedManifest, fakeManifest);
      assert.equal(exact, true);
      return [expected];
    }
  );

  assert.equal(fallbackCalled, true);
  assert.deepEqual(results.map(item => item.isin), [isin]);
  assert.equal(results[0].name, 'Recovered from safe fallback');
});


test('ISIN prefix lookup falls back when an index entry points outside declared catalogue shards', () => {
  const query = 'FR00';
  const fakeManifest = { parts: [{ file: 'part-0001.json' }] };
  let fallbackCalled = false;
  const expected = search._test.canonicalBond({ isin: 'FR0000047607', name: 'Recovered partial ISIN from safe fallback' });
  const results = search._test.resolveIsinPrefixFromIndex(
    query,
    fakeManifest,
    { 'FR0000047607': '../manifest.json' },
    () => { throw new Error('Untrusted index reference must never be read'); },
    (receivedQuery, receivedManifest) => {
      fallbackCalled = true;
      assert.equal(receivedQuery, query);
      assert.equal(receivedManifest, fakeManifest);
      return [expected];
    }
  );

  assert.equal(fallbackCalled, true);
  assert.deepEqual(results.map(item => item.isin), ['FR0000047607']);
  assert.equal(results[0].name, 'Recovered partial ISIN from safe fallback');
});


test('catalogue manifest accepts only unique declared shard filenames', () => {
  const validate = search._test.isValidManifestParts;
  assert.equal(validate([{ file: 'part-0001.json' }, { file: 'part-0002.json' }]), true);
  assert.equal(validate([]), false);
  assert.equal(validate(null), false);
  assert.equal(validate([{ file: 'manifest.json' }]), false);
  assert.equal(validate([{ file: 'isin-index-FR.json' }]), false);
  assert.equal(validate([{ file: '../part-0001.json' }]), false);
  assert.equal(validate([{ file: 'part-0001.json' }, { file: 'part-0001.json' }]), false,
    'Duplicate shard filenames must be rejected to avoid ambiguous scans');
  assert.equal(validate([{ file: 'part-1.json' }]), false,
    'Shard filenames must follow the generated catalogue naming convention');
});


function loadInvestmentSearchPage(fetchImpl) {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'investissement.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(script => script.trim());
  const elements = Object.fromEntries(['status', 'results', 'q', 'search'].map(id => [id, {
    value: '', disabled: false, innerHTML: '', textContent: '',
    addEventListener() {}
  }]));
  const context = {
    document: { getElementById: id => elements[id] },
    elements,
    fetch: fetchImpl,
    console: { warn() {}, error() {} },
    Map, Set, Promise
  };
  vm.runInNewContext(scripts[scripts.length - 1] + '\nglobalThis.__investmentSearchTest = { getIndex, searchLocal, doSearch, elements };', context);
  return context.__investmentSearchTest;
}

test('investment page rejects ISIN index references outside declared catalogue shards', async () => {
  const page = loadInvestmentSearchPage(async () => ({
    ok: true,
    json: async () => ({ 'FR0000047607': '../manifest.json' })
  }));
  const manifest = {
    parts: [{ file: 'part-0001.json' }],
    isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
  };
  assert.equal(await page.getIndex('FR', manifest), null);
});

test('investment page revalidates cached ISIN indexes against the current manifest', async () => {
  const page = loadInvestmentSearchPage(async () => ({
    ok: true,
    json: async () => ({ 'FR0000047607': 'part-0001.json' })
  }));
  const firstManifest = {
    parts: [{ file: 'part-0001.json' }],
    isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
  };
  const changedManifest = {
    parts: [{ file: 'part-0002.json' }],
    isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
  };
  assert.ok(await page.getIndex('FR', firstManifest));
  assert.equal(await page.getIndex('FR', changedManifest), null);
});

test('investment page actually calls server search when an ISIN prefix has no indexed matches', async () => {
  const manifest = {
    parts: [{ file: 'part-0001.json' }],
    isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
  };
  const requests = [];
  const page = loadInvestmentSearchPage(async url => {
    requests.push(url);
    if (url.endsWith('manifest.json')) {
      return { ok: true, json: async () => manifest };
    }
    if (url.endsWith('isin-index-FR.json')) {
      return { ok: true, json: async () => ({ 'FR0000047607': 'part-0001.json' }) };
    }
    if (url.includes('/.netlify/functions/bond-search?')) {
      return {
        ok: true,
        json: async () => ({
          source: 'bond-master',
          results: [{ isin: 'FR9900000001', name: 'Server fallback bond', source: 'Catalogue ESMA' }]
        })
      };
    }
    throw new Error('Unexpected URL: ' + url);
  });
  page.elements.q.value = 'FR99';

  await page.doSearch();

  assert.ok(requests.some(url => url.includes('/.netlify/functions/bond-search?q=FR99')),
    'A valid index with no prefix matches must fall back to the server endpoint');
  assert.match(page.elements.status.textContent, /1 résultat/);
  assert.match(page.elements.results.innerHTML, /Server fallback bond/);
  assert.equal(page.elements.search.disabled, false);
});


test('investment page renders exact and partial ISIN matches from the local indexed catalogue', async () => {
  const manifest = {
    parts: [{ file: 'part-0001.json' }],
    isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
  };
  const index = {
    FR0000047607: 'part-0001.json',
    FR0000047615: 'part-0001.json'
  };
  const shard = [
    { isin: 'FR0000047607', name: 'Local indexed bond one', issuer: 'Example issuer' },
    { isin: 'FR0000047615', name: 'Local indexed bond two', issuer: 'Example issuer' }
  ];

  for (const query of ['FR0000047607', 'FR0000']) {
    const requests = [];
    const page = loadInvestmentSearchPage(async url => {
      requests.push(url);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => manifest };
      if (url.endsWith('isin-index-FR.json')) return { ok: true, json: async () => index };
      if (url.endsWith('part-0001.json')) return { ok: true, json: async () => shard };
      throw new Error('Unexpected URL: ' + url);
    });
    page.elements.q.value = query;

    await page.doSearch();

    assert.match(page.elements.status.textContent, /résultat\(s\) dans le catalogue ESMA/);
    assert.match(page.elements.results.innerHTML, /Local indexed bond one/);
    assert.ok(!requests.some(url => url.includes('/.netlify/functions/bond-search?')),
      'Valid exact and partial ISIN matches should be served locally without a remote fallback');
    if (query === 'FR0000047607') {
      assert.doesNotMatch(page.elements.results.innerHTML, /Local indexed bond two/);
    } else {
      assert.match(page.elements.results.innerHTML, /Local indexed bond two/);
    }
    assert.equal(page.elements.search.disabled, false);
  }
});


test('investment page falls back to server search when the local catalogue cannot load', async () => {
  const requests = [];
  const page = loadInvestmentSearchPage(async url => {
    requests.push(url);
    if (url.endsWith('manifest.json')) throw new Error('Simulated local catalogue outage');
    if (url.includes('/.netlify/functions/bond-search?')) {
      return {
        ok: true,
        json: async () => ({
          source: 'Test server',
          results: [{
            isin: 'FR0000047607',
            name: 'Server fallback bond',
            source: 'Test server',
            confidence: 'catalog-record'
          }]
        })
      };
    }
    throw new Error('Unexpected URL: ' + url);
  });

  page.elements.q.value = 'FR0000047607';
  await page.doSearch();

  assert.ok(requests.some(url => url.includes('/.netlify/functions/bond-search?')),
    'Expected server search to run when the local manifest cannot be loaded');
  assert.match(page.elements.results.innerHTML, /Server fallback bond/);
  assert.match(page.elements.status.textContent, /1 résultat\(s\) via Test server/);
  assert.equal(page.elements.search.disabled, false);
});


test('investment page reports a server outage cleanly and re-enables search', async () => {
  const requests = [];
  const page = loadInvestmentSearchPage(async url => {
    requests.push(url);
    if (url.endsWith('manifest.json')) throw new Error('Simulated local catalogue outage');
    if (url.includes('/.netlify/functions/bond-search?')) throw new Error('Simulated server outage');
    throw new Error('Unexpected URL: ' + url);
  });

  page.elements.q.value = 'FR0000047607';
  await page.doSearch();

  assert.ok(requests.some(url => url.includes('/.netlify/functions/bond-search?')),
    'Expected a server fallback attempt');
  assert.match(page.elements.status.textContent, /Recherche indisponible/);
  assert.match(page.elements.results.innerHTML, /Impossible de joindre le service de recherche/);
  assert.equal(page.elements.search.disabled, false);
});


test('investment page routes ordinary bond-name queries to server search', async () => {
  const requests = [];
  const page = loadInvestmentSearchPage(async url => {
    requests.push(url);
    if (url.includes('/.netlify/functions/bond-search?')) {
      assert.ok(url.includes('q=Example%20Issuer') || url.includes('q=Example+Issuer'),
        'Expected the name query to be URL-encoded');
      return {
        ok: true,
        json: async () => ({
          source: 'bond-master',
          results: [{
            isin: 'FR0000047607',
            name: 'Example Issuer 2030',
            issuer: 'Example Issuer',
            source: 'ESMA FIRDS'
          }]
        })
      };
    }
    throw new Error('Ordinary name searches should not fetch the local ISIN index: ' + url);
  });

  page.elements.q.value = 'Example Issuer';
  await page.doSearch();

  assert.equal(requests.length, 1);
  assert.ok(requests[0].includes('/.netlify/functions/bond-search?'));
  assert.match(page.elements.results.innerHTML, /Example Issuer 2030/);
  assert.match(page.elements.status.textContent, /1 résultat\(s\) via bond-master/);
  assert.equal(page.elements.search.disabled, false);
});


test('investment page retries loading the local manifest after a transient outage', async () => {
  let manifestAttempts = 0;
  const page = loadInvestmentSearchPage(async url => {
    if (url.endsWith('manifest.json')) {
      manifestAttempts += 1;
      if (manifestAttempts === 1) throw new Error('Temporary manifest outage');
      return {
        ok: true,
        json: async () => ({
          parts: [{ file: 'part-0001.json' }],
          isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
        })
      };
    }
    if (url.endsWith('isin-index-FR.json')) {
      return { ok: true, json: async () => ({ 'FR0000047607': 'part-0001.json' }) };
    }
    if (url.endsWith('part-0001.json')) {
      return {
        ok: true,
        json: async () => [{ isin: 'FR0000047607', name: 'Recovered local bond' }]
      };
    }
    if (url.includes('/.netlify/functions/bond-search?')) {
      return {
        ok: true,
        json: async () => ({ source: 'bond-master', results: [] })
      };
    }
    throw new Error('Unexpected URL: ' + url);
  });

  page.elements.q.value = 'FR0000047607';
  await page.doSearch();
  assert.match(page.elements.status.textContent, /0 résultat\(s\) via bond-master/);
  assert.equal(page.elements.search.disabled, false);

  await page.doSearch();
  assert.equal(manifestAttempts, 2, 'A failed manifest request must not stay cached forever');
  assert.match(page.elements.status.textContent, /résultat\(s\) dans le catalogue ESMA/);
  assert.match(page.elements.results.innerHTML, /Recovered local bond/);
  assert.equal(page.elements.search.disabled, false);
});


test('investment page retries loading a catalogue shard after a transient outage', async () => {
  let shardAttempts = 0;
  const page = loadInvestmentSearchPage(async url => {
    if (url.endsWith('manifest.json')) {
      return {
        ok: true,
        json: async () => ({
          parts: [{ file: 'part-0001.json' }],
          isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
        })
      };
    }
    if (url.endsWith('isin-index-FR.json')) {
      return { ok: true, json: async () => ({ 'FR0000047607': 'part-0001.json' }) };
    }
    if (url.endsWith('part-0001.json')) {
      shardAttempts += 1;
      if (shardAttempts === 1) throw new Error('Temporary shard outage');
      return {
        ok: true,
        json: async () => [{ isin: 'FR0000047607', name: 'Recovered shard bond' }]
      };
    }
    if (url.includes('/.netlify/functions/bond-search?')) {
      return {
        ok: true,
        json: async () => ({ source: 'bond-master', results: [] })
      };
    }
    throw new Error('Unexpected URL: ' + url);
  });

  page.elements.q.value = 'FR0000047607';
  await page.doSearch();
  assert.match(page.elements.status.textContent, /0 résultat\(s\) via bond-master/);
  assert.equal(page.elements.search.disabled, false);

  await page.doSearch();
  assert.equal(shardAttempts, 2, 'A failed shard request must be removed from the cache');
  assert.match(page.elements.status.textContent, /1 résultat\(s\) dans le catalogue ESMA/);
  assert.match(page.elements.results.innerHTML, /Recovered shard bond/);
  assert.equal(page.elements.search.disabled, false);
});

test('investment page retries an ordinary name search after a transient server outage', async () => {
  let serverAttempts = 0;
  const page = loadInvestmentSearchPage(async url => {
    if (!url.includes('/.netlify/functions/bond-search?')) {
      throw new Error('Ordinary name searches should not depend on local catalogue files: ' + url);
    }
    serverAttempts += 1;
    if (serverAttempts === 1) throw new Error('Temporary server outage');
    return {
      ok: true,
      json: async () => ({
        source: 'bond-master',
        results: [{
          isin: 'FR0000047607',
          name: 'Recovered Example Issuer 2030',
          source: 'ESMA FIRDS'
        }]
      })
    };
  });

  page.elements.q.value = 'Example Issuer';
  await page.doSearch();
  assert.match(page.elements.status.textContent, /Recherche indisponible/);
  assert.equal(page.elements.search.disabled, false);

  await page.doSearch();
  assert.equal(serverAttempts, 2, 'A failed server search must not block a later retry');
  assert.match(page.elements.status.textContent, /1 résultat\(s\) via bond-master/);
  assert.match(page.elements.results.innerHTML, /Recovered Example Issuer 2030/);
  assert.equal(page.elements.search.disabled, false);
});

test('investment page retries loading an ISIN index after a transient outage', async () => {
  let indexAttempts = 0;
  const page = loadInvestmentSearchPage(async url => {
    if (url.endsWith('manifest.json')) {
      return {
        ok: true,
        json: async () => ({
          parts: [{ file: 'part-0001.json' }],
          isinIndexes: [{ prefix: 'FR', file: 'isin-index-FR.json' }]
        })
      };
    }
    if (url.endsWith('isin-index-FR.json')) {
      indexAttempts += 1;
      if (indexAttempts === 1) throw new Error('Temporary ISIN index outage');
      return { ok: true, json: async () => ({ 'FR0000047607': 'part-0001.json' }) };
    }
    if (url.endsWith('part-0001.json')) {
      return {
        ok: true,
        json: async () => [{ isin: 'FR0000047607', name: 'Recovered indexed bond' }]
      };
    }
    if (url.includes('/.netlify/functions/bond-search?')) {
      return {
        ok: true,
        json: async () => ({ source: 'bond-master', results: [] })
      };
    }
    throw new Error('Unexpected URL: ' + url);
  });

  page.elements.q.value = 'FR0000047607';
  await page.doSearch();
  assert.match(page.elements.status.textContent, /0 résultat\(s\) via bond-master/);
  assert.equal(page.elements.search.disabled, false);

  await page.doSearch();
  assert.equal(indexAttempts, 2, 'A failed ISIN index request must be removed from the cache');
  assert.match(page.elements.status.textContent, /1 résultat\(s\) dans le catalogue ESMA/);
  assert.match(page.elements.results.innerHTML, /Recovered indexed bond/);
  assert.equal(page.elements.search.disabled, false);
});

test('investment page handles HTTP and invalid-JSON server responses without locking search', async () => {
  const scenarios = [
    {
      name: 'HTTP error',
      response: async () => ({ ok: false, status: 503, json: async () => ({}) })
    },
    {
      name: 'invalid JSON',
      response: async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } })
    }
  ];

  for (const scenario of scenarios) {
    const requests = [];
    const page = loadInvestmentSearchPage(async url => {
      requests.push(url);
      if (!url.includes('/.netlify/functions/bond-search?')) {
        throw new Error('Name search should use the server endpoint only: ' + url);
      }
      return scenario.response();
    });

    page.elements.q.value = 'Example Issuer';
    await page.doSearch();

    assert.equal(requests.length, 1, `${scenario.name}: expected one server request`);
    assert.match(page.elements.status.textContent, /Recherche indisponible/,
      `${scenario.name}: expected a safe unavailable status`);
    assert.match(page.elements.results.innerHTML, /Impossible de joindre le service de recherche/,
      `${scenario.name}: expected a clear fallback message`);
    assert.equal(page.elements.search.disabled, false,
      `${scenario.name}: search must be re-enabled`);
  }
});
