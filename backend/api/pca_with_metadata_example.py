# backend/api/pca_with_metadata_example.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.metadata.store import MetadataStore
from typing import List, Any, Dict

router = APIRouter(prefix="", tags=["pca_example"])

@router.get("/{species}/run/pca")
def run_pca_example(species: str, n_components: int = 2):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    ds.ensure_loaded()

    # Replace with your real PCA computation. This is a placeholder.
    ordered_samples: List[str] = ds.samples[:]  # keep the order you want in your frontend
    coords: List[List[float]] = [[0.0 for _ in range(n_components)] for _ in ordered_samples]

    # Attach metadata
    store = MetadataStore(species=species)
    metadata_map: Dict[str, Dict[str, Any]] = store.get_for_samples(ordered_samples)

    return {
        "samples": ordered_samples,
        "coords": coords,
        "metadata": metadata_map
    }

