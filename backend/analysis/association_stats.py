import numpy as np
from scipy.stats import chi2_contingency

def snp_assoc(geno, phenotype):
    pvals = []
    for v in range(geno.shape[0]):
        gt = geno[v,:]
        mask = gt != -1

        table = []
        for allele in [0,1,2]:
            row = [
                ((gt[mask] == allele) & (phenotype[mask] == 0)).sum(),
                ((gt[mask] == allele) & (phenotype[mask] == 1)).sum()
            ]
            table.append(row)

        try:
            _, p, _, _ = chi2_contingency(table)
        except:
            p = 1.0

        pvals.append(p)

    return np.array(pvals)


def aggregate_by_gene(pvals, variant_to_gene):
    gene_scores = {}
    for idx, p in enumerate(pvals):
        gene = variant_to_gene[idx]
        gene_scores.setdefault(gene, []).append(p)

    aggregated = {
        g: float(-np.log10(np.mean(vals)))
        for g, vals in gene_scores.items()
    }
    return aggregated

