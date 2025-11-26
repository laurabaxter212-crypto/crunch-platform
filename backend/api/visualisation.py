# backend/api/visualisation.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.analysis.subset import subset_variants_by_genes
from backend.analysis.encoding import encode_genotypes
from backend.analysis.dimensionality import compute_pca, compute_mds
from backend.analysis.clustering import compute_pairwise_distance, hierarchical_cluster
import numpy as np

router = APIRouter()

@router.post("/{species}/pca_mds")
def pca_mds(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    if not ds.loaded:
        raise HTTPException(status_code=503, detail=f"Dataset for '{species}' not loaded")

    gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
    combine = req.get("combine", "union")

    variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)
    if len(variant_idx) == 0:
        return {"error": "No variants found."}

    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)

    coords_pca, explained = compute_pca(geno)
    coords_mds = compute_mds(geno)

    return {
        "samples": ds.samples,
        "pca": {
            "coords": coords_pca.tolist(),    # shape: [n_samples][n_pcs]
            "explained": explained            # 1D list of explained variance ratios
        },
        "mds": {
            "coords": coords_mds.tolist()
        },
        "n_variants": len(variant_idx)
    }

@router.post("/{species}/heatmap")
def heatmap(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(status_code=404, detail=f"Unknown species: {species}")
    if not ds.loaded:
        raise HTTPException(status_code=503, detail=f"Dataset for '{species}' not loaded")

    gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
    combine = req.get("combine", "union")
    metric = req.get("distance_metric", "numeric")
    linkage_method = req.get("linkage", "ward")

    variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)
    if len(variant_idx) == 0:
        return {"error": "No variants found for selected genes"}

    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)

    D = compute_pairwise_distance(geno, metric=metric)
    Z, order = hierarchical_cluster(D, method=linkage_method)
    D_reordered = D[np.ix_(order, order)]

    return {
        "samples": [ds.samples[i] for i in order],
        "distance_matrix": D_reordered.tolist(),
        "linkage_tree": Z.tolist(),
        "n_variants": len(variant_idx)
    }
