#!/usr/bin/env python3
"""Build a deduplicated bond catalogue from ESMA FIRDS FULINS_D files.

This creates data/bonds-catalog.json only after all expected files for the
selected publication have been downloaded and parsed successfully.
Standard library only; intended for GitHub Actions.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, timedelta, timezone, datetime
from pathlib import Path

API = (
    "https://registers.esma.europa.eu/solr/"
    "esma_registers_firds_files/select"
)
OUT = Path("data/bonds-catalog.json")
USER_AGENT = "Budget-Simplement-Bond-Catalog/1.0"
ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
FILE_RE = re.compile(
    r"FULINS_D_(\d{8})_(\d+)of(\d+)\.zip$", re.IGNORECASE
)
MIN_RECORDS = int(os.environ.get("BONDS_MIN_RECORDS", "1"))


def http_get(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT}
    )
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP status {response.status}: {url}")
                return response.read()
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Request failed after 3 attempts: {url}: {last_error}")


def xml_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def direct_child_text(node: ET.Element, child_name: str) -> str | None:
    for child in list(node):
        if xml_local_name(child.tag) == child_name:
            value = (child.text or "").strip()
            return value or None
    return None


def first_descendant_text(node: ET.Element, name: str) -> str | None:
    for child in node.iter():
        if xml_local_name(child.tag) == name:
            value = (child.text or "").strip()
            if value:
                return value
    return None


def query_esma_files(start: date, end: date) -> list[dict]:
    params = {
        "q": "*",
        "fq": (
            "publication_date:["
            f"{start.isoformat()}T00:00:00Z TO "
            f"{end.isoformat()}T23:59:59Z]"
        ),
        "wt": "json",
        "indent": "false",
        "start": "0",
        "rows": "1000",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    payload = json.loads(http_get(url).decode("utf-8"))
    response = payload.get("response", {})
    docs = response.get("docs", [])
    found = int(response.get("numFound", len(docs)))
    if found > len(docs):
        raise RuntimeError(
            f"ESMA returned {len(docs)} of {found} results; pagination required."
        )

    results = []
    for doc in docs:
        link = doc.get("download_link")
        if not isinstance(link, str) or not link:
            continue
        filename = urllib.parse.urlparse(link).path.rsplit("/", 1)[-1]
        match = FILE_RE.fullmatch(filename)
        if not match:
            continue
        results.append({
            "date": match.group(1),
            "part": int(match.group(2)),
            "total": int(match.group(3)),
            "url": link,
            "filename": filename,
        })
    return results


def choose_complete_publication(files: list[dict]) -> list[dict]:
    by_date: dict[str, list[dict]] = {}
    for item in files:
        by_date.setdefault(item["date"], []).append(item)

    for publication_date in sorted(by_date, reverse=True):
        group = by_date[publication_date]
        totals = {item["total"] for item in group}
        if len(totals) != 1:
            continue
        expected = next(iter(totals))
        parts = [item["part"] for item in group]
        if len(group) == expected and sorted(parts) == list(range(1, expected + 1)):
            return sorted(group, key=lambda item: item["part"])
    raise RuntimeError(
        "No complete FULINS_D publication found in ESMA results. "
        "No new catalogue has been written."
    )


def parse_xml(xml_bytes: bytes) -> list[dict]:
    """Parse instrument records; tolerate XML namespaces and message wrappers."""
    records = []
    try:
        # Instrument records in FULINS payloads are represented by RefData.
        for _, node in ET.iterparse(io.BytesIO(xml_bytes), events=("end",)):
            if xml_local_name(node.tag) not in {"RefData", "FinInstrm"}:
                continue
            general = None
            debt = None
            trading = None
            for child in node.iter():
                lname = xml_local_name(child.tag)
                if lname == "FinInstrmGnlAttrbts" and general is None:
                    general = child
                elif lname == "DebtInstrmAttrbts" and debt is None:
                    debt = child
                elif lname == "TradgVnRltdAttrbts" and trading is None:
                    trading = child

            if general is None:
                node.clear()
                continue
            isin = direct_child_text(general, "Id")
            cfi = direct_child_text(general, "ClssfctnTp")
            if not isin or not ISIN_RE.fullmatch(isin):
                node.clear()
                continue
            # CFI starting with D classifies debt instruments.
            if not cfi or not cfi.startswith("D"):
                node.clear()
                continue

            maturity, maturity_raw, maturity_status = normalized_maturity(debt)
            record = {
                "isin": isin,
                "name": direct_child_text(general, "FullNm"),
                "shortName": direct_child_text(general, "ShrtNm"),
                "cfi": cfi,
                "currency": direct_child_text(general, "NtnlCcy"),
                "maturityDate": maturity,
                "maturityDateRaw": maturity_raw,
                "maturityDateStatus": maturity_status,
                "couponRate": (
                    first_descendant_text(debt, "Fxd")
                    or first_descendant_text(debt, "IntrstRate")
                    if debt is not None else None
                ),
                "issuerLei": first_descendant_text(node, "Issr"),
                "marketMic": first_descendant_text(trading, "Id") if trading is not None else None,
            }
            records.append(record)
            node.clear()
    except ET.ParseError as exc:
        raise RuntimeError(f"Invalid XML payload: {exc}") from exc
    return records


MATURITY_SENTINELS = {"9999-12-31", "9999-12-30", "0000-00-00"}


def normalized_maturity(debt: ET.Element | None) -> tuple[str | None, str | None, str | None]:
    """Keep source maturity data but never expose known sentinel dates as real dates."""
    raw = first_descendant_text(debt, "MtrtyDt") if debt is not None else None
    if not raw:
        return None, None, None
    if raw in MATURITY_SENTINELS:
        return None, raw, "SENTINEL_UNSPECIFIED"
    return raw, raw, "SOURCE_DATE"


def completeness(record: dict) -> int:
    return sum(value not in (None, "") for value in record.values())


def build_catalogue() -> dict:
    today = date.today()
    files = query_esma_files(today - timedelta(days=21), today)
    publication = choose_complete_publication(files)
    publication_date = publication[0]["date"]
    print(f"Selected FULINS_D publication {publication_date}: {len(publication)} part(s)")

    deduplicated: dict[str, dict] = {}
    downloaded_bytes = 0
    xml_count = 0
    for item in publication:
        print(f"Downloading {item['filename']}")
        archive_data = http_get(item["url"])
        downloaded_bytes += len(archive_data)
        try:
            with zipfile.ZipFile(io.BytesIO(archive_data)) as archive:
                xml_names = [n for n in archive.namelist() if n.lower().endswith(".xml")]
                if not xml_names:
                    raise RuntimeError(f"No XML member in {item['filename']}")
                for xml_name in xml_names:
                    xml_count += 1
                    with archive.open(xml_name) as member:
                        for record in parse_xml(member.read()):
                            old = deduplicated.get(record["isin"])
                            if old is None or completeness(record) > completeness(old):
                                deduplicated[record["isin"]] = record
        except zipfile.BadZipFile as exc:
            raise RuntimeError(f"Invalid ZIP archive: {item['filename']}") from exc

    records = sorted(deduplicated.values(), key=lambda row: row["isin"])
    if len(records) < MIN_RECORDS:
        raise RuntimeError(
            f"Only {len(records)} unique debt ISIN(s) extracted; minimum is {MIN_RECORDS}. "
            "No new catalogue has been written."
        )

    return {
        "schemaVersion": 1,
        "source": "ESMA FIRDS",
        "sourceFileType": "FULINS_D",
        "publicationDate": publication_date,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "recordCount": len(records),
        "xmlFileCount": xml_count,
        "downloadedBytes": downloaded_bytes,
        "records": records,
    }


def main() -> int:
    catalogue = build_catalogue()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix(".json.tmp")
    temp.write_text(
        json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    # Replace only after every download, parse, and basic validation succeeds.
    temp.replace(OUT)
    print(f"Catalogue saved: {OUT}")
    print(f"Unique debt ISINs: {catalogue['recordCount']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
