import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("bonds_catalog", ROOT / "scripts" / "bonds_catalog.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class ParserTests(unittest.TestCase):
    def test_cfi_groups_distinguish_bonds_from_structured_products(self):
        self.assertEqual(module.classify_cfi("DBVUPN"), ("DB", "Obligation (bond)"))
        self.assertEqual(
            module.classify_cfi("DEXXXX"),
            ("DE", "Produit structuré sans protection du capital"),
        )

    def test_maturity_sentinel_is_not_a_real_maturity(self):
        sentinel = module.ET.fromstring(
            "<DebtInstrmAttrbts><MtrtyDt>9999-12-31</MtrtyDt></DebtInstrmAttrbts>"
        )
        self.assertEqual(
            module.normalized_maturity(sentinel),
            (None, "9999-12-31", "SENTINEL_UNSPECIFIED"),
        )
        real_date = module.ET.fromstring(
            "<DebtInstrmAttrbts><MtrtyDt>2030-12-31</MtrtyDt></DebtInstrmAttrbts>"
        )
        self.assertEqual(
            module.normalized_maturity(real_date),
            ("2030-12-31", "2030-12-31", "SOURCE_DATE"),
        )

    def test_sentinel_metadata_does_not_inflate_record_completeness(self):
        real = {
            "isin": "FR0000047607",
            "name": "Example bond",
            "maturityDate": "2030-12-31",
            "couponRate": "3.25",
        }
        sentinel = {
            "isin": "FR0000047607",
            "name": "Example bond",
            "maturityDate": None,
            "maturityDateRaw": "9999-12-31",
            "maturityDateStatus": "SENTINEL_UNSPECIFIED",
            "couponRate": "3.25",
        }
        self.assertGreater(module.completeness(real), module.completeness(sentinel))

    def test_debt_filter_and_fields(self):
        xml = (ROOT / "tests" / "sample_fulins.xml").read_bytes()
        records = module.parse_xml(xml)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["isin"], "FR0000120271")
        self.assertEqual(records[0]["name"], "Example Bond")
        self.assertEqual(records[0]["cfi"], "DBFTFR")
        self.assertEqual(records[0]["currency"], "EUR")
        self.assertEqual(records[0]["maturityDate"], "2030-12-31")
        self.assertEqual(records[0]["couponRate"], "3.25")
        self.assertEqual(records[0]["marketMic"], "XPAR")


if __name__ == "__main__":
    unittest.main()
