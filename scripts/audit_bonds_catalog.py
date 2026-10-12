#!/usr/bin/env python3
"""Audit bond-catalogue data quality without inventing or enriching values.

Usage:
  python scripts/audit_bonds_catalog.py [catalogue.json]
The report is intentionally diagnostic: suspicious/missing values are counted,
never silently converted into guessed financial terms.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "bonds-catalog.json"
ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
MATURITY_SENTINELS = {"9999-12-31", "9999-12-30", "0000-00-00"}
BOND_LIKE_CFI_GROUPS = {"DB", "DC", "DW", "DT", "DA", "DG", "DN"}
STRUCTURED_PRODUCT_CFI_GROUPS = {"DE", "DS"}


def valid_isin_checksum(value: str) -> bool:
    """Validate the ISIN shape and its ISO 6166 Luhn check digit."""
    isin = str(value or "").replace(" ", "").upper()
    if not ISIN_RE.fullmatch(isin):
        return False
    expanded = "".join(
        str(ord(char) - ord("A") + 10) if char.isalpha() else char
        for char in isin
    )
    digits = [int(char) for char in expanded]
    total = 0
    double = (len(digits) % 2 == 0)
    for digit in digits:
        value_digit = digit * 2 if double else digit
        total += value_digit // 10 + value_digit % 10
        double = not double
    return total % 10 == 0


def audit_records(records: list[dict]) -> dict:
    total = len(records)
    seen: set[str] = set()
    duplicates = 0
    valid_shape = 0
    valid_checksum = 0
    missing = Counter()
    cfi_prefixes = Counter()
    sentinel_maturities = 0
    malformed_maturities = 0
    coupon_non_numeric = 0
    suspicious_coupon = 0
    sample_sentinels = []
    suspicious_coupon_samples = []
    non_numeric_coupon_samples = []

    fields = ("name", "shortName", "currency", "maturityDate", "couponRate", "issuerLei", "marketMic")
    for record in records:
        if not isinstance(record, dict):
            continue
        isin = str(record.get("isin") or "").replace(" ", "").upper()
        if isin in seen:
            duplicates += 1
        if isin:
            seen.add(isin)
        if ISIN_RE.fullmatch(isin):
            valid_shape += 1
            valid_checksum += int(valid_isin_checksum(isin))

        cfi = str(record.get("cfi") or "").upper()
        if cfi:
            cfi_prefixes[cfi[:2]] += 1

        for field in fields:
            if record.get(field) in (None, ""):
                missing[field] += 1

        # Inspect raw source values too: normalized maturityDate may be null for a sentinel.
        maturity = str(record.get("maturityDateRaw") or record.get("maturityDate") or "").strip()
        if maturity in MATURITY_SENTINELS:
            sentinel_maturities += 1
            if len(sample_sentinels) < 10:
                sample_sentinels.append({"isin": isin, "maturityDateRaw": maturity, "name": record.get("name")})
        elif maturity:
            # Accept ISO date or ISO datetime only; do not infer alternate formats.
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T.*)?", maturity):
                malformed_maturities += 1

        coupon = record.get("couponRateRaw") or record.get("couponRate")
        if coupon not in (None, ""):
            try:
                number = float(str(coupon).replace(",", "."))
                if not (-100 <= number <= 100):
                    suspicious_coupon += 1
                    if len(suspicious_coupon_samples) < 10:
                        suspicious_coupon_samples.append({"isin": isin, "couponRateRaw": coupon, "couponRateStatus": record.get("couponRateStatus"), "name": record.get("name")})
            except (TypeError, ValueError):
                coupon_non_numeric += 1
                if len(non_numeric_coupon_samples) < 10:
                    non_numeric_coupon_samples.append({"isin": isin, "couponRateRaw": coupon, "name": record.get("name")})

    bond_like_count = sum(count for group, count in cfi_prefixes.items() if group in BOND_LIKE_CFI_GROUPS)
    structured_product_count = sum(count for group, count in cfi_prefixes.items() if group in STRUCTURED_PRODUCT_CFI_GROUPS)
    return {
        "recordCount": total,
        "uniqueNonEmptyIsins": len(seen),
        "duplicateIsins": duplicates,
        "validIsinShape": valid_shape,
        "validIsinChecksum": valid_checksum,
        "invalidIsinChecksumAmongShaped": valid_shape - valid_checksum,
        "missingFieldCounts": {field: missing[field] for field in fields},
        "cfiPrefixCounts": dict(sorted(cfi_prefixes.items())),
        "bondLikeCfiGroups": sorted(BOND_LIKE_CFI_GROUPS),
        "bondLikeInstrumentCount": bond_like_count,
        "structuredProductCfiGroups": sorted(STRUCTURED_PRODUCT_CFI_GROUPS),
        "structuredProductCount": structured_product_count,
        "otherDebtInstrumentCount": total - bond_like_count - structured_product_count,
        "sentinelMaturityCount": sentinel_maturities,
        "malformedMaturityCount": malformed_maturities,
        "nonNumericCouponCount": coupon_non_numeric,
        "suspiciousCouponCount": suspicious_coupon,
        "suspiciousCouponSamples": suspicious_coupon_samples,
        "nonNumericCouponSamples": non_numeric_coupon_samples,
        "sentinelMaturitySamples": sample_sentinels,
    }


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    if not source.exists():
        print(f"ERROR: catalogue not found: {source}", file=sys.stderr)
        return 2
    payload = json.loads(source.read_text(encoding="utf-8"))
    records = payload.get("records") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        print("ERROR: expected a JSON array or an object with a records array", file=sys.stderr)
        return 2
    report = audit_records(records)
    report["sourceFile"] = source.name
    report["sourcePublicationDate"] = payload.get("publicationDate") if isinstance(payload, dict) else None
    print(json.dumps(report, ensure_ascii=False, indent=2))
    # Diagnostics are informational; malformed input fails, but data-quality
    # findings do not fail the job until thresholds have been reviewed.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
