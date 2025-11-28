# backend/api/association.py
from fastapi import APIRouter, HTTPException
import numpy as np

from backend.data.load_data import DATASETS
from backend.analysis.encoding import encode_genotypes
from backend.analysis.association_stats import snp_assoc, aggregate_by_gene

router = APIRouter(tags=["association"])


def clean_sample(s: str) -> str:
    """Simplify long BAM-based sample ID strings."""
    return s.split(".")[0]


@router.post("/{species}/association")
def association(species: str, req: dict):
    """
    Association analysis (simple SNP–phenotype scoring).

    Expected request:
    {
        "metadata": { "SRR12345": 1, "SRR54321": 0, ... },
        "phenotype_name": "Bolting resistance"
    }
    """

    # ---------------------------
    # Validate dataset
    # ---------------------------
    ds = DATASETS.get(species)
    if ds is None:
        raise HTTPException(404, f"Unknown species '{species}'")

    ds.ensure_loaded()

    if ds.variant_to_gene is None:
        raise HTTPException(503, f"Variant→gene index missing for '{species}'")

    # ---------------------------
    # Parse request
    # ---------------------------
    metadata = req.get("metadata", {})
    phenotype_name = req.get("phenotype_name", "phenotype")

    if not isinstance(metadata, dict) or len(metadata) == 0:
        raise HTTPException(400, "metadata must be a non-empty {sample: value} object")

    # ---------------------------
    # Build phenotype vector
    # ---------------------------
    pheno_vec = []
    missing_samples = []

    for s in ds.samples:
        s_clean = clean_sample(s)
        value = metadata.get(s_clean)

        if value is None:
            missing_samples.append(s_clean)
        pheno_vec.append(value)

    if missing_samples:
        return {
            "error": "Missing phenotype values",
            "missing_samples": missing_samples
        }

    pheno_vec = np.array(pheno_vec, dtype=float)

    # ---------------------------
    # Extract genotypes
    # ---------------------------
    try:
        gt = ds.gt[:, :, :]
    except Exception as e:
        raise HTTPException(500, f"Could not extract genotype matrix: {e}")

    geno = encode_genotypes(gt)  # → (variants × samples)

    if geno.shape[1] != len(pheno_vec):
        raise HTTPException(
            500,
            f"Mismatched dimensions: {geno.shape[1]} genotype samples vs "
            f"{len(pheno_vec)} phenotype values"
        )

    # ---------------------------
    # Compute SNP-level p-values
    # ---------------------------
    try:
        pvals = snp_assoc(geno, pheno_vec)
    except Exception as e:
        raise HTTPException(500, f"Association computation failed: {e}")

    # ---------------------------
    # Aggregate by gene
    # ---------------------------
    try:
        gene_scores = aggregate_by_gene(pvals, ds.variant_to_gene)
    except Exception as e:
        raise HTTPException(500, f"Gene aggregation failed: {e}")

    ranked = sorted(gene_scores.items(), key=lambda x: -x[1])  # strongest signal first

    # ---------------------------
    # Return results
    # ---------------------------
    return {
        "species": species,
        "phenotype": phenotype_name,
        "top_genes": ranked[:50],
        "n_variants": len(pvals),
        "samples_used": [clean_sample(s) for s in ds.samples]
    }
