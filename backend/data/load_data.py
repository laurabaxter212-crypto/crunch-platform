# backend/data/load_data.py
import os
import pickle
import zarr
import re

def clean_sample_name(name: str) -> str:
    """
    Strip suffixes like:
        SRR20826839.SAM.sorted.BAM
        SRR20826839.bam
        SRR20826839.fastq.gz
    Returns just the SRR/ERR/DRR accession.
    """
    # Take everything before the first dot
    base = name.split('.')[0]

    # Extract common accession prefixes
    m = re.match(r"(SRR\d+|ERR\d+|DRR\d+)", base)
    return m.group(1) if m else base


class SpeciesData:
    """
    Lightweight wrapper around a genotype dataset.
    If the paths do not exist this object will be created with `loaded=False`
    and endpoints will return a helpful error.
    """
    def __init__(self, name, zarr_path, variant_to_gene_path, gene_to_variants_path):
        self.name = name
        self.zarr_path = zarr_path
        self.variant_to_gene_path = variant_to_gene_path
        self.gene_to_variants_path = gene_to_variants_path

        self.loaded = False
        self.callset = None
        self.samples = []
        self.gt = None
        self.variant_to_gene = None
        self.gene_to_variants = None

        self._try_load()

    def _try_load(self):
        try:
            if not os.path.exists(self.zarr_path):
                # Not present — leave unloaded
                return
            print(f"Loading '{self.name}' dataset from {self.zarr_path} …")
            self.callset = zarr.open(self.zarr_path, mode="r")

            # Decode possible byte strings
            raw_samples = list(self.callset["samples"][:])
            decoded = [
                s.decode("utf-8") if isinstance(s, (bytes, bytearray)) else str(s)
                for s in raw_samples
            ]

            # CLEAN SAMPLE NAMES HERE
            self.samples = [clean_sample_name(s) for s in decoded]

            # Load GT
            self.gt = self.callset["calldata/GT"]

            # Load optional pickles
            if os.path.exists(self.variant_to_gene_path):
                self.variant_to_gene = pickle.load(open(self.variant_to_gene_path, "rb"))
            if os.path.exists(self.gene_to_variants_path):
                self.gene_to_variants = pickle.load(open(self.gene_to_variants_path, "rb"))

            self.loaded = True
            print(f"Loaded dataset '{self.name}' (samples: {len(self.samples)})")

        except Exception as e:
            print(f"Failed to load dataset '{self.name}': {e}")
            self.loaded = False

    def ensure_loaded(self):
        if not self.loaded:
            raise RuntimeError(f"Dataset '{self.name}' not available. Expected zarr at: {self.zarr_path}")


# Registry: add species here.
DATASETS = {
    "carrot": SpeciesData(
        "carrot",
        "backend/data/carrot_300.zarr",
        "backend/data/variant_gene_map.pkl",
        "backend/data/gene_variant_index.pkl",
    ),
    "onion": SpeciesData(
        "onion",
        "backend/data/onion_300.zarr",
        "backend/data/onion_variant_gene_map.pkl",
        "backend/data/onion_gene_variant_index.pkl",
    ),
}
