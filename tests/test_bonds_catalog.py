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

    def test_suspicious_coupon_is_withheld_not_rescaled(self):
        self.assertEqual(module.normalized_coupon("3375"), (None, "SUSPICIOUS_SOURCE_VALUE"))
        self.assertEqual(module.normalized_coupon("3.375"), ("3.375", "SOURCE_PERCENTAGE"))
        self.assertEqual(module.normalized_coupon("NaN"), (None, "INVALID_SOURCE_VALUE"))
        self.assertEqual(module.normalized_coupon("Infinity"), (None, "INVALID_SOURCE_VALUE"))
        self.assertEqual(module.normalized_coupon("-Infinity"), (None, "INVALID_SOURCE_VALUE"))
        self.assertEqual(module.normalized_coupon(None), (None, None))

    def test_verified_coupon_override_corrects_display_value_and_preserves_source(self):
        xml = b"""<Document>
          <FinInstrm>
            <FinInstrmGnlAttrbts>
              <Id>GR0118017657</Id>
              <FullNm>GGB 3.375 2/25 GREECE</FullNm>
              <ClssfctnTp>DBFTGB</ClssfctnTp>
              <NtnlCcy>EUR</NtnlCcy>
            </FinInstrmGnlAttrbts>
            <DebtInstrmAttrbts>
              <MtrtyDt>2025-02-15</MtrtyDt>
              <Fxd>3375</Fxd>
            </DebtInstrmAttrbts>
          </FinInstrm>
        </Document>"""
        records = module.parse_xml(xml)
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["couponRate"], "3.375")
        self.assertEqual(record["couponRateRaw"], "3375")
        self.assertEqual(record["couponRateStatus"], "VERIFIED_OVERRIDE")
        self.assertEqual(
            record["couponRateSource"],
            module.COUPON_OVERRIDES["GR0118017657"]["source"],
        )
        self.assertTrue(record["couponRateSourceReason"])

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

    def test_invalid_maturity_is_preserved_for_audit_but_not_exposed_as_a_date(self):
        invalid_dates = ("2030-02-31", "2030-13-01", "not-a-date")
        for raw in invalid_dates:
            with self.subTest(raw=raw):
                node = module.ET.fromstring(
                    f"<DebtInstrmAttrbts><MtrtyDt>{raw}</MtrtyDt></DebtInstrmAttrbts>"
                )
                self.assertEqual(
                    module.normalized_maturity(node),
                    (None, raw, "INVALID_SOURCE_VALUE"),
                )

    def test_iso_datetime_maturity_is_validated_and_preserved(self):
        raw = "2030-12-31T00:00:00Z"
        node = module.ET.fromstring(
            f"<DebtInstrmAttrbts><MtrtyDt>{raw}</MtrtyDt></DebtInstrmAttrbts>"
        )
        self.assertEqual(
            module.normalized_maturity(node),
            (raw, raw, "SOURCE_DATE"),
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

    def test_coupon_provenance_distinguishes_fixed_interest_and_floating_fields(self):
        xml = b"""<Document>
          <FinInstrm>
            <FinInstrmGnlAttrbts><Id>FR0000120271</Id><FullNm>Fixed coupon</FullNm><ClssfctnTp>DBFTFR</ClssfctnTp></FinInstrmGnlAttrbts>
            <DebtInstrmAttrbts><Fxd>3.25</Fxd></DebtInstrmAttrbts>
          </FinInstrm>
          <FinInstrm>
            <FinInstrmGnlAttrbts><Id>US0378331005</Id><FullNm>Floating rate</FullNm><ClssfctnTp>DBFTFR</ClssfctnTp></FinInstrmGnlAttrbts>
            <DebtInstrmAttrbts><Fltg>Y</Fltg></DebtInstrmAttrbts>
          </FinInstrm>
        </Document>"""
        records = module.parse_xml(xml)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["couponRate"], "3.25")
        self.assertEqual(records[0]["couponSourceField"], "Fxd")
        self.assertFalse(records[0]["floatingRateFieldPresent"])
        self.assertIsNone(records[1]["couponRate"])
        self.assertIsNone(records[1]["couponSourceField"])
        self.assertTrue(records[1]["floatingRateFieldPresent"])
        self.assertEqual(records[1]["floatingRateRaw"], "Y")

    def test_nested_floating_rate_fields_are_detected_without_faking_coupon(self):
        xml = b"""<Document>
          <FinInstrm>
            <FinInstrmGnlAttrbts><Id>US0378331005</Id><FullNm>Floating rate note</FullNm><ClssfctnTp>DBVUFR</ClssfctnTp></FinInstrmGnlAttrbts>
            <DebtInstrmAttrbts><Fxd>305</Fxd><IntrstRate><Fltg><RefRate><Indx>EURIBOR</Indx></RefRate><Term>3M</Term><BsisPtSprd>125</BsisPtSprd></Fltg></IntrstRate></DebtInstrmAttrbts>
          </FinInstrm>
        </Document>"""
        record = module.parse_xml(xml)[0]
        self.assertIsNone(record["couponRate"])
        self.assertEqual(record["couponRateRaw"], "305")
        self.assertEqual(record["couponRateStatus"], "FLOATING_RATE_REFERENCE")
        self.assertTrue(record["floatingRateFieldPresent"])
        self.assertEqual(record["floatingRateRaw"], "EURIBOR")
        self.assertEqual(record["floatingRateTerm"], "3M")
        self.assertEqual(record["floatingRateSpreadBps"], "125")

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
        self.assertEqual(records[0]["couponRateRaw"], "3.25")
        self.assertEqual(records[0]["couponRateStatus"], "SOURCE_PERCENTAGE")
        self.assertEqual(records[0]["marketMic"], "XPAR")


    def test_verified_netcity_coupon_overrides_keep_raw_esma_values(self):
        cases = (
            ("XS3420465927", "5468", "5.468"),
            ("XS3420466065", "5611", "5.611"),
        )
        for isin, raw_coupon, expected_coupon in cases:
            with self.subTest(isin=isin):
                xml = f"""<Document>
                  <FinInstrm>
                    <FinInstrmGnlAttrbts>
                      <Id>{isin}</Id>
                      <FullNm>Netcity Telecom S.A. {expected_coupon} per cent Secured Amortising Bonds</FullNm>
                      <ClssfctnTp>DBFXFR</ClssfctnTp>
                      <NtnlCcy>EUR</NtnlCcy>
                    </FinInstrmGnlAttrbts>
                    <DebtInstrmAttrbts><Fxd>{raw_coupon}</Fxd><MtrtyDt>2046-06-30</MtrtyDt></DebtInstrmAttrbts>
                  </FinInstrm>
                </Document>""".encode()
                record = module.parse_xml(xml)[0]
                self.assertEqual(record["couponRate"], expected_coupon)
                self.assertEqual(record["couponRateRaw"], raw_coupon)
                self.assertEqual(record["couponRateStatus"], "VERIFIED_OVERRIDE")
                self.assertEqual(record["couponRateSource"], module.COUPON_OVERRIDES[isin]["source"])


    def test_verified_greek_coupon_overrides_keep_raw_esma_values(self):
        cases = (
            ("GR0128010676", "2023-02-24"),
            ("GR0128011682", "2024-02-24"),
            ("GR0128012698", "2025-02-24"),
            ("GR0128013704", "2026-02-24"),
            ("GR0128014710", "2027-02-24"),
        )
        for isin, maturity in cases:
            with self.subTest(isin=isin):
                xml = f"""<Document>
                  <FinInstrm>
                    <FinInstrmGnlAttrbts>
                      <Id>{isin}</Id>
                      <FullNm>Greek Government Bond</FullNm>
                      <ClssfctnTp>DBFTGB</ClssfctnTp>
                      <NtnlCcy>EUR</NtnlCcy>
                    </FinInstrmGnlAttrbts>
                    <DebtInstrmAttrbts><MtrtyDt>{maturity}</MtrtyDt><Fxd>365</Fxd></DebtInstrmAttrbts>
                  </FinInstrm>
                </Document>""".encode()
                record = module.parse_xml(xml)[0]
                self.assertEqual(record["couponRate"], "2.000")
                self.assertEqual(record["couponRateRaw"], "365")
                self.assertEqual(record["couponRateStatus"], "VERIFIED_OVERRIDE")
                self.assertEqual(record["couponRateSource"], module.COUPON_OVERRIDES[isin]["source"])
                self.assertTrue(record["couponRateSourceReason"])

if __name__ == "__main__":
    unittest.main()
