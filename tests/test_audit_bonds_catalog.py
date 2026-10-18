import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "audit_bonds_catalog", ROOT / "scripts" / "audit_bonds_catalog.py"
)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class BondCatalogueAuditTests(unittest.TestCase):
    def test_known_isins_pass_checksum(self):
        self.assertTrue(module.valid_isin_checksum("FR0000047607"))
        self.assertTrue(module.valid_isin_checksum("US0378331005"))
        self.assertFalse(module.valid_isin_checksum("FR0000047608"))
        self.assertFalse(module.valid_isin_checksum("NOT-AN-ISIN"))

    def test_flags_missing_coupon_and_sentinel_maturity(self):
        report = module.audit_records([
            {
                "isin": "FR0000047607",
                "name": "Example perpetual bond",
                "cfi": "DBVUPN",
                "currency": "EUR",
                "maturityDate": "9999-12-31",
                "couponRate": None,
            }
        ])
        self.assertEqual(report["recordCount"], 1)
        self.assertEqual(report["validIsinChecksum"], 1)
        self.assertEqual(report["sentinelMaturityCount"], 1)
        self.assertEqual(report["missingFieldCounts"]["couponRate"], 1)
        self.assertEqual(report["fieldPresentCounts"]["isin"], 1)
        self.assertEqual(report["fieldPresentCounts"]["name"], 1)
        self.assertEqual(report["fieldPresentCounts"]["maturityDate"], 0)
        self.assertEqual(report["fieldCoveragePercent"]["maturityDate"], 0.0)
        self.assertEqual(report["cfiPrefixCounts"]["DB"], 1)
        self.assertEqual(report["conventionalBondCount"], 1)
        self.assertEqual(report["relatedDebtCount"], 0)
        self.assertEqual(report["structuredProductCount"], 0)

    def test_counts_valid_maturity_dates_as_usable_coverage(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "maturityDate": "2030-06-15"},
            {"isin": "US0378331005", "maturityDate": "2026-02-31"},
            {"isin": "GB0002634946", "maturityDate": "9999-12-31"},
        ])
        self.assertEqual(report["fieldPresentCounts"]["maturityDate"], 1)
        self.assertAlmostEqual(report["fieldCoveragePercent"]["maturityDate"], 100 / 3, places=2)

    def test_cfi_groups_are_not_all_mislabeled_as_conventional_bonds(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "cfi": "DBVUPN"},
            {"isin": "US0378331005", "cfi": "DEXXXX"},
            {"isin": "GB0002634946", "cfi": "DNXXXX"},
            {"isin": "US5949181045", "cfi": "DYXXXX"},
        ])
        self.assertEqual(report["conventionalBondCount"], 1)
        self.assertEqual(report["structuredProductCount"], 1)
        self.assertEqual(report["relatedDebtCount"], 1)
        self.assertEqual(report["otherDebtCount"], 1)
        self.assertEqual(report["unclassifiedCfiCount"], 0)
        self.assertEqual(report["cfiGroupLabels"]["DB"], "Bonds")

    def test_unknown_cfi_group_is_reported_as_unclassified(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "cfi": "DZZZZZ"},
        ])
        self.assertEqual(report["unclassifiedCfiCount"], 1)
        self.assertEqual(report["conventionalBondCount"], 0)
        self.assertEqual(report["relatedDebtCount"], 0)
        self.assertEqual(report["structuredProductCount"], 0)
        self.assertEqual(report["otherDebtCount"], 0)

    def test_malformed_cfi_codes_cannot_be_counted_as_conventional_bonds(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "cfi": "DB"},
            {"isin": "US0378331005", "cfi": "DBFTFRX"},
        ])
        self.assertEqual(report["invalidCfiFormatCount"], 2)
        self.assertEqual(report["conventionalBondCount"], 0)
        self.assertEqual(report["unclassifiedCfiCount"], 2)

    def test_rejects_impossible_maturity_calendar_dates(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "maturityDate": "2026-02-31"},
            {"isin": "US0378331005", "maturityDate": "2028-06-30T00:00:00Z"},
            {"isin": "GB0002634946", "maturityDate": "not-a-date"},
        ])
        self.assertEqual(report["malformedMaturityCount"], 2)


    def test_non_finite_coupons_are_invalid_not_numeric_outliers(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "couponRate": "NaN"},
            {"isin": "US0378331005", "couponRate": "Infinity"},
            {"isin": "GB0002634946", "couponRate": "-Infinity"},
            {"isin": "US5949181045", "couponRate": "3375"},
        ])
        self.assertEqual(report["nonNumericCouponCount"], 3)
        self.assertEqual(report["suspiciousCouponCount"], 1)
        self.assertEqual(report["suspiciousCouponSamples"][0]["couponRateRaw"], "3375")

    def test_reports_all_coupon_outliers_and_distinguishes_perpetual_name_hints(self):
        report = module.audit_records([
            {
                "isin": "FR0000047607",
                "name": "Example PERP bond",
                "maturityDateRaw": "9999-12-31",
                "cfi": "DBVUPN",
                "couponRateRaw": "125",
                "couponRateStatus": "SUSPICIOUS_SOURCE_VALUE",
            },
            {
                "isin": "US0378331005",
                "name": "Example dated bond",
                "maturityDateRaw": "9999-12-31",
                "cfi": "DEXXXX",
                "couponRateRaw": "150",
                "couponRateStatus": "SUSPICIOUS_SOURCE_VALUE",
            },
        ])
        self.assertEqual(report["sentinelMaturityPerpetualNameHintCount"], 1)
        self.assertEqual(report["sentinelMaturityOtherNameCount"], 1)
        self.assertEqual(len(report["suspiciousCouponRecords"]), 2)
        self.assertEqual(report["suspiciousCouponCountsByCfiGroup"], {"DB": 1, "DE": 1})

    def test_separates_verified_coupon_overrides_from_unresolved_source_outliers(self):
        report = module.audit_records([
            {
                "isin": "GR0118017657",
                "cfi": "DBFTGB",
                "couponRateRaw": "3375",
                "couponRate": "3.375",
                "couponRateStatus": "VERIFIED_OVERRIDE",
                "couponRateSource": "https://example.com/verified-reference",
            },
            {
                "isin": "US5949181045",
                "cfi": "DAVSGR",
                "couponRateRaw": "786",
                "couponRate": None,
                "couponRateStatus": "SUSPICIOUS_SOURCE_VALUE",
            },
        ])
        self.assertEqual(report["suspiciousCouponCount"], 2)
        self.assertEqual(report["verifiedCouponOverrideCount"], 1)
        self.assertEqual(report["unresolvedSuspiciousCouponCount"], 1)
        self.assertEqual(
            report["verifiedCouponOverrides"][0]["couponRate"],
            "3.375",
        )

    def test_detects_duplicate_isins_and_bad_coupon(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "couponRate": "unknown"},
            {"isin": "FR0000047607", "couponRate": "9999"},
        ])
        self.assertEqual(report["duplicateIsins"], 1)
        self.assertEqual(report["nonNumericCouponCount"], 1)
        self.assertEqual(report["suspiciousCouponCount"], 1)


if __name__ == "__main__":
    unittest.main()
