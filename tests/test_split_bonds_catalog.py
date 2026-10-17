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
    def test_normalization_removes_all_unicode_mark_categories(self):
        # U+093E is a spacing combining mark (category Mc) with combining class 0.
        self.assertEqual(module.normalize_search("a\u093ebc"), "abc")
        # U+1AB0 is a nonspacing mark outside the basic combining diacritical block.
        self.assertEqual(module.normalize_search("a\u1ab0bc"), "abc")

    def test_compact_record_removes_all_whitespace_from_isin(self):
        self.assertEqual(module.compact_record({"isin": " FR\t0000120271\n"})["isin"], "FR0000120271")
        self.assertEqual(module.compact_record(" US 0378331005 ")["isin"], "US0378331005")

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
                self.assertEqual(set(fr_index), {"FR0000120271"})
                self.assertEqual(set(us_index), {"US0378331005"})
                self.assertEqual(sum(item["entries"] for item in manifest["isinIndexes"]), 2,
                    "Every well-formed ISIN must appear once, while malformed identifiers stay out of the lookup index")
                self.assertTrue(any(part["file"] == fr_index["FR0000120271"] for part in manifest["parts"]))
                self.assertTrue(any(part["file"] == us_index["US0378331005"] for part in manifest["parts"]))
            finally:
                module.OUT = old_out
                module.TARGET_BYTES = old_target


    def test_rejects_duplicate_well_formed_isins_without_destroying_previous_catalogue(self):
        records = [
            {"isin": "FR0000120271", "name": "First record"},
            {"isin": "FR0000120271", "name": "Duplicate record"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.write_shards([{"isin": "US0378331005", "name": "Existing valid record"}])
                before = {
                    path.name: path.read_bytes()
                    for path in module.OUT.iterdir()
                    if path.is_file()
                }
                with self.assertRaisesRegex(ValueError, "Duplicate valid ISIN"):
                    module.write_shards(records)
                after = {
                    path.name: path.read_bytes()
                    for path in module.OUT.iterdir()
                    if path.is_file()
                }
                self.assertEqual(after, before, "A rejected rebuild must preserve the previous valid catalogue")
            finally:
                module.OUT = old_out


    def test_preserves_generated_at_when_catalogue_and_indexes_are_unchanged(self):
        records = [
            {"isin": "FR0000120271", "name": "Banque Exemple 2030", "cfi": "DBFTFR"},
            {"isin": "US0378331005", "name": "Apple Inc Bond", "cfi": "DBFTFR"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.write_shards(records, {
                    "source": "ESMA FIRDS", "sourceFileType": "FULINS_D",
                    "publicationDate": "2026-10-11", "generatedAt": "2026-10-12T10:00:00+00:00"
                })
                manifest_path = module.OUT / "manifest.json"
                first = json.loads(manifest_path.read_text(encoding="utf-8"))
                module.write_shards(records, {
                    "source": "ESMA FIRDS", "sourceFileType": "FULINS_D",
                    "publicationDate": "2026-10-11", "generatedAt": "2026-10-15T17:00:00+00:00"
                })
                second = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(second["generatedAt"], first["generatedAt"])
                self.assertEqual(second, first)

                changed_records = records + [{"isin": "DE0001102606", "name": "Bundesanleihe 2029"}]
                module.write_shards(changed_records, {
                    "source": "ESMA FIRDS", "sourceFileType": "FULINS_D",
                    "publicationDate": "2026-10-15", "generatedAt": "2026-10-15T18:00:00+00:00"
                })
                third = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertEqual(third["generatedAt"], "2026-10-15T18:00:00+00:00")
                self.assertNotEqual(third["recordCount"], second["recordCount"])
            finally:
                module.OUT = old_out

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
                self.assertNotIn(" ", indexes, "Index should not create an unused leading-space trigram shard")
                self.assertIn("b", indexes)
                index = json.loads((module.OUT / indexes["b"]["file"]).read_text(encoding="utf-8"))
                self.assertTrue(any("ban" in gram for gram in index))
                matching = set(index["ban"])
                self.assertTrue(any("part-" in filename for filename in matching))
            finally:
                module.OUT = old_out


    def test_short_name_is_included_in_searchable_trigram_index(self):
        records = [
            {"isin": "FR0000120271", "name": "Full legal instrument name", "shortName": "Example Note 2030"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.write_shards(records)
                manifest = json.loads((module.OUT / "manifest.json").read_text(encoding="utf-8"))
                indexes = {item["prefix"]: item for item in manifest["nameIndexes"]}
                index = json.loads((module.OUT / indexes["e"]["file"]).read_text(encoding="utf-8"))
                self.assertIn("exa", index, "Short-name trigrams must be indexed")
                self.assertTrue(any("part-" in filename for filename in index["exa"]))
            finally:
                module.OUT = old_out


    def test_name_trigram_index_exactly_matches_searchable_shard_contents(self):
        records = [
            {"isin": "FR0000120271", "name": "Banque Étoile 2030", "issuer": "Groupe Étoile"},
            {"isin": "US0378331005", "name": "Apple Inc Bond", "issuer": "Apple Incorporated"},
            {"isin": "DE0001102606", "name": "Bundesanleihe 2029", "issuer": "Federal Republic"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            old_target = module.TARGET_BYTES
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.TARGET_BYTES = 100
                module.write_shards(records)
                manifest = json.loads((module.OUT / "manifest.json").read_text(encoding="utf-8"))

                expected = {}
                shard_names = {part["file"] for part in manifest["parts"]}
                for part in manifest["parts"]:
                    payload = json.loads((module.OUT / part["file"]).read_text(encoding="utf-8"))
                    for record in payload["records"]:
                        searchable = " ".join(str(record.get(field) or "") for field in (
                            "name", "shortName", "short_name", "issuer", "instrumentName", "nameOfFinancialInstrument"
                        ))
                        for gram in module.trigrams(searchable):
                            self.assertTrue(gram.strip(), "Trigrams should not span word boundaries")
                            expected.setdefault(gram, set()).add(part["file"])

                actual = {}
                for entry in manifest["nameIndexes"]:
                    index = json.loads((module.OUT / entry["file"]).read_text(encoding="utf-8"))
                    for gram, files in index.items():
                        self.assertEqual(gram[0], entry["prefix"])
                        self.assertTrue(set(files) <= shard_names)
                        actual[gram] = set(files)

                self.assertEqual(actual, expected,
                    "Name index must contain every expected trigram and only shards that contain it")
            finally:
                module.OUT = old_out
                module.TARGET_BYTES = old_target


    def test_searchable_name_manifest_flag_covers_every_indexed_field(self):
        records = [
            {"isin": "FR0000120271", "name": None, "instrumentName": "Instrument Alpha 2030"},
            {"isin": "US0378331005", "name": "", "nameOfFinancialInstrument": "Instrument Beta 2031"},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            old_out = module.OUT
            try:
                module.OUT = pathlib.Path(tmp) / "catalogue"
                module.write_shards(records)
                manifest = json.loads((module.OUT / "manifest.json").read_text(encoding="utf-8"))
                self.assertTrue(manifest["hasSearchableNames"])
                self.assertTrue(manifest["nameIndexes"])
                indexes = {}
                for entry in manifest["nameIndexes"]:
                    indexes.update(json.loads((module.OUT / entry["file"]).read_text(encoding="utf-8")))
                self.assertIn("ins", indexes)
                self.assertIn("alp", indexes)
                self.assertIn("bet", indexes)
            finally:
                module.OUT = old_out


if __name__ == "__main__":
    unittest.main()
