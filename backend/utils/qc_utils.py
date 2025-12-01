# backend/utils/qc_utils.py
"""
Extended QC utilities for CRUNCH (zarr-backed).
Designed for zarr layout like:
 - calldata/GT         (n_variants, n_samples, ploidy)
 - samples              (n_samples,)
 - variants/AC, AN, DP, DP4, QUAL, CHROM, POS, REF, ALT, is_snp, FILTER_PASS, ...
This module computes per-sample and per-variant summaries in chunks
so it scales to large datasets.
"""

from typing import Any, Dict, Optional, Tuple
import numpy as np
import zarr
import math
from collections import Counter, defaultdict

# ----------------------
# Helpers
# ----------------------
def open_zarr(path_or_group):
    """Open or return zarr group."""
    if isinstance(path_or_group, str):
        return zarr.open(path_or_group, mode="r")
    return path_or_group  # assume already a zarr.Group

def _to_py(x):
    if isinstance(x, np.generic):
        return x.item()
    return x

def _is_missing_gt_array(gt_subarr: np.ndarray) -> np.ndarray:
    """
    Given GT subarray shape (chunk_variants, n_samples, ploidy),
    return a boolean array (chunk_variants, n_samples) True if missing call.
    Treat allele < 0 as missing, or all-zeros? we assume allele < 0 indicates missing.
    """
    # missing if any allele < 0 (scikit-allel style)
    try:
        return np.any(gt_subarr < 0, axis=2)
    except Exception:
        # fallback if GT encoded differently: treat e.g. b'.' as missing
        # convert to int where possible
        return np.any(np.vectorize(lambda x: (x is None) or (isinstance(x, float) and np.isnan(x)))(gt_subarr), axis=2)

def _is_het(gt_subarr: np.ndarray) -> np.ndarray:
    """
    Return boolean array shape (variants, samples) True if heterozygous call.
    """
    # heterozygous if alleles both non-missing and allele0 != allele1
    missing = _is_missing_gt_array(gt_subarr)
    # allele0 != allele1
    try:
        a0 = gt_subarr[..., 0]
        a1 = gt_subarr[..., 1]
        het = (a0 != a1) & (~missing)
        return het
    except Exception:
        # fallback
        return np.zeros(missing.shape, dtype=bool)

def compute_af_from_ac_an(ac_arr, an_arr):
    """
    Compute AF vector given AC and AN arrays.
    AC may be shape (n_variants, n_alleles) or (n_variants,) if single alt.
    We'll take the first alt allele's AC for AF.
    """
    ac = np.asarray(ac_arr)
    an = np.asarray(an_arr) if an_arr is not None else None
    if ac.ndim == 2:
        # take first alt count
        ac0 = ac[:, 0]
    else:
        ac0 = ac
    if an is not None:
        an = np.asarray(an)
        with np.errstate(divide='ignore', invalid='ignore'):
            af = np.where(an > 0, ac0 / an.astype(float), np.nan)
        return af
    # if AN missing, return nan
    return np.full(ac0.shape, np.nan, dtype=float)

def is_transition(ref: str, alt: str) -> Optional[bool]:
    """
    Return True for transition, False for transversion, None for non-ACGT or ambiguous
    """
    if not ref or not alt: return None
    r = ref.upper()
    a = alt.upper()
    pairs = {("A","G"),("G","A"),("C","T"),("T","C")}
    if (r in "ACGT") and (a in "ACGT") and (len(r)==1) and (len(a)==1):
        return (r,a) in pairs
    return None

# ----------------------
# Core QC functions
# ----------------------
def discover_arrays(zroot: zarr.Group) -> Dict[str, Any]:
    """
    Locate standard arrays in the Zarr root for our layout.
    Returns dict with keys: gt, samples, variants (group)
    """
    out = {}
    # GT: expect calldata/GT
    gt = None
    if "calldata" in zroot and "GT" in zroot["calldata"]:
        gt = zroot["calldata"]["GT"]
    elif "calldata/GT" in zroot:
        gt = zroot["calldata/GT"]  # alternate path
    else:
        # try top-level genotype
        if "genotype" in zroot:
            gt = zroot["genotype"]
    out["gt"] = gt

    # samples
    samples = None
    if "samples" in zroot:
        samples = np.asarray(zroot["samples"])
    elif "sample" in zroot and "ID" in zroot["sample"]:
        samples = np.asarray(zroot["sample"]["ID"])
    out["samples"] = samples

    # variants group
    variants = zroot["variants"] if "variants" in zroot else None
    out["variants"] = variants
    return out

def compute_chunked_summaries(zroot: zarr.Group, chunk_size: int = 10000) -> Dict[str, Any]:
    """
    Compute extended QC summaries in chunks of variants (chunk_size).
    Returns a dictionary summary ready for JSON serialization.
    """
    loc = discover_arrays(zroot)
    gt_arr = loc["gt"]
    samples = loc["samples"]
    variants = loc["variants"]

    if gt_arr is None or variants is None:
        raise ValueError("Zarr layout missing required 'calldata/GT' or 'variants' group.")

    n_variants = int(gt_arr.shape[0])
    n_samples = int(gt_arr.shape[1])
    ploidy = int(gt_arr.shape[2]) if len(gt_arr.shape) >= 3 else 1

    # accumulators for per-sample
    missing_counts_per_sample = np.zeros(n_samples, dtype=np.int64)
    het_counts_per_sample = np.zeros(n_samples, dtype=np.int64)
    homref_counts_per_sample = np.zeros(n_samples, dtype=np.int64)
    homalt_counts_per_sample = np.zeros(n_samples, dtype=np.int64)
    called_counts_per_sample = np.zeros(n_samples, dtype=np.int64)

    # accumulators for per-variant
    missing_counts_per_variant = np.zeros(n_variants, dtype=np.int64)
    af_arr = np.full(n_variants, np.nan, dtype=float)
    dp_arr = np.full(n_variants, np.nan, dtype=float)
    qual_arr = np.full(n_variants, np.nan, dtype=float)
    chroms = None
    pos_arr = None
    ref_arr = None
    alt_arr = None
    is_snp = None
    filter_pass = None

    # load variant-level arrays if present (may be large but 1D)
    def load_variant_field(name):
        try:
            if name in variants:
                return np.asarray(variants[name])
        except Exception:
            return None
        return None

    ac = load_variant_field("AC")
    an = load_variant_field("AN")
    dp = load_variant_field("DP")
    qual = load_variant_field("QUAL")
    dp4 = load_variant_field("DP4")
    chroms = load_variant_field("CHROM")
    pos_arr = load_variant_field("POS")
    ref_arr = load_variant_field("REF")
    alt_arr = load_variant_field("ALT")
    is_snp = load_variant_field("is_snp")
    filter_pass = load_variant_field("FILTER_PASS")

    # precompute AF where possible from AC/AN
    if ac is not None and an is not None:
        try:
            computed_af = compute_af_from_ac_an(ac, an)
            af_arr[:] = np.asarray(computed_af, dtype=float)
        except Exception:
            af_arr[:] = np.nan

    # iterate in chunks over variants to compute per-sample counts and missing per variant
    for start in range(0, n_variants, chunk_size):
        stop = min(n_variants, start + chunk_size)
        # read GT chunk: shape (chunk, n_samples, ploidy)
        gt_chunk = np.asarray(gt_arr[start:stop, :, :])
        # missing map (chunk, n_samples)
        missing_mask = _is_missing_gt_array(gt_chunk)
        # het mask
        het_mask = _is_het(gt_chunk)
        # hom_ref hom_alt: when not missing, both alleles equal 0 or 1 etc.
        # assume encoding 0 => homo ref, 1 => alt (for single alt)
        # we'll treat hom_ref when both alleles == 0, hom_alt when both alleles == 1
        a0 = gt_chunk[..., 0]
        a1 = gt_chunk[..., 1]
        hom_ref_mask = (a0 == 0) & (a1 == 0) & (~missing_mask)
        hom_alt_mask = (a0 == 1) & (a1 == 1) & (~missing_mask)

        # accumulate per-sample
        missing_counts_per_sample += missing_mask.sum(axis=0)
        het_counts_per_sample += het_mask.sum(axis=0)
        homref_counts_per_sample += hom_ref_mask.sum(axis=0)
        homalt_counts_per_sample += hom_alt_mask.sum(axis=0)
        called_counts_per_sample += (~missing_mask).sum(axis=0)

        # per-variant missing counts
        missing_counts_per_variant[start:stop] = missing_mask.sum(axis=1)

        # for variants where AF was not provided via AC/AN, compute from GT chunk
        if np.isnan(af_arr[start:stop]).any():
            # compute alt allele counts per variant chunk
            # convert het -> 1 alt allele, hom_alt -> 2 alt alleles
            # for general ploidy, sum alleles
            alt_counts = np.where(~missing_mask, np.sum(gt_chunk, axis=2), 0).sum(axis=1)
            called = (~missing_mask).sum(axis=1)
            with np.errstate(divide='ignore', invalid='ignore'):
                af_chunk = np.where(called > 0, alt_counts / (2.0 * called), np.nan)
            # only fill where af_arr is nan
            nan_mask = np.isnan(af_arr[start:stop])
            af_arr[start:stop][nan_mask] = af_chunk[nan_mask]

    # fill dp_arr, qual_arr from variant arrays if present
    if dp is not None:
        try:
            dp_arr[:] = np.asarray(dp, dtype=float)
        except Exception:
            dp_arr[:] = np.full(n_variants, np.nan, dtype=float)
    if qual is not None:
        try:
            qual_arr[:] = np.asarray(qual, dtype=float)
        except Exception:
            qual_arr[:] = np.full(n_variants, np.nan, dtype=float)

    # compute transition/transversion counts if ref/alt present
    ts = 0
    tv = 0
    if (ref_arr is not None) and (alt_arr is not None):
        for i in range(n_variants):
            r = str(ref_arr[i]).upper() if ref_arr is not None else None
            a = str(alt_arr[i]).upper() if alt_arr is not None else None
            t = is_transition(r, a)
            if t is True:
                ts += 1
            elif t is False:
                tv += 1

    # compute chromosome counts
    chrom_counts = {}
    if chroms is not None:
        for c in chroms:
            chrom_counts[str(c)] = chrom_counts.get(str(c), 0) + 1

    # Build histograms server-side for AF, DP, QUAL, missing_rate
    missing_rate = missing_counts_per_variant / float(n_samples)
    def hist(arr, bins=50, range=None):
        a = np.asarray(arr, dtype=float)
        a = a[~np.isnan(a)]
        if range is None:
            mn = float(np.nanmin(a)) if a.size > 0 else 0.0
            mx = float(np.nanmax(a)) if a.size > 0 else 1.0
        else:
            mn, mx = range
        if a.size == 0:
            return {"bins": [], "counts": []}
        counts, edges = np.histogram(a, bins=bins, range=(mn, mx))
        return {"bins": edges.tolist(), "counts": counts.tolist(), "min": mn, "max": mx}

    af_hist = hist(af_arr, bins=50, range=(0.0, 1.0))
    dp_hist = hist(dp_arr[~np.isnan(dp_arr)], bins=50) if np.any(~np.isnan(dp_arr)) else {"bins": [], "counts": []}
    qual_hist = hist(qual_arr[~np.isnan(qual_arr)], bins=50) if np.any(~np.isnan(qual_arr)) else {"bins": [], "counts": []}
    missing_hist = hist(missing_rate, bins=50, range=(0.0, 1.0))

    # per-sample summary arrays
    per_sample = {
        "samples": [str(x) for x in np.asarray(samples).tolist()] if samples is not None else None,
        "n_samples": int(n_samples),
        "missing_count": missing_counts_per_sample.tolist(),
        "missing_rate": (missing_counts_per_sample / float(n_variants)).tolist(),
        "het_count": het_counts_per_sample.tolist(),
        "het_rate": (het_counts_per_sample / np.maximum(1, called_counts_per_sample)).tolist(),
        "hom_ref_count": homref_counts_per_sample.tolist(),
        "hom_alt_count": homalt_counts_per_sample.tolist(),
        "called_count": called_counts_per_sample.tolist(),
    }

    variant_summary = {
        "n_variants": int(n_variants),
        "n_samples": int(n_samples),
        "ts_count": int(ts),
        "tv_count": int(tv),
        "ts_tv_ratio": (float(ts) / float(tv)) if tv > 0 else None,
        "af_hist": af_hist,
        "dp_hist": dp_hist,
        "qual_hist": qual_hist,
        "missing_rate_mean": float(np.mean(missing_rate)),
        "missing_rate_median": float(np.median(missing_rate)),
        "missing_hist": missing_hist,
        "chrom_counts": chrom_counts,
    }

    out = {
        "per_sample": per_sample,
        "per_variant": variant_summary,
        # note: include small arrays only if modest size; we already include histograms and counts
    }
    return out


def variant_filter_preview_from_thresholds(zroot: zarr.Group,
                                           min_dp: Optional[float] = None,
                                           min_qual: Optional[float] = None,
                                           min_af: Optional[float] = None,
                                           max_af: Optional[float] = None,
                                           max_missing_rate: Optional[float] = None) -> Dict[str, Any]:
    """
    Fast preview of how many variants pass thresholds by reading variant-level arrays only.
    """
    variants = zroot["variants"] if "variants" in zroot else None
    if variants is None:
        raise ValueError("No variants group found in zarr.")

    n_variants = int(variants["POS"].shape[0]) if "POS" in variants else int(next(iter(variants.values())).shape[0])

    mask = np.ones(n_variants, dtype=bool)

    if "DP" in variants and min_dp is not None:
        dp = np.asarray(variants["DP"], dtype=float)
        mask &= (dp >= float(min_dp))
    if "QUAL" in variants and min_qual is not None:
        q = np.asarray(variants["QUAL"], dtype=float)
        mask &= (q >= float(min_qual))
    if (min_af is not None or max_af is not None) and ("AC" in variants and "AN" in variants):
        ac = np.asarray(variants["AC"])
        an = np.asarray(variants["AN"])
        # compute AF from AC/AN
        af = compute_af_from_ac_an(ac, an)
        if min_af is not None:
            mask &= (af >= float(min_af))
        if max_af is not None:
            mask &= (af <= float(max_af))
    if max_missing_rate is not None and "GT" in zroot["calldata"]:
        # compute missingness in chunks
        gt = zroot["calldata"]["GT"]
        n_samples = int(gt.shape[1])
        missing_counts = np.zeros(n_variants, dtype=int)
        chunk = 10000
        for start in range(0, n_variants, chunk):
            stop = min(n_variants, start + chunk)
            g = np.asarray(gt[start:stop, :, :])
            missing_counts[start:stop] = np.any(g < 0, axis=2).sum(axis=1)
        missing_rate = missing_counts / float(n_samples)
        mask &= (missing_rate <= float(max_missing_rate))

    total = int(n_variants)
    passing = int(np.sum(mask))
    return {"n_variants_total": total, "n_variants_passing": passing, "fraction_passing": float(passing / total) if total > 0 else 0.0}

