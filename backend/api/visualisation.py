# backend/api/visualisation.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.analysis.subset import subset_variants_by_genes
from backend.analysis.encoding import encode_genotypes
from backend.analysis.dimensionality import compute_pca, compute_mds
from backend.analysis.clustering import compute_pairwise_distance, hierarchical_cluster
import numpy as np

router = APIRouter(tags=["visualisation"])

def clean_sample(s):
    """Strip suffixes like .bam, .sorted.bam, .SAM.bam, etc."""
    return s.split(".")[0]


# ---------------------------------------------------------------------
#  PCA + MDS
# ---------------------------------------------------------------------
@router.post("/{species}/pca_mds")
def pca_mds(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(404, f"Unknown species '{species}'")
    if not ds.loaded:
        raise HTTPException(503, f"Dataset for '{species}' not loaded")

    if ds.gene_to_variants is None:
        raise HTTPException(503, f"Gene-to-variant index missing for '{species}'")

    # Extract blocks of gene lists
    gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
    combine = req.get("combine", "union")

    # Variant selection
    variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)
    if len(variant_idx) == 0:
        return {"error": "No variants found."}

    # Genotypes
    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)

    # PCA + MDS coordinates
    coords_pca, explained = compute_pca(geno)
    coords_mds = compute_mds(geno)

    return {
        "samples": [clean_sample(s) for s in ds.samples],
        "pca": {
            "coords": coords_pca.tolist(),
            "explained": explained
        },
        "mds": {
            "coords": coords_mds.tolist()
        },
        "n_variants": len(variant_idx)
    }


# ---------------------------------------------------------------------
#  HEATMAP (pairwise distance + hierarchical clustering)
# ---------------------------------------------------------------------
@router.post("/{species}/heatmap")
def heatmap(species: str, req: dict):
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(404, f"Unknown species '{species}'")
    if not ds.loaded:
        raise HTTPException(503, f"Dataset for '{species}' not loaded")

    if ds.gene_to_variants is None:
        raise HTTPException(503, f"Gene-to-variant index missing for '{species}'")

    # Inputs
    gene_blocks = [b.get("genes", []) for b in req.get("phenotype_blocks", [])]
    combine = req.get("combine", "union")
    metric = req.get("distance_metric", "numeric")
    linkage_method = req.get("linkage", "ward")

    # Variant subset
    variant_idx = subset_variants_by_genes(gene_blocks, combine, ds.gene_to_variants)
    if len(variant_idx) == 0:
        return {"error": "No variants found for selected genes"}

    # Genotypes
    gt = ds.gt.get_orthogonal_selection((variant_idx, slice(None), slice(None)))
    geno = encode_genotypes(gt)

    # Pairwise distance + clustering
    D = compute_pairwise_distance(geno, metric=metric)
    Z, order = hierarchical_cluster(D, method=linkage_method)

    # Reorder output
    reordered_samples = [clean_sample(ds.samples[i]) for i in order]
    D_reordered = D[np.ix_(order, order)]

    return {
        "samples": reordered_samples,
        "distance_matrix": D_reordered.tolist(),
        "linkage_tree": Z.tolist(),
        "n_variants": len(variant_idx)
    }
