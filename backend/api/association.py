from fastapi import APIRouter, HTTPException
import numpy as np

from backend.data.load_data import DATASETS
from backend.analysis.encoding import encode_genotypes
from backend.analysis.association_stats import snp_assoc, aggregate_by_gene

router = APIRouter()


@router.post("/{species}")
def association(species: str, req: dict):
    """
    Association analysis for a given species.

    Request:
    {
        "metadata": { "sampleA": 1, "sampleB": 0, ... },
        "phenotype_name": "Bolting resistance"
    }
    """

    # --- validate species ---
    if species not in DATASETS:
        raise HTTPException(status_code=404, detail=f"Species '{species}' not found")

    ds = DATASETS[species]
    ds.ensure_loaded()

    metadata = req.get("metadata", {})
    phenotype_name = req.get("phenotype_name", "phenotype")

    # --- build phenotype vector aligned to sample order ---
    pheno_vec = []
    missing = []

    for s in ds.samples:
        v = metadata.get(s, None)
        if v is None:
            missing.append(s)
        pheno_vec.append(v)

    if missing:
        return {
            "error": "Missing phenotype values for some samples",
            "missing_samples": missing
        }

    pheno_vec = np.array(pheno_vec, dtype=float)

    # --- extract full genotype matrix ---
    # Shape: (variants, samples, ploidy)
    gt = ds.gt[:, :, :]  # full dataset
    geno = encode_genotypes(gt)  # → (variants × samples)

    # --- compute SNP-level association ---
    pvals = snp_assoc(geno, pheno_vec)  # array of p-values

    # --- aggregate by gene ---
    gene_scores = aggregate_by_gene(pvals, ds.variant_to_gene)

    # --- sort descending (best associations first) ---
    ranked = sorted(gene_scores.items(), key=lambda x: -x[1])

    return {
        "species": species,
        "phenotype": phenotype_name,
        "top_genes": ranked[:50],
        "n_variants": len(pvals)
    }


