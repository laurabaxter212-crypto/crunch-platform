import numpy as np
from scipy.cluster.hierarchy import linkage, dendrogram
from scipy.spatial.distance import squareform

def compute_pairwise_distance(geno, metric="numeric"):
    """
    geno: variants × samples genotype matrix (0/1/2)
    Returns a square distance matrix.
    """

    n = geno.shape[1]
    D = np.zeros((n, n))

    # Pre-fill missing
    geno_filled = geno.copy().astype(float)
    for v in range(geno_filled.shape[0]):
        row = geno_filled[v]
        m = row[row != -1].mean() if np.any(row != -1) else 0
        row[row == -1] = m

    # Compute pairwise distances
    for i in range(n):
        for j in range(i+1, n):
            if metric == "euclidean":
                d = np.sqrt(((geno_filled[:, i] - geno_filled[:, j]) ** 2).sum())
            else:
                # default: Manhattan (numeric genotype distance)
                d = np.abs(geno_filled[:, i] - geno_filled[:, j]).sum()

            D[i, j] = D[j, i] = d

    return D


def hierarchical_cluster(distance_matrix, method="ward"):
    """
    distance_matrix: NxN
    method: "ward" (default) or "average"
    """
    # Convert to condensed form
    condensed = squareform(distance_matrix, checks=False)

    Z = linkage(condensed, method=method)

    dendro = dendrogram(Z, no_plot=True)

    # Dendrogram gives an ordering of samples
    order = dendro["leaves"]

    return Z, order

