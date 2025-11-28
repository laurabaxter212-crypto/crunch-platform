# backend/api/metadata.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
from backend.data.load_data import DATASETS
from backend.metadata.store import MetadataStore
from backend.utils.metadata_utils import parse_csv_or_json_filebytes, validate_samples

router = APIRouter(prefix="", tags=["metadata"])

def get_metadata_store_for_species(species: str) -> MetadataStore:
    # Use the same data root as your existing data layout (backend/data/)
    return MetadataStore(species=species)

@router.get("/{species}/metadata")
def get_metadata(species: str):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    ds.ensure_loaded()
    store = get_metadata_store_for_species(species)
    return JSONResponse(content=store.get_all())

@router.get("/{species}/metadata/fields")
def get_metadata_fields(species: str):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    ds.ensure_loaded()
    store = get_metadata_store_for_species(species)
    # Optionally return type inference in the future
    return {"fields": store.get_fields()}

@router.post("/{species}/metadata/upload")
async def upload_metadata(
    species: str,
    file: UploadFile = File(...),
    allow_unknown: Optional[bool] = Query(False, description="If true, unknown samples are added to metadata instead of rejecting")
):
    """
    Upload CSV/TSV/JSON metadata for a species.

    Query param:
      - allow_unknown (bool): if true, unknown samples will be added to metadata (use with care).

    Responses:
      - 200 OK with {"status":"ok","updated":[<samples>]}
      - 400 with {"error": "...", "unknown_samples": [...], "matched_samples": [...]} if unknown samples found and allow_unknown==false
    """
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    ds.ensure_loaded()

    content = await file.read()
    try:
        parsed = parse_csv_or_json_filebytes(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    unknown_samples, matched = validate_samples(parsed, ds.samples)
    store = get_metadata_store_for_species(species)

    if unknown_samples and not allow_unknown:
        return JSONResponse(status_code=400, content={
            "error": "Some samples in uploaded metadata are unknown to this dataset.",
            "unknown_samples": unknown_samples,
            "matched_samples": matched
        })

    # If allow_unknown, treat unknown samples as valid keys (we still persist them)
    store.merge(parsed)
    return {"status": "ok", "updated": list(parsed.keys())}

