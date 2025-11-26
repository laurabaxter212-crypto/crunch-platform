import numpy as np
from sklearn.decomposition import PCA
from sklearn.manifold import MDS

def compute_pca(geno, max_components=20):
    """
    Return ALL PCA components (up to max_components or n_samples, whichever smaller).
    geno = genotype matrix [variants × samples]
    We transpose so PCA is on samples.
    """
    # transpose so rows = samples
    X = geno.T

    n_samples = X.shape[0]
    n_components = min(n_samples, max_components)

    pca = PCA(n_components=n_components)
    coords = pca.fit_transform(X)

    return coords, pca.explained_variance_ratio_.tolist()

def compute_mds(geno):
    X = geno.T
    mds = MDS(n_components=2, dissimilarity="euclidean")
    coords = mds.fit_transform(X)
    return coords
