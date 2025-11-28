# backend/metadata/store.py
from pathlib import Path
import json
from typing import Dict, Any, Optional

class MetadataStore:
    """
    Manage per-species metadata files stored at:
      backend/data/<species>/samples_metadata.json

    - Loads metadata from disk (if present)
    - Saves metadata atomically
    - Creates species folder if missing
    """
    def __init__(self, species: str, data_root: Optional[Path] = None):
        self.species = species
        if data_root is None:
            # default: backend/data relative to this file
            self.data_root = Path(__file__).resolve().parents[1] / "data"
        else:
            self.data_root = Path(data_root)
        self.species_dir = self.data_root / species
        self.metadata_path = self.species_dir / "samples_metadata.json"
        self.metadata: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self):
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    self.metadata = {str(k): v for k, v in data.items()}
                else:
                    # if file not in expected format, reset
                    self.metadata = {}
            except Exception as e:
                print(f"[WARN] Failed to read metadata for {self.species}: {e}")
                self.metadata = {}
        else:
            # ensure species dir exists for future writes
            self.species_dir.mkdir(parents=True, exist_ok=True)
            self.metadata = {}

    def save(self):
        """Write metadata atomically to disk."""
        try:
            self.species_dir.mkdir(parents=True, exist_ok=True)
            tmp = self.metadata_path.with_suffix(".json.tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self.metadata, fh, indent=2, sort_keys=True)
            tmp.replace(self.metadata_path)
        except Exception as e:
            print(f"[ERROR] Failed to save metadata for {self.species}: {e}")

    def get_all(self) -> Dict[str, Dict[str, Any]]:
        return self.metadata

    def get_fields(self):
        fields = set()
        for v in self.metadata.values():
            if isinstance(v, dict):
                fields.update(v.keys())
        return sorted(fields)

    def get_for_samples(self, samples):
        return {s: self.metadata.get(s, {}) for s in samples}

    def merge(self, parsed: Dict[str, Dict[str, Any]]):
        """
        Merge parsed metadata into existing metadata.
        New keys update or extend existing sample dicts.
        """
        for s, fields in parsed.items():
            self.metadata.setdefault(s, {}).update(fields)
        self.save()

