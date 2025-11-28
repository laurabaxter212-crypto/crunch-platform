# backend/utils/metadata_utils.py
import csv
import io
import json
from typing import Dict, Any, Tuple, List

def parse_csv_or_json_filebytes(content: bytes) -> Dict[str, Dict[str, Any]]:
    """
    Parse uploaded content (bytes) as JSON or CSV/TSV.
    Returns mapping: sample_name -> { field: value, ... }

    Supported JSON formats:
      - { "sample1": {"field": val, ...}, "sample2": {...} }
      - [ {"sample": "sample1", "field": val, ...}, {...} ]

    CSV/TSV:
      - Must include header with a sample column name:
        'sample', 'sample_name', 'id', 'sampleid', 'name' (case-insensitive)
    """
    text = content.decode("utf-8-sig")
    # Try JSON first
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and all(isinstance(v, dict) for v in obj.values()):
            return {str(k): v for k, v in obj.items()}
        if isinstance(obj, list):
            rows = obj
            return _rows_to_map(rows)
    except json.JSONDecodeError:
        pass

    # CSV/TSV parsing
    sample_lines = text.splitlines()
    if not sample_lines:
        raise ValueError("Uploaded file is empty.")
    sample_head = "\n".join(sample_lines[:2]) if len(sample_lines) > 1 else sample_lines[0]
    try:
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample_head)
        delim = dialect.delimiter
    except Exception:
        delim = "\t" if "\t" in text else ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    rows = list(reader)
    if not rows:
        raise ValueError("No rows found in uploaded file.")
    return _rows_to_map(rows)


def _rows_to_map(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    output: Dict[str, Dict[str, Any]] = {}
    header_keys = [k for k in (rows[0].keys() if rows else [])]
    lower_keys = [k.lower() for k in header_keys]
    sample_key = None
    for candidate in ("sample", "sample_name", "id", "sampleid", "name"):
        if candidate in lower_keys:
            sample_key = header_keys[lower_keys.index(candidate)]
            break
    if sample_key is None:
        raise ValueError("Uploaded file must include a sample column named 'sample' or 'sample_name' (case-insensitive).")

    for row in rows:
        sample = str(row.get(sample_key, "")).strip()
        if not sample:
            continue
        entry = {}
        for k, v in row.items():
            if k == sample_key:
                continue
            entry[k] = _try_cast(v)
        output[sample] = entry
    return output

def _try_cast(v: Any):
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    try:
        if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
            return int(s)
        f = float(s)
        return f
    except Exception:
        return s

def validate_samples(parsed: Dict[str, Dict[str, Any]], known_samples: List[str]) -> Tuple[List[str], List[str]]:
    """
    Returns (unknown_samples, matched_samples)
    """
    known_set = set(known_samples)
    unknown = [s for s in parsed.keys() if s not in known_set]
    matched = [s for s in parsed.keys() if s in known_set]
    return unknown, matched

