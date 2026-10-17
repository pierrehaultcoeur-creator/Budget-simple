"""Verify committed name indexes are complete, not merely well-formed."""
import hashlib
import json
import unittest
from pathlib import Path

from scripts.split_bonds_catalog import trigrams

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "data" / "bonds-catalog"
SEARCHABLE_FIELDS = (
    "name", "shortName", "short_name", "issuer",
    "instrumentName", "nameOfFinancialInstrument",
)


def git_blob_sha(raw: bytes) -> str:
    header = f"blob {len(raw)}\0".encode("ascii")
    return hashlib.sha1(header + raw).hexdigest()


class CommittedNameIndexTests(unittest.TestCase):
    def test_name_indexes_exactly_cover_searchable_trigrams_and_shards(self):
        manifest = json.loads((CATALOG_DIR / "manifest.json").read_text(encoding="utf-8"))
        self.assertIsInstance(manifest.get("parts"), list)
        self.assertIsInstance(manifest.get("nameIndexes"), list)
        self.assertEqual(
            manifest.get("hasSearchableNames"),
            bool(manifest["nameIndexes"]),
            "Manifest searchable-name flag must match generated indexes",
        )

        shard_names = {part["file"] for part in manifest["parts"]}
        expected = {}
        for part in manifest["parts"]:
            payload = json.loads((CATALOG_DIR / part["file"]).read_text(encoding="utf-8"))
            records = payload.get("records", [])
            self.assertEqual(len(records), part["records"], part["file"])
            for record in records:
                searchable = " ".join(str(record.get(field) or "") for field in SEARCHABLE_FIELDS)
                for gram in trigrams(searchable):
                    expected.setdefault(gram, set()).add(part["file"])

        actual = {}
        prefixes = set()
        filenames = set()
        for entry in manifest["nameIndexes"]:
            prefix = entry.get("prefix")
            filename = entry.get("file")
            self.assertIsInstance(prefix, str)
            self.assertRegex(prefix, r"^[a-z0-9]$")
            self.assertEqual(filename, f"name-index-{prefix}.json")
            self.assertNotIn(prefix, prefixes, f"Duplicate name-index prefix: {prefix}")
            self.assertNotIn(filename, filenames, f"Duplicate name-index file: {filename}")
            self.assertNotIn(filename, shard_names, f"Name index overlaps a catalogue shard: {filename}")
            self.assertNotIn(filename, {item.get("file") for item in manifest.get("isinIndexes", [])},
                             f"Name index overlaps an ISIN index: {filename}")
            prefixes.add(prefix)
            filenames.add(filename)

            raw = (CATALOG_DIR / filename).read_bytes()
            self.assertRegex(entry.get("gitBlobSha", ""), r"^[a-f0-9]{40}$")
            self.assertEqual(git_blob_sha(raw), entry["gitBlobSha"], f"Stale fingerprint: {filename}")
            index = json.loads(raw.decode("utf-8"))
            self.assertIsInstance(index, dict)
            self.assertEqual(len(index), entry.get("trigrams"), f"Trigram count mismatch: {filename}")
            for gram, files in index.items():
                self.assertRegex(gram, r"^[a-z0-9]{3}$")
                self.assertTrue(gram.startswith(prefix), f"{gram} stored under wrong prefix")
                self.assertIsInstance(files, list)
                self.assertTrue(files, f"Empty shard list for {gram}")
                self.assertEqual(len(files), len(set(files)), f"Duplicate shard reference for {gram}")
                self.assertTrue(set(files) <= shard_names, f"Unknown shard referenced by {gram}")
                actual[gram] = set(files)

        self.assertEqual(
            actual,
            expected,
            "Generated name indexes must include every searchable trigram and exactly "
            "the shards containing that trigram; otherwise name searches can silently miss results.",
        )


if __name__ == "__main__":
    unittest.main()
