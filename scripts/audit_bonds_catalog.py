#!/usr/bin/env python3
"""Audit bond-catalogue data quality without inventing or enriching values.

Usage:
  python scripts/audit_bonds_catalog.py [catalogue.json]
The report is intentionally diagnostic: suspicious/missing values are counted,
never silently converted into guessed financial terms.
"""
from __future__ import annotations

import json
import math
import re
import sys
from datetime import date, datetime
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "bonds-catalog.json"
ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
CFI_RE = re.compile(r"^[A-Z]{6}$")
MATURITY_SENTINELS = {"9999-12-31", "9999-12-30", "0000-00-00"}
# CFI group labels follow ESMA's published ISO 10962 group descriptions.
# Keep ordinary bonds separate from related debt classes and structured products.
CFI_GROUP_LABELS = {
    "DA": "Asset-backed securities",
    "DB": "Bonds",
    "DC": "Convertible bonds",
    "DD": "Depositary receipts on debt instruments",
    "DE": "Structured instruments without capital protection",
    "DG": "Mortgage-backed securities",
    "DM": "Miscellaneous debt instruments",
    "DN": "Municipal bonds",
    "DS": "Structured instruments with capital protection",
    "DT": "Medium-term notes",
    "DW": "Warrants attached to debt instruments",
    "DY": "Other debt instruments",
}
CONVENTIONAL_BOND_CFI_GROUPS = {"DB"}
RELATED_DEBT_CFI_GROUPS = {"DA", "DC", "DD", "DG", "DM", "DN", "DT", "DW"}
STRUCTURED_PRODUCT_CFI_GROUPS = {"DE", "DS"}
OTHER_DEBT_CFI_GROUPS = {"DY"}


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
    invalid_cfi_format = 0
    sentinel_maturities = 0
    malformed_maturities = 0
    coupon_non_numeric = 0
    suspicious_coupon = 0
    verified_coupon_override_count = 0
    verified_coupon_overrides = []
    unresolved_suspicious_coupon_count = 0
    sample_sentinels = []
    suspicious_coupon_samples = []
    non_numeric_coupon_samples = []
    suspicious_coupon_records = []
    suspicious_coupon_by_cfi_group = Counter()
    missing_coupon_by_cfi_group = Counter()
    missing_coupon_with_floating_field_by_cfi_group = Counter()
    missing_coupon_without_floating_field_by_cfi_group = Counter()
    missing_coupon_samples = []
    coupon_source_field_counts = Counter()
    missing_coupon_source_field_counts_by_cfi = Counter()
    sentinel_perpetual_name_hints = 0

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

        cfi = str(record.get("cfi") or "").strip().upper()
        if cfi:
            if CFI_RE.fullmatch(cfi):
                cfi_prefixes[cfi[:2]] += 1
            else:
                invalid_cfi_format += 1

        for field in fields:
            if record.get(field) in (None, ""):
                missing[field] += 1

        source_field = str(record.get("couponSourceField") or "NONE").strip().upper()
        coupon_source_field_counts[source_field] += 1

        # Diagnose missing coupons instead of assuming every missing rate is
        # extractable: preserve source-field provenance and floating-rate signals.
        if record.get("couponRate") in (None, ""):
            group = cfi[:2] if CFI_RE.fullmatch(cfi) else "UNKNOWN"
            missing_coupon_by_cfi_group[group] += 1
            missing_coupon_source_field_counts_by_cfi[f"{group}:{source_field}"] += 1
            floating_present = bool(record.get("floatingRateFieldPresent"))
            if floating_present:
                missing_coupon_with_floating_field_by_cfi_group[group] += 1
            else:
                missing_coupon_without_floating_field_by_cfi_group[group] += 1
            if len(missing_coupon_samples) < 30:
                missing_coupon_samples.append({
                    "isin": isin,
                    "cfi": cfi or None,
                    "name": record.get("name"),
                    "couponRateRaw": record.get("couponRateRaw"),
                    "couponSourceField": record.get("couponSourceField"),
                    "floatingRateFieldPresent": floating_present,
                    "floatingRateRaw": record.get("floatingRateRaw"),
                })

        # Inspect raw source values too: normalized maturityDate may be null for a sentinel.
        maturity = str(record.get("maturityDateRaw") or record.get("maturityDate") or "").strip()
        if maturity in MATURITY_SENTINELS:
            sentinel_maturities += 1
            name = str(record.get("name") or "")
            if re.search(r"\bPERP(?:ETUAL)?\b", name, re.IGNORECASE):
                sentinel_perpetual_name_hints += 1
            if len(sample_sentinels) < 10:
                sample_sentinels.append({"isin": isin, "maturityDateRaw": maturity, "name": record.get("name")})
        elif maturity:
            # Validate the calendar date as well as the ISO shape. A regex alone
            # would incorrectly accept dates such as 2026-02-31.
            try:
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", maturity):
                    date.fromisoformat(maturity)
                elif re.fullmatch(r"\d{4}-\d{2}-\d{2}T.+", maturity):
                    datetime.fromisoformat(maturity.replace("Z", "+00:00"))
                else:
                    raise ValueError("not an ISO date or datetime")
            except ValueError:
                malformed_maturities += 1

        coupon = record.get("couponRateRaw") or record.get("couponRate")
        if coupon not in (None, ""):
            try:
                number = float(str(coupon).replace(",", "."))
                if not math.isfinite(number):
                    raise ValueError("coupon must be finite")
                if not (-100 <= number <= 100):
                    suspicious_coupon += 1
                    group = str(record.get("cfi") or "")[:2].upper() or "UNKNOWN"
                    suspicious_coupon_by_cfi_group[group] += 1
                    status = record.get("couponRateStatus")
                    detail = {
                        "isin": isin,
                        "couponRateRaw": coupon,
                        "couponRate": record.get("couponRate"),
                        "couponRateStatus": status,
                        "couponRateSource": record.get("couponRateSource"),
                        "cfi": record.get("cfi"),
                        "name": record.get("name"),
                    }
                    suspicious_coupon_records.append(detail)
                    if status == "VERIFIED_OVERRIDE":
                        verified_coupon_override_count += 1
                        verified_coupon_overrides.append(detail)
                    else:
                        unresolved_suspicious_coupon_count += 1
                    if len(suspicious_coupon_samples) < 10:
                        suspicious_coupon_samples.append(detail)
            except (TypeError, ValueError):
                coupon_non_numeric += 1
                if len(non_numeric_coupon_samples) < 10:
                    non_numeric_coupon_samples.append({"isin": isin, "couponRateRaw": coupon, "name": record.get("name")})

    conventional_bond_count = sum(count for group, count in cfi_prefixes.items() if group in CONVENTIONAL_BOND_CFI_GROUPS)
    related_debt_count = sum(count for group, count in cfi_prefixes.items() if group in RELATED_DEBT_CFI_GROUPS)
    structured_product_count = sum(count for group, count in cfi_prefixes.items() if group in STRUCTURED_PRODUCT_CFI_GROUPS)
    other_debt_count = sum(count for group, count in cfi_prefixes.items() if group in OTHER_DEBT_CFI_GROUPS)
    unclassified_cfi_count = total - conventional_bond_count - related_debt_count - structured_product_count - other_debt_count
    # Publish field-level coverage explicitly. These are diagnostics, not a claim
    # that every field is mandatory for every debt instrument; instrument-specific
    # rules must be defined before using this report to exclude catalogue entries.
    coverage_fields = ("isin", "name", "shortName", "cfi", "currency", "maturityDate", "couponRate", "issuerLei", "marketMic")
    def usable_field_value(record: dict, field: str) -> bool:
        value = record.get(field)
        if value in (None, ""):
            return False
        if field == "maturityDate":
            maturity = str(value).strip()
            if maturity in MATURITY_SENTINELS:
                return False
            try:
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", maturity):
                    date.fromisoformat(maturity)
                elif re.fullmatch(r"\d{4}-\d{2}-\d{2}T.+", maturity):
                    datetime.fromisoformat(maturity.replace("Z", "+00:00"))
                else:
                    return False
            except ValueError:
                return False
        elif field == "couponRate":
            try:
                number = float(str(value).replace(",", "."))
            except (TypeError, ValueError):
                return False
            if not math.isfinite(number) or not (-100 <= number <= 100):
                return False
        return True

    present_counts = {
        field: sum(
            isinstance(record, dict) and usable_field_value(record, field)
            for record in records
        )
        for field in coverage_fields
    }
    coverage_percent = {
        field: round((count / total * 100), 2) if total else 0.0
        for field, count in present_counts.items()
    }

    # Coverage by CFI group lets us prioritize conventional bonds without
    # assuming structured debt and other products share the same required fields.
    cfi_group_coverage: dict[str, dict] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        cfi = str(record.get("cfi") or "").strip().upper()
        group = cfi[:2] if CFI_RE.fullmatch(cfi) else "UNKNOWN"
        bucket = cfi_group_coverage.setdefault(group, {
            "records": 0,
            "usableMaturity": 0,
            "usableCoupon": 0,
            "usableMaturityAndCoupon": 0,
            "missingCoupon": 0,
            "sentinelMaturity": 0,
        })
        bucket["records"] += 1
        maturity_raw = str(record.get("maturityDateRaw") or record.get("maturityDate") or "").strip()
        if maturity_raw in MATURITY_SENTINELS:
            bucket["sentinelMaturity"] += 1
        has_maturity = usable_field_value(record, "maturityDate")
        has_coupon = usable_field_value(record, "couponRate")
        bucket["usableMaturity"] += int(has_maturity)
        bucket["usableCoupon"] += int(has_coupon)
        bucket["usableMaturityAndCoupon"] += int(has_maturity and has_coupon)
        bucket["missingCoupon"] += int(record.get("couponRate") in (None, ""))

    for bucket in cfi_group_coverage.values():
        count = bucket["records"]
        bucket["usableMaturityPercent"] = round(bucket["usableMaturity"] / count * 100, 2) if count else 0.0
        bucket["usableCouponPercent"] = round(bucket["usableCoupon"] / count * 100, 2) if count else 0.0
        bucket["usableMaturityAndCouponPercent"] = round(bucket["usableMaturityAndCoupon"] / count * 100, 2) if count else 0.0

    conventional_bonds = cfi_group_coverage.get("DB", {
        "records": 0, "usableMaturity": 0, "usableCoupon": 0,
        "usableMaturityAndCoupon": 0, "missingCoupon": 0, "sentinelMaturity": 0,
        "usableMaturityPercent": 0.0, "usableCouponPercent": 0.0,
        "usableMaturityAndCouponPercent": 0.0,
    })
    return {
        "recordCount": total,
        "fieldPresentCounts": present_counts,
        "fieldCoveragePercent": coverage_percent,
        "cfiGroupCoverage": dict(sorted(cfi_group_coverage.items())),
        "conventionalBondCoverage": conventional_bonds,
        "uniqueNonEmptyIsins": len(seen),
        "duplicateIsins": duplicates,
        "validIsinShape": valid_shape,
        "validIsinChecksum": valid_checksum,
        "invalidIsinChecksumAmongShaped": valid_shape - valid_checksum,
        "missingFieldCounts": {field: missing[field] for field in fields},
        "cfiPrefixCounts": dict(sorted(cfi_prefixes.items())),
        "invalidCfiFormatCount": invalid_cfi_format,
        "cfiGroupLabels": CFI_GROUP_LABELS,
        "conventionalBondCfiGroups": sorted(CONVENTIONAL_BOND_CFI_GROUPS),
        "conventionalBondCount": conventional_bond_count,
        "relatedDebtCfiGroups": sorted(RELATED_DEBT_CFI_GROUPS),
        "relatedDebtCount": related_debt_count,
        "structuredProductCfiGroups": sorted(STRUCTURED_PRODUCT_CFI_GROUPS),
        "structuredProductCount": structured_product_count,
        "otherDebtCfiGroups": sorted(OTHER_DEBT_CFI_GROUPS),
        "otherDebtCount": other_debt_count,
        "unclassifiedCfiCount": unclassified_cfi_count,
        "sentinelMaturityCount": sentinel_maturities,
        "malformedMaturityCount": malformed_maturities,
        "nonNumericCouponCount": coupon_non_numeric,
        "suspiciousCouponCount": suspicious_coupon,
        "verifiedCouponOverrideCount": verified_coupon_override_count,
        "verifiedCouponOverrides": verified_coupon_overrides,
        "unresolvedSuspiciousCouponCount": unresolved_suspicious_coupon_count,
        "suspiciousCouponSamples": suspicious_coupon_samples,
        "suspiciousCouponRecords": suspicious_coupon_records,
        "suspiciousCouponCountsByCfiGroup": dict(sorted(suspicious_coupon_by_cfi_group.items())),
        "couponSourceFieldCounts": dict(sorted(coupon_source_field_counts.items())),
        "missingCouponCountsByCfiGroup": dict(sorted(missing_coupon_by_cfi_group.items())),
        "missingCouponSourceFieldCountsByCfi": dict(sorted(missing_coupon_source_field_counts_by_cfi.items())),
        "missingCouponWithFloatingFieldByCfiGroup": dict(sorted(missing_coupon_with_floating_field_by_cfi_group.items())),
        "missingCouponWithoutFloatingFieldByCfiGroup": dict(sorted(missing_coupon_without_floating_field_by_cfi_group.items())),
        "missingCouponSamples": missing_coupon_samples,
        "sentinelMaturityPerpetualNameHintCount": sentinel_perpetual_name_hints,
        "sentinelMaturityOtherNameCount": sentinel_maturities - sentinel_perpetual_name_hints,
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
