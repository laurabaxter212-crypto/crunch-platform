# backend/api/visualisation.py
from fastapi import APIRouter, HTTPException
from backend.data.load_data import DATASETS
from backend.analysis.subset import subset_variants_by_genes
from backend.analysis.encoding import encode_genotypes
from backend.analysis.dimensionality import compute_pca, compute_mds
from backend.analysis.clustering import hierarchical_cluster
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
#  HEATMAP (hierarchical clustering)
# ---------------------------------------------------------------------
@router.post("/{species}/heatmap")
def heatmap(species: str, req: dict):

    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(404, f"Unknown species '{species}'")
    ds.ensure_loaded()

    # --- sample selection ---
    requested_samples = req.get("samples", None)
    if requested_samples:
        sample_map = { clean_sample(s): i for i, s in enumerate(ds.samples) }
        sample_idx = [sample_map[clean_sample(s)] for s in requested_samples]
        samples = requested_samples
    else:
        sample_idx = list(range(len(ds.samples)))
        samples = [clean_sample(s) for s in ds.samples]

    # --- all SNP mode? ---
    use_all = bool(req.get("use_all", False))
    max_snps = int(req.get("max_snps", 100000))

    if use_all:
        total = ds.gt.shape[0]
        max_snps = min(max_snps, total)
        idx = np.random.choice(total, size=max_snps, replace=False)
        gt = ds.gt[idx][:, sample_idx, :]
        geno = encode_genotypes(gt)
        dist = np.abs(geno[:, :, None] - geno[:, None, :]).mean(axis=0)

    else:
        blocks = req.get("phenotype_blocks", [])
        if not blocks:
            raise HTTPException(400, "phenotype_blocks required unless use_all=true")

        # GENES → VARIANTS
        gene_blocks = [b.get("genes", []) for b in blocks]
        variant_idx = subset_variants_by_genes(gene_blocks, "union", ds.gene_to_variants)
        if len(variant_idx) == 0:
            return {"error": "No variants found"}

        gt = ds.gt.get_orthogonal_selection((variant_idx, sample_idx, slice(None)))
        geno = encode_genotypes(gt)
        dist = np.abs(geno[:, :, None] - geno[:, None, :]).mean(axis=0)

    # --- cluster ---
    cluster = hierarchical_cluster(dist)

    order = cluster["order"]
    reordered_samples = [samples[i] for i in order]

    return {
        "samples": reordered_samples,
        "distance_matrix": cluster["distance_matrix_reordered"].tolist(),
        "dendrogram": {
            "icoord": cluster["icoord"],
            "dcoord": cluster["dcoord"],
            "labels": reordered_samples,
            "leaves": order,
        },
        "n_variants": dist.shape[0],
        "max_snps_used": int(max_snps),
    }
