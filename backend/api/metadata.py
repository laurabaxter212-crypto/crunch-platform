# backend/api/metadata.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
from backend.data.load_data import DATASETS
from backend.metadata.store import MetadataStore
from backend.utils.metadata_utils import parse_csv_or_json_filebytes, validate_samples

router = APIRouter(prefix="", tags=["metadata"])
# app registers routers with prefix "/api" already (see backend/app.py)

def get_metadata_store_for_species(species: str) -> MetadataStore:
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
    """
    Return only the configured/exposed metadata fields and the display names map.
    Response:
      { "fields": ["colour", ...], "display_names": { "colour": "Colour", ... } }
    """
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    ds.ensure_loaded()
    store = get_metadata_store_for_species(species)
    fields = store.get_exposed_fields()
    display_names = store.get_display_names_map()
    return {"fields": fields, "display_names": display_names}

@router.post("/{species}/metadata/upload")
async def upload_metadata(
    species: str,
    file: UploadFile = File(...),
    allow_unknown: Optional[bool] = Query(False, description="If true, unknown samples are added to metadata instead of rejecting")
):
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

    # Merge parsed metadata into store and persist
    store.merge(parsed)

    return {"status": "ok", "updated": list(parsed.keys())}
