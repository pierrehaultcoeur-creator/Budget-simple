const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'bond-catalog.json');
const SHARDED_DIR = path.join(__dirname, '..', '..', 'data', 'bonds-catalog');
const MANIFEST_PATH = path.join(SHARDED_DIR, 'manifest.json');
const SHARD_CACHE = new Map();
const ISIN_INDEX_CACHE = new Map();
const NAME_INDEX_CACHE = new Map();
const MAX_SHARD_CACHE = 3;
const MAX_ISIN_INDEX_CACHE = 3;
const MAX_NAME_INDEX_CACHE = 3;
const OPENFIGI_URL = 'https://api.openfigi.com/v3/filter';
const MAX_RESULTS = 30;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=300'
    },
    body: JSON.stringify(body)
  };
}

function normalize(value) {
  return String(value || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readCatalog() {
  try {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.records) ? data.records : [];
  } catch { return []; }
}
function readManifest() {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(manifest.parts) ? manifest : null;
  } catch { return null; }
}
function readShard(filename) {
  if (SHARD_CACHE.has(filename)) return SHARD_CACHE.get(filename);
  try {
    const payload = JSON.parse(fs.readFileSync(path.join(SHARDED_DIR, filename), 'utf8'));
    const records = Array.isArray(payload.records) ? payload.records : [];
    SHARD_CACHE.set(filename, records);
    while (SHARD_CACHE.size > MAX_SHARD_CACHE) SHARD_CACHE.delete(SHARD_CACHE.keys().next().value);
    return records;
  } catch (error) {
    console.error('Unable to read bond catalogue shard', filename, error);
    return [];
  }
}
function readIsinIndex(prefix, manifest) {
  const entry = (manifest.isinIndexes || []).find(item => item.prefix === prefix);
  if (!entry || !entry.file) return null;
  if (ISIN_INDEX_CACHE.has(entry.file)) return ISIN_INDEX_CACHE.get(entry.file);
  try {
    const index = JSON.parse(fs.readFileSync(path.join(SHARDED_DIR, entry.file), 'utf8'));
    if (!index || typeof index !== 'object' || Array.isArray(index)) return null;
    ISIN_INDEX_CACHE.set(entry.file, index);
    while (ISIN_INDEX_CACHE.size > MAX_ISIN_INDEX_CACHE) {
      ISIN_INDEX_CACHE.delete(ISIN_INDEX_CACHE.keys().next().value);
    }
    return index;
  } catch (error) {
    console.error('Unable to read bond ISIN index', entry.file, error);
    return null;
  }
}
function cfiGroupLabel(group) {
  const labels = {
    DA: 'Titre adossé à des actifs (ABS)',
    DB: 'Obligation classique (CFI DB)',
    DC: 'Obligation convertible',
    DD: 'Certificat représentatif de dette',
    DE: 'Produit structuré sans protection du capital',
    DG: 'Titre adossé à des créances hypothécaires (MBS)',
    DM: 'Autre instrument de dette',
    DN: 'Obligation municipale',
    DS: 'Produit structuré avec protection du capital',
    DT: 'Medium-term note',
    DW: 'Obligation avec bons de souscription',
    DY: 'Autre instrument de dette'
  };
  return labels[String(group || '').slice(0, 2).toUpperCase()] || 'Instrument de dette — classification CFI à vérifier';
}

function isValidIsoDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function canonicalBond(record) {
  if (typeof record === 'string') record = { isin: record };
  if (!record || typeof record !== 'object') return null;
  const isin = String(record.isin || record.ISIN || record.isinCode || '').replace(/\s+/g, '').toUpperCase();
  if (!isin) return null;
  const name = record.name || record.instrumentName || record.nameOfFinancialInstrument || null;
  const sourceMaturity = record.maturity || record.maturityDate || null;
  const sourceMaturityText = String(sourceMaturity || '').trim();
  const maturityDateValidity = isValidIsoDate(sourceMaturityText);
  const maturityIsInvalidIsoDate = maturityDateValidity === false;
  const maturityIsSentinel = ['9999-12-31', '9999-12-30', '0000-00-00'].includes(sourceMaturityText);
  const maturitySourceValue = record.maturitySourceValue || record.maturityDateRaw
    || (maturityIsSentinel || maturityIsInvalidIsoDate ? sourceMaturity : null);
  // Invalid or sentinel source values must override upstream status labels:
  // a contradictory "verified" status must never make an unusable date look trusted.
  const maturityStatus = maturityIsSentinel
    ? 'SENTINEL_UNSPECIFIED'
    : maturityIsInvalidIsoDate
      ? 'INVALID_SOURCE_VALUE'
      : (record.maturityStatus || record.maturityDateStatus || null);
  const unusableMaturityStatuses = new Set(['SENTINEL_UNSPECIFIED', 'INVALID_SOURCE_VALUE', 'NOT_VERIFIED_EXTERNAL_SOURCE']);
  const maturity = unusableMaturityStatuses.has(maturityStatus) || maturityIsSentinel || maturityIsInvalidIsoDate ? null : sourceMaturity;
  const sourceCoupon = record.coupon ?? record.couponRate ?? null;
  const sourceCouponText = sourceCoupon == null ? '' : String(sourceCoupon).trim();
  const parsedCoupon = sourceCouponText ? Number(sourceCouponText.replace(',', '.')) : null;
  const couponIsInvalid = sourceCouponText !== '' && !Number.isFinite(parsedCoupon);
  const couponIsSuspicious = sourceCouponText !== '' && Number.isFinite(parsedCoupon)
    && (parsedCoupon < -100 || parsedCoupon > 100);
  // Defend the public response even when a caller supplies no quality status.
  // ESMA coupon values are percentages; never silently rescale suspicious values.
  const couponStatus = couponIsInvalid
    ? 'INVALID_SOURCE_VALUE'
    : couponIsSuspicious
      ? 'SUSPICIOUS_SOURCE_VALUE'
      : (record.couponStatus || record.couponRateStatus || null);
  const unusableCouponStatuses = new Set(['SUSPICIOUS_SOURCE_VALUE', 'INVALID_SOURCE_VALUE', 'NOT_VERIFIED_EXTERNAL_SOURCE']);
  const coupon = !sourceCouponText || unusableCouponStatuses.has(couponStatus) ? null : sourceCoupon;
  const couponSourceValue = record.couponSourceValue || record.couponRateRaw
    || (couponIsInvalid || couponIsSuspicious ? sourceCoupon : null);
  return {
    type: 'bond', assetClass: 'debt-instrument',
    instrumentGroup: record.instrumentGroup || record.cfiGroup || (record.cfi ? String(record.cfi).slice(0, 2) : null),
    instrumentLabel: cfiGroupLabel(record.instrumentGroup || record.cfiGroup || (record.cfi ? String(record.cfi).slice(0, 2) : null)),
    instrumentType: record.instrumentType || null, cfi: record.cfi || null,
    id: record.id || record.figi || isin, figi: record.figi || null, isin,
    name: name || `Instrument de dette — ${isin}`,
    shortName: record.shortName || record.short_name || null,
    issuerLei: record.issuerLei || record.issuerLEI || null,
    issuer: record.issuer || record.issuerName || null,
    issuerCountry: record.issuerCountry || record.countryOfIssuer || null,
    currency: record.currency || record.tradingCurrency || null,
    coupon,
    couponStatus,
    couponSourceValue,
    couponType: record.couponType || null, couponFrequency: record.couponFrequency || null,
    issueDate: record.issueDate || null, maturity,
    maturityStatus,
    maturitySourceValue,
    nominalValue: record.nominalValue ?? null, bondType: record.bondType || record.securityType || record.instrumentType || null,
    status: record.status || 'IDENTIFIER_ONLY', market: record.market || null,
    mic: record.mic || record.marketMic || record.micCode || null,
    symbol: isin, exchange: record.mic || record.marketMic || record.micCode || record.market || 'ISIN',
    source: name ? 'ESMA debt instrument catalogue' : 'ESMA debt ISIN catalogue',
    sourceUpdatedAt: record.sourceUpdatedAt || null,
    confidence: name ? 'catalog-record' : 'isin-only'
  };
}
function exactIsinSearch(isin) {
  if (!ISIN_RE.test(isin)) return null;
  const manifest = readManifest();
  if (!manifest) return null;
  const index = readIsinIndex(isin.slice(0, 2), manifest);
  if (!index) return null;
  const shardName = index[isin];
  if (!shardName) return [];
  const record = readShard(shardName).find(raw => {
    const value = String(raw?.isin || raw?.ISIN || raw?.isinCode || '').replace(/\s+/g, '').toUpperCase();
    return value === isin;
  });
  const result = canonicalBond(record);
  return result ? [result] : [];
}
function indexedIsinPrefixSearch(query, manifest) {
  if (!/^[A-Z]{2}[A-Z0-9]{2,10}$/.test(query)) return null;
  const index = readIsinIndex(query.slice(0, 2), manifest);
  if (!index) return null;
  const matches = Object.entries(index)
    .filter(([isin]) => isin.startsWith(query))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_RESULTS);
  if (!matches.length) return [];
  const byShard = new Map();
  for (const [isin, filename] of matches) {
    if (!byShard.has(filename)) byShard.set(filename, new Set());
    byShard.get(filename).add(isin);
  }
  const results = [];
  for (const [filename, isins] of byShard) {
    for (const raw of readShard(filename)) {
      const isin = String(raw?.isin || raw?.ISIN || raw?.isinCode || '').replace(/\s+/g, '').toUpperCase();
      if (isins.has(isin)) {
        const item = canonicalBond(raw);
        if (item) results.push(item);
      }
    }
  }
  return results.slice(0, MAX_RESULTS);
}
function readNameIndex(file) {
  if (!file) return null;
  if (NAME_INDEX_CACHE.has(file)) {
    const value = NAME_INDEX_CACHE.get(file);
    NAME_INDEX_CACHE.delete(file);
    NAME_INDEX_CACHE.set(file, value);
    return value;
  }
  try {
    const value = JSON.parse(fs.readFileSync(path.join(SHARDED_DIR, file), 'utf8'));
    NAME_INDEX_CACHE.set(file, value);
    while (NAME_INDEX_CACHE.size > MAX_NAME_INDEX_CACHE) NAME_INDEX_CACHE.delete(NAME_INDEX_CACHE.keys().next().value);
    return value;
  } catch { return null; }
}
function indexedNameParts(key, manifest) {
  if (key.length < 3 || !Array.isArray(manifest.nameIndexes)) return null;

  // Match each searchable token independently so reordered terms remain searchable.
  // Intersecting the shard sets for each token's trigrams reduces work without
  // requiring the tokens to appear next to each other in the same order.
  const tokens = [...new Set(key.split(' ').filter(token => token.length >= 3))];
  if (!tokens.length) return null;

  let candidateFiles = null;
  for (const token of tokens) {
    let tokenFiles = null;
    for (let i = 0; i <= token.length - 3; i += 1) {
      const gram = token.slice(i, i + 3);
      const entry = manifest.nameIndexes.find(item => item.prefix === gram[0]);
      // If the index structure or file is unavailable, fall back to scanning
      // all shards rather than silently hiding valid name matches.
      if (!entry) return null;
      const index = readNameIndex(entry.file);
      if (!index || typeof index !== 'object' || Array.isArray(index)) return null;
      if (!Array.isArray(index[gram])) return [];
      const gramFiles = new Set(index[gram]);
      tokenFiles = tokenFiles === null
        ? gramFiles
        : new Set([...tokenFiles].filter(file => gramFiles.has(file)));
      if (!tokenFiles.size) return [];
    }
    candidateFiles = candidateFiles === null
      ? tokenFiles
      : new Set([...candidateFiles].filter(file => tokenFiles.has(file)));
    if (!candidateFiles.size) return [];
  }
  return manifest.parts.filter(part => candidateFiles.has(part.file));
}

function distinctTokenPrefixMatch(queryTokens, targetTokens) {
  // Every query token must match a different target token. Assign the
  // most constrained query tokens first so prefix overlaps remain reliable.
  const candidates = queryTokens.map(token => targetTokens
    .map((part, index) => part.startsWith(token) ? index : -1)
    .filter(index => index >= 0));
  if (candidates.some(indices => indices.length === 0)) return false;
  const order = candidates.map((indices, index) => ({ indices, index }))
    .sort((a, b) => a.indices.length - b.indices.length);
  const used = new Set();
  function assign(position) {
    if (position === order.length) return true;
    for (const targetIndex of order[position].indices) {
      if (used.has(targetIndex)) continue;
      used.add(targetIndex);
      if (assign(position + 1)) return true;
      used.delete(targetIndex);
    }
    return false;
  }
  return assign(0);
}

function scoreCatalogRecord(item, key) {
  const name = normalize(item.name);
  const shortName = normalize(item.shortName);
  const issuer = normalize(item.issuer);
  const isin = normalize(item.isin);
  const figi = normalize(item.figi);
  if (name && name === key) return 1000;
  if (name && name.startsWith(key)) return 800;
  if (name && name.includes(key)) return 600;
  // Allow users to find the same instrument when they type its name tokens
  // in a different order, while keeping contiguous name matches higher ranked.
  const queryTokens = [...new Set(key.split(' ').filter(Boolean))];
  const nameTokens = name.split(' ').filter(Boolean);
  const issuerTokens = issuer.split(' ').filter(Boolean);
  if (queryTokens.length > 1 && queryTokens.every(token => nameTokens.includes(token))) return 550;
  if (queryTokens.length > 1 && queryTokens.every(token => token.length >= 3) && distinctTokenPrefixMatch(queryTokens, nameTokens)) return 525;
  if (shortName && shortName === key) return 575;
  if (shortName && shortName.startsWith(key)) return 475;
  if (shortName && shortName.includes(key)) return 375;
  if (issuer && issuer === key) return 500;
  if (issuer && issuer.startsWith(key)) return 450;
  if (issuer && issuer.includes(key)) return 400;
  if (queryTokens.length > 1 && queryTokens.every(token => issuerTokens.includes(token))) return 350;
  if (queryTokens.length > 1 && queryTokens.every(token => token.length >= 3) && distinctTokenPrefixMatch(queryTokens, issuerTokens)) return 325;
  if (isin && isin.includes(key)) return 300;
  if (figi && figi.includes(key)) return 200;
  return 0;
}
function isFigiLikeQuery(value) {
  // FIGIs commonly use the BBG prefix. Route full and partial FIGI queries
  // around ISIN/name indexes so identifier matches are not filtered out.
  return /^BBG[A-Z0-9]{0,9}$/.test(String(value || '').replace(/\s+/g, '').toUpperCase());
}
function shouldSearchShardedCatalog(value) {
  return !isFigiLikeQuery(value);
}

function shardedCatalogSearch(q) {
  const manifest = readManifest();
  if (!manifest) return [];
  const key = normalize(q);
  const isinQuery = String(q || '').replace(/\s+/g, '').toUpperCase();
  const exact = exactIsinSearch(isinQuery);
  if (exact !== null) return exact;
  const figiQuery = isFigiLikeQuery(isinQuery);
  const prefixResults = figiQuery ? null : indexedIsinPrefixSearch(isinQuery, manifest);
  if (prefixResults !== null) return prefixResults;
  if (!manifest.hasSearchableNames && !/^[A-Z0-9]{4,12}$/.test(isinQuery)) return [];
  const indexedParts = figiQuery ? null : indexedNameParts(key, manifest);
  const partsToSearch = indexedParts === null ? manifest.parts : indexedParts;
  const ranked = [];
  for (const part of partsToSearch) {
    for (const raw of readShard(part.file)) {
      const item = canonicalBond(raw);
      if (!item) continue;
      const score = scoreCatalogRecord(item, key);
      if (score > 0) ranked.push({ item, score });
    }
  }
  ranked.sort((a, b) => b.score - a.score
    || String(a.item.name || '').localeCompare(String(b.item.name || ''), 'en'));
  return ranked.slice(0, MAX_RESULTS).map(entry => entry.item);
}
function publicBond(record) {
  if (!record || !record.figi || !record.name) return null;
  return {
    type: 'bond',
    id: record.id || record.figi,
    figi: record.figi,
    isin: record.isin || null,
    name: record.name,
    shortName: record.shortName || null,
    issuerLei: record.issuerLei || null,
    issuer: record.issuer || null,
    issuerCountry: record.issuerCountry || null,
    currency: record.currency || null,
    coupon: record.coupon ?? null,
    couponStatus: record.couponStatus || null,
    couponSourceValue: record.couponSourceValue || null,
    couponType: record.couponType || null,
    couponFrequency: record.couponFrequency || null,
    issueDate: record.issueDate || null,
    maturity: record.maturity || null,
    maturityStatus: record.maturityStatus || null,
    maturitySourceValue: record.maturitySourceValue || null,
    nominalValue: record.nominalValue ?? null,
    bondType: record.bondType || null,
    status: record.status || 'UNKNOWN',
    market: record.market || null,
    mic: record.mic || record.marketMic || record.micCode || null,
    source: record.provenance?.source || 'Budget simplement Bond Master',
    sourceUpdatedAt: record.provenance?.sourceUpdatedAt || null,
    confidence: record.provenance?.confidence || 'catalog'
  };
}

function catalogSearch(q) {
  const key = normalize(q);
  if (!key) return [];
  const isinQuery = String(q || '').replace(/\s+/g, '').toUpperCase();
  const exact = exactIsinSearch(isinQuery);
  if (exact && exact.length) return exact;
  const small = readCatalog().map(publicBond).filter(Boolean)
    .filter(x => normalize([x.name, x.shortName, x.issuer, x.isin, x.figi].filter(Boolean).join(' ')).includes(key))
    .slice(0, MAX_RESULTS);
  if (small.length) return small;
  // The ESMA shards are an ISIN/name discovery catalogue, not a FIGI index.
  // Avoid scanning all ~630k records for BBG identifiers; the handler will
  // continue to the OpenFIGI lookup when local results are empty.
  if (!shouldSearchShardedCatalog(isinQuery)) return [];
  return shardedCatalogSearch(q);
}

function normalizeOpenFigi(item) {
  if (!item?.figi || !item?.name) return null;
  const sector = String(item.marketSector || '').toLowerCase();
  const type2 = String(item.securityType2 || '').toLowerCase();
  const type = String(item.securityType || '').toLowerCase();
  const looksFixedIncome = ['corp', 'govt', 'muni', 'mtge', 'mmkt', 'pfd'].some(k => sector.includes(k) || type2.includes(k) || type.includes(k));
  if (!looksFixedIncome) return null;
  return {
    type: 'bond',
    id: item.figi,
    figi: item.figi,
    isin: null,
    name: item.name,
    issuer: null,
    issuerCountry: null,
    currency: item.currency || null,
    // OpenFIGI search candidates are not yet identity-verified against an ISIN.
    // Do not display coupon or dates as trusted financial terms from this fallback.
    coupon: null,
    couponStatus: 'NOT_VERIFIED_EXTERNAL_SOURCE',
    couponType: null,
    couponFrequency: null,
    issueDate: null,
    maturity: null,
    maturityStatus: 'NOT_VERIFIED_EXTERNAL_SOURCE',
    nominalValue: null,
    bondType: item.securityType2 || item.securityType || item.marketSector || null,
    status: 'CANDIDATE_NOT_VERIFIED',
    market: item.exchCode || null,
    mic: item.micCode || null,
    source: 'OpenFIGI — correspondance à vérifier',
    sourceUpdatedAt: null,
    confidence: 'candidate-only'
  };
}

async function openFigiSearch(q) {
  const headers = { 'content-type': 'application/json' };
  if (process.env.OPENFIGI_API_KEY) headers['X-OPENFIGI-APIKEY'] = process.env.OPENFIGI_API_KEY;
  const response = await fetch(OPENFIGI_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: q })
  });
  if (!response.ok) throw new Error(`OpenFIGI HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data.map(normalizeOpenFigi).filter(Boolean).slice(0, MAX_RESULTS) : [];
}

exports._test = { canonicalBond, shardedCatalogSearch, exactIsinSearch, normalize, normalizeOpenFigi, scoreCatalogRecord, indexedNameParts, isFigiLikeQuery, shouldSearchShardedCatalog };

exports.handler = async (event) => {
  const q = String(event?.queryStringParameters?.q || '').trim();
  if (q.length < 2) return json(200, { source: 'local', results: [] });

  const local = catalogSearch(q);
  if (local.length) return json(200, { source: 'bond-master', results: local });

  try {
    const results = await openFigiSearch(q);
    return json(200, { source: 'openfigi', results });
  } catch (error) {
    console.error('bond search error', error);
    return json(200, { source: 'unavailable', results: [], warning: 'BOND_SEARCH_UNAVAILABLE' });
  }
};
