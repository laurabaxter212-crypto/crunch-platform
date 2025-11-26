import numpy as np

def numeric_distance(geno, ref):
    ref_vec = geno[:,ref]
    mask_ref = ref_vec != -1
    scores = {}

    for i in range(geno.shape[1]):
        g = geno[:, i]
        mask = (g != -1) & mask_ref
        scores[i] = np.abs(ref_vec[mask] - g[mask]).sum()

    return scores


def exact_match_similarity(geno, ref):
    ref_vec = geno[:,ref]
    mask_ref = ref_vec != -1

    scores = {}
    for i in range(geno.shape[1]):
        g = geno[:, i]
        mask = (g != -1) & mask_ref
        scores[i] = (ref_vec[mask] == g[mask]).mean()

    return scores


def euclidean_distance(geno, ref):
    ref_vec = geno[:,ref]
    mask_ref = ref_vec != -1

    scores = {}
    for i in range(geno.shape[1]):
        g = geno[:, i]
        mask = (g != -1) & mask_ref
        scores[i] = np.sqrt(((ref_vec[mask]-g[mask])**2).sum())

    return scores


def ibs_similarity(geno, ref):
    ref_vec = geno[:,ref]
    scores = {}

    for i in range(geno.shape[1]):
        g = geno[:, i]
        mask = (g != -1) & (ref_vec != -1)
        scores[i] = 1 - (np.abs(ref_vec[mask]-g[mask])/2).mean()

    return scores

