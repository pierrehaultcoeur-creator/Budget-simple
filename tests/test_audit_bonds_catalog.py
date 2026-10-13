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
        self.assertEqual(report["cfiPrefixCounts"]["DB"], 1)
        self.assertEqual(report["conventionalBondCount"], 1)
        self.assertEqual(report["relatedDebtCount"], 0)
        self.assertEqual(report["structuredProductCount"], 0)

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

    def test_rejects_impossible_maturity_calendar_dates(self):
        report = module.audit_records([
            {"isin": "FR0000047607", "maturityDate": "2026-02-31"},
            {"isin": "US0378331005", "maturityDate": "2028-06-30T00:00:00Z"},
            {"isin": "GB0002634946", "maturityDate": "not-a-date"},
        ])
        self.assertEqual(report["malformedMaturityCount"], 2)

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
