# backend/metadata/store.py
from pathlib import Path
import json
from typing import Dict, Any, Optional

DEFAULT_CONFIG = {
    "exposed_fields": {},
    "hidden_fields": []
}

class MetadataStore:
    """
    Manage per-species metadata and per-species metadata_config.json.

    - metadata is stored at backend/data/<species>/samples_metadata.json
    - config at backend/data/<species>/metadata_config.json
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
        self.config_path = self.species_dir / "metadata_config.json"

        self.metadata: Dict[str, Dict[str, Any]] = {}
        self.config: Dict[str, Any] = {}
        self._load()

    def _load(self):
        # ensure species directory exists
        self.species_dir.mkdir(parents=True, exist_ok=True)

        # load metadata
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    self.metadata = {str(k): v for k, v in data.items()}
                else:
                    self.metadata = {}
            except Exception as e:
                print(f"[WARN] Failed to read metadata for {self.species}: {e}")
                self.metadata = {}
        else:
            self.metadata = {}

        # load config (or write default)
        if self.config_path.exists():
            try:
                with open(self.config_path, "r", encoding="utf-8") as fh:
                    cfg = json.load(fh)
                if isinstance(cfg, dict):
                    self.config = cfg
                else:
                    print(f"[WARN] metadata_config.json for {self.species} is not an object; using default.")
                    self.config = DEFAULT_CONFIG.copy()
            except Exception as e:
                print(f"[WARN] Failed to read metadata_config for {self.species}: {e}")
                self.config = DEFAULT_CONFIG.copy()
        else:
            # write a default template so users can edit it
            self.config = DEFAULT_CONFIG.copy()
            try:
                with open(self.config_path, "w", encoding="utf-8") as fh:
                    json.dump(self.config, fh, indent=2, sort_keys=True)
            except Exception as e:
                print(f"[WARN] Failed to write default metadata_config for {self.species}: {e}")

    def save(self):
        """Atomically write metadata to disk."""
        try:
            self.species_dir.mkdir(parents=True, exist_ok=True)
            tmp = self.metadata_path.with_suffix(".json.tmp")
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self.metadata, fh, indent=2, sort_keys=True)
            tmp.replace(self.metadata_path)
        except Exception as e:
            print(f"[ERROR] Failed to save metadata for {self.species}: {e}")

    def merge(self, parsed: Dict[str, Dict[str, Any]]):
        """Merge parsed metadata into existing metadata and persist."""
        for s, fields in parsed.items():
            self.metadata.setdefault(s, {}).update(fields)
        self.save()

    def get_all(self) -> Dict[str, Dict[str, Any]]:
        return self.metadata

    def get_for_samples(self, samples):
        return {s: self.metadata.get(s, {}) for s in samples}

    # --- config helpers ---
    def get_config(self) -> Dict[str, Any]:
        return self.config

    def get_exposed_fields(self):
        """
        Return ordered list of exposed field keys (from config.exposed_fields).
        If none configured, return empty list.
        """
        ef = self.config.get("exposed_fields", {})
        if isinstance(ef, dict):
            return list(ef.keys())
        return []

    def get_display_names_map(self):
        """Return map: field_key -> display_name. If not configured, return {}"""
        ef = self.config.get("exposed_fields", {})
        if isinstance(ef, dict):
            return ef
        return {}

    def is_hidden(self, field_key: str) -> bool:
        hidden = self.config.get("hidden_fields", [])
        return field_key in hidden if isinstance(hidden, list) else False
