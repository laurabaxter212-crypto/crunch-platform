# backend/api/similarity.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.analysis.subset import subset_variants_by_genes
from backend.analysis.encoding import encode_genotypes
from backend.analysis.clustering import hierarchical_cluster
from backend.analysis.metrics import (
    numeric_distance,
    exact_match_similarity,
    euclidean_distance,
    ibs_similarity,
)
import numpy as np

router = APIRouter()

import numpy as np
from backend.analysis.clustering import hierarchical_cluster

@router.post("/{species}/similarity_matrix")
def compute_similarity_matrix(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None or not ds.loaded:
        raise HTTPException(status_code=404, detail="Dataset not loaded")

    # ---- Parse SNP sampling settings ----
    use_all = req.get("use_all", False)
    max_snps = req.get("max_snps", None)
    sampling = req.get("sampling", "deterministic")
    seed = req.get("seed", 42)

    # ---- Variant selection ----
    if use_all:
        total = ds.gt.shape[0]

        if max_snps is None or max_snps >= total:
            # Use all SNPs
            variant_idx = np.arange(total)

        else:
            # Downsample variants
            if sampling == "random":
                rng = np.random.default_rng(seed)
                variant_idx = rng.choice(total, size=max_snps, replace=False)
                variant_idx.sort()
            else:
                # deterministic = first N SNPs
                variant_idx = np.arange(max_snps)

    else:
        # Gene-based selection
        gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
        combine = req.get("combine", "union")
        variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)

        if len(variant_idx) == 0:
            return {"error": "No variants found."}

    # ---- Extract genotypes ----
    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)  # shape: (variants, samples)

    n = geno.shape[1]
    D = np.zeros((n, n), float)

    # ---- Pairwise distance ----
    metric = req.get("similarity_measure", "numeric")
    for i in range(n):
        for j in range(i + 1, n):
            if metric == "numeric":
                d = np.nansum(np.abs(geno[:, i] - geno[:, j]))
            elif metric == "euclidean":
                d = np.sqrt(np.nansum((geno[:, i] - geno[:, j])**2))
            else:
                sim = np.mean(geno[:, i] == geno[:, j])
                d = 1 - sim
            D[i, j] = D[j, i] = d

    # ---- Clustering ----
    cluster = hierarchical_cluster(D)

    return {
        "samples": ds.samples,
        "n_variants": len(variant_idx),
        "max_snps_used": int(len(variant_idx)),
        "distance_matrix": D.tolist(),
        "distance_matrix_reordered": cluster["distance_matrix_reordered"].tolist(),
        "order": cluster["order"],
        "dendrogram": {
            "icoord": cluster["icoord"],
            "dcoord": cluster["dcoord"]
        }
    }



@router.post("/{species}/similarity") # compute similarity to **reference sample** based on gene blocks
def compute_similarity(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    if not ds.loaded:
        raise HTTPException(status_code=503, detail=f"Dataset for '{species}' not loaded")

    if ds.gene_to_variants is None:
        raise HTTPException(
            status_code=503,
            detail=f"Gene-to-variant index missing for species '{species}'."
        )

    # ---- Parse request ----
    gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
    combine = req.get("combine", "union")
    metric = req.get("similarity_measure", "numeric")
    ref_name = req.get("reference_accession")
    if not ref_name:
        raise HTTPException(status_code=400, detail="reference_accession is required")

    # ---- Resolve reference index ----
    try:
        ref_idx = ds.samples.index(ref_name)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Reference accession '{ref_name}' not found in samples for {species}"
        )

    # ---- Subset variants ----
    variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)
    if len(variant_idx) == 0:
        return {"error": "No variants found."}

    # ---- Slice and encode genotypes ----
    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)

    # ---- Compute similarity ----
    if metric == "numeric":
        scores = numeric_distance(geno, ref_idx)
    elif metric == "match":
        scores = exact_match_similarity(geno, ref_idx)
    elif metric == "euclidean":
        scores = euclidean_distance(geno, ref_idx)
    else:
        scores = ibs_similarity(geno, ref_idx)

    # ---- Build results ----
    results = []
    for i, sample in enumerate(ds.samples):
        if i == ref_idx:
            continue
        clean_name = sample.split(".")[0]   # short, clean sample ID
        results.append({"accession": clean_name, "score": float(scores[i])})

    # ---- Rank ----
    if metric in ["numeric", "euclidean"]:
        results.sort(key=lambda x: x["score"])
    else:
        results.sort(key=lambda x: -x["score"])

    return {
        "reference": ref_name.split(".")[0],
        "n_variants": len(variant_idx),
        "metric": metric,
        "results": results,
    }
