import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("split_bonds_catalog", ROOT / "scripts" / "split_bonds_catalog.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class SplitterIndexTests(unittest.TestCase):
    def test_builds_prefix_partitioned_isin_index(self):
        records = [
            {"isin": "FR0000120271", "cfi": "DBFTFR"},
            {"isin": "US0378331005", "cfi": "DBFTFR"},
            {"isin": "not-an-isin", "cfi": "DBFTFR"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            old_target = module.TARGET_BYTES
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.TARGET_BYTES = 45
                module.write_shards(records, {"source": "ESMA FIRDS", "sourceFileType": "FULINS_D", "publicationDate": "2026-10-11", "generatedAt": "2026-10-12T10:00:00+00:00"})
                manifest = json.loads((module.OUT / "manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["recordCount"], 3)
                self.assertEqual(manifest["version"], 3)
                self.assertEqual(manifest["source"], "ESMA FIRDS")
                self.assertEqual(manifest["sourceFileType"], "FULINS_D")
                self.assertEqual(manifest["sourcePublicationDate"], "2026-10-11")
                self.assertEqual(manifest["generatedAt"], "2026-10-12T10:00:00+00:00")
                indexes = {item["prefix"]: item for item in manifest["isinIndexes"]}
                self.assertIn("FR", indexes)
                self.assertIn("US", indexes)
                fr_index = json.loads((module.OUT / indexes["FR"]["file"]).read_text(encoding="utf-8"))
                us_index = json.loads((module.OUT / indexes["US"]["file"]).read_text(encoding="utf-8"))
                self.assertIn("FR0000120271", fr_index)
                self.assertIn("US0378331005", us_index)
                self.assertTrue(any(part["file"] == fr_index["FR0000120271"] for part in manifest["parts"]))
                self.assertTrue(any(part["file"] == us_index["US0378331005"] for part in manifest["parts"]))
            finally:
                module.OUT = old_out
                module.TARGET_BYTES = old_target


    def test_builds_searchable_name_trigram_index(self):
        records = [
            {"isin": "FR0000120271", "name": "Banque Exemple 2030", "issuer": "Banque Exemple"},
            {"isin": "US0378331005", "name": "Apple Inc Bond", "issuer": "Apple Inc"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.write_shards(records)
                manifest = json.loads((module.OUT / "manifest.json").read_text(encoding="utf-8"))
                indexes = {item["prefix"]: item for item in manifest["nameIndexes"]}
                self.assertIn("b", indexes)
                index = json.loads((module.OUT / indexes["b"]["file"]).read_text(encoding="utf-8"))
                self.assertTrue(any("ban" in gram for gram in index))
                matching = set(index["ban"])
                self.assertTrue(any("part-" in filename for filename in matching))
            finally:
                module.OUT = old_out



if __name__ == "__main__":
    unittest.main()
