# backend/utils/clustering.py

import numpy as np
from scipy.cluster.hierarchy import linkage, dendrogram
from scipy.spatial.distance import squareform


def hierarchical_cluster(distance_matrix, method="ward"):
    """
    Perform hierarchical clustering and return reordered matrix + dendrogram coords
    that Plotly can consume directly.
    """

    # Convert full matrix → condensed form
    condensed = squareform(distance_matrix, checks=False)

    # Hierarchical linkage
    Z = linkage(condensed, method=method)

    # Compute dendrogram coordinates WITHOUT plotting
    dend = dendrogram(Z, no_plot=True)

    order = dend["leaves"]              # leaf order (list of sample indices)
    icoord = dend["icoord"]             # list of lists of x-coords
    dcoord = dend["dcoord"]             # list of lists of y-coords

    # Reorder the distance matrix using leaf order
    D_reordered = distance_matrix[np.ix_(order, order)]

    return {
        "order": order,
        "icoord": icoord,
        "dcoord": dcoord,
        "distance_matrix_reordered": D_reordered,
        "linkage": Z.tolist(),
    }
