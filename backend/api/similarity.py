# backend/api/similarity.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.analysis.subset import subset_variants_by_genes
from backend.analysis.encoding import encode_genotypes
from backend.analysis.metrics import numeric_distance, exact_match_similarity, euclidean_distance, ibs_similarity

router = APIRouter()

@router.post("/{species}/similarity")
def compute_similarity(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    if not ds.loaded:
        raise HTTPException(status_code=503, detail=f"Dataset for '{species}' not loaded")

    gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
    combine = req.get("combine", "union")
    metric = req.get("similarity_measure", "numeric")
    ref_name = req.get("reference_accession")
    if not ref_name:
        raise HTTPException(status_code=400, detail="reference_accession is required")

    try:
        ref_idx = ds.samples.index(ref_name)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Reference accession '{ref_name}' not found in samples for {species}")

    variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)

    if len(variant_idx) == 0:
        return {"error": "No variants found."}

    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)

    if metric == "numeric":
        scores = numeric_distance(geno, ref_idx)
    elif metric == "match":
        scores = exact_match_similarity(geno, ref_idx)
    elif metric == "euclidean":
        scores = euclidean_distance(geno, ref_idx)
    else:
        scores = ibs_similarity(geno, ref_idx)

    results = []
    for i, sample in enumerate(ds.samples):
        if i == ref_idx:
            continue
        results.append({"accession": sample, "score": float(scores[i])})

    # rank
    if metric in ["numeric", "euclidean"]:
        results.sort(key=lambda x: x["score"])
    else:
        results.sort(key=lambda x: -x["score"])

    return {
        "reference": ref_name,
        "n_variants": len(variant_idx),
        "metric": metric,
        "results": results
    }
