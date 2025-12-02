# backend/api/utility.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.api.visualisation import MAX_SNPS_LIMIT

router = APIRouter()

@router.get("/{species}/samples")
def list_samples(species: str):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    if not ds.loaded:
        raise HTTPException(status_code=503, detail=f"Dataset for '{species}' not loaded (check data paths)")
    return {"samples": ds.samples}

@router.get("/{species}/variant_count")
def get_variant_count(species: str):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    if not ds.loaded:
        raise HTTPException(status_code=503, detail=f"Dataset for '{species}' not loaded (check data paths)")
    n_variants = int(ds.gt.shape[0])
    return {"species": species, "n_variants": n_variants}

@router.get("/{species}/config")
def get_config(species: str):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    return {"max_snps_limit": MAX_SNPS_LIMIT}

@router.get("/ping")
def ping():
    return {"message": "Backend is alive"}
