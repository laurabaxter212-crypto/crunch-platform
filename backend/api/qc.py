# backend/api/qc.py
"""
Safe, summary-only QC endpoints for CRUNCH.

Computes QC stats in chunks to avoid loading large arrays.
Outputs a compact JSON summary + cached qc_summary.json.
"""

from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import zarr, numpy as np, json, time

router = APIRouter()
CACHE_FILENAME = "qc_summary.json"


# ------------------------- helpers -------------------------

def _find_zarr_path(species: str) -> Path:
    candidates = [
        Path("backend") / "data" / f"{species}_300.zarr",
        Path("backend") / "data" / f"{species}.zarr",
        Path("backend") / "data" / species,
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(f"No zarr found for species '{species}'")


def _jsonable(o):
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (np.integer, np.floating)):
        return o.item()
    if isinstance(o, bytes):
        return o.decode("utf-8", errors="ignore")
    if isinstance(o, dict):
        return {str(k): _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(x) for x in o]
    return o


def _read_variant_field(variants, name, start, stop):
    if name in variants:
        try:
            return np.asarray(variants[name][start:stop])
        except Exception:
            return None
    return None


# ------------------------- main endpoint -------------------------

@router.get("/{species}/qc/summary")
def qc_summary(species: str, chunk_size: int = Query(10000, description="Variants per chunk")):

    # -------- load or reuse cache --------
    try:
        zarr_path = _find_zarr_path(species)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))

    cache_file = zarr_path / CACHE_FILENAME
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except Exception:
            pass

    # -------- open zarr --------
    try:
        root = zarr.open(str(zarr_path), mode="r")
    except Exception as e:
        raise HTTPException(500, f"Failed to open zarr: {e}")

    if "calldata" not in root or "GT" not in root["calldata"]:
        raise HTTPException(400, "Missing calldata/GT in zarr")

    variants = root["variants"]
    gt = root["calldata"]["GT"]
    samples_raw = root["samples"][:].tolist()
    samples = [
        s.decode("utf-8") if isinstance(s, (bytes, bytearray)) else str(s)
        for s in samples_raw
    ]

    n_variants = int(gt.shape[0])
    n_samples = int(gt.shape[1])
    ploidy = gt.shape[2]

    # -------- accumulators --------
    missing_per_sample = np.zeros(n_samples, dtype=np.int64)
    het_per_sample = np.zeros(n_samples, dtype=np.int64)
    called_per_sample = np.zeros(n_samples, dtype=np.int64)

    # histogram bins
    af_bins = np.linspace(0, 1, 51)
    dp_bins = np.array([0,1,2,5,10,20,50,100,200,500,1000], dtype=float)
    mq_bins = np.linspace(0, 60, 61)           # from your min/max scan
    qual_bins = np.linspace(20, 230, 53)       # covers QUAL 20–228 nicely
    miss_bins = np.linspace(0, 1, 51)

    af_counts = np.zeros(len(af_bins)-1, dtype=np.int64)
    dp_counts = np.zeros(len(dp_bins)-1, dtype=np.int64)
    mq_counts = np.zeros(len(mq_bins)-1, dtype=np.int64)
    qual_counts = np.zeros(len(qual_bins)-1, dtype=np.int64)
    miss_counts = np.zeros(len(miss_bins)-1, dtype=np.int64)

    # -------- iterate in chunks --------
    for start in range(0, n_variants, chunk_size):
        stop = min(n_variants, start + chunk_size)

        # GT
        gt_chunk = np.asarray(gt[start:stop, :, :])
        missing_mask = np.any(gt_chunk < 0, axis=2)

        missing_per_sample += missing_mask.sum(axis=0)
        called_per_sample += (~missing_mask).sum(axis=0)

        if ploidy >= 2:
            het_mask = (gt_chunk[...,0] != gt_chunk[...,1]) & (~missing_mask)
        else:
            het_mask = np.zeros_like(missing_mask)
        het_per_sample += het_mask.sum(axis=0)

        # variant-level arrays
        ac = _read_variant_field(variants, "AC", start, stop)
        an = _read_variant_field(variants, "AN", start, stop)
        dp = _read_variant_field(variants, "DP", start, stop)
        mq = _read_variant_field(variants, "MQ", start, stop)
        qual = _read_variant_field(variants, "QUAL", start, stop)

        # ----- AF -----
        if ac is not None and an is not None:
            ac_arr = np.asarray(ac)
            an_arr = np.asarray(an)
            if ac_arr.ndim == 2:
                ac_sum = ac_arr.sum(axis=1)
            else:
                ac_sum = ac_arr
            with np.errstate(divide='ignore', invalid='ignore'):
                af = np.where(an_arr > 0, ac_sum / an_arr, np.nan)
        else:
            # fallback AF from GT
            valid = ~missing_mask
            alt_counts = np.sum(np.where(valid, gt_chunk.sum(axis=2), 0), axis=1)
            called = valid.sum(axis=1)
            with np.errstate(divide='ignore', invalid='ignore'):
                af = np.where(called > 0, alt_counts / (2.0 * called), np.nan)

        af_vals = af[~np.isnan(af)]
        if af_vals.size > 0:
            c, _ = np.histogram(af_vals, bins=af_bins)
            af_counts += c

        # ----- DP -----
        if dp is not None:
            dp_vals = np.asarray(dp, dtype=float)
            dp_vals = dp_vals[~np.isnan(dp_vals)]
            if dp_vals.size > 0:
                c, _ = np.histogram(dp_vals, bins=dp_bins)
                dp_counts += c

        # ----- MQ -----
        if mq is not None:
            mq_vals = np.asarray(mq, dtype=float)
            mq_vals = mq_vals[~np.isnan(mq_vals)]
            if mq_vals.size > 0:
                c, _ = np.histogram(mq_vals, bins=mq_bins)
                mq_counts += c

        # ----- QUAL -----
        if qual is not None:
            q_vals = np.asarray(qual, dtype=float)
            q_vals = q_vals[~np.isnan(q_vals)]
            if q_vals.size > 0:
                c, _ = np.histogram(q_vals, bins=qual_bins)
                qual_counts += c

        # ----- missing rate per variant -----
        miss_rate = missing_mask.sum(axis=1) / float(n_samples)
        c, _ = np.histogram(miss_rate, bins=miss_bins)
        miss_counts += c

    # -------- per-sample summary --------
    per_sample = []
    for i, s in enumerate(samples):
        called = int(called_per_sample[i])
        missing = int(missing_per_sample[i])
        het = int(het_per_sample[i])
        per_sample.append({
            "sample": s,
            "called": called,
            "missing": missing,
            "missing_rate": missing / n_variants,
            "het": het,
            "het_rate": het / called if called > 0 else None,
        })

    # -------- output --------
    out = {
        "species": species,
        "n_variants": n_variants,
        "n_samples": n_samples,
        "samples": samples,
        "sample_missing": missing_per_sample.tolist(),
        "sample_het": het_per_sample.tolist(),
        "histograms": {
            "af": {"bins": af_bins.tolist(), "counts": af_counts.tolist()},
            "dp": {"bins": dp_bins.tolist(), "counts": dp_counts.tolist()},
            "mq": {"bins": mq_bins.tolist(), "counts": mq_counts.tolist()},
            "qual": {"bins": qual_bins.tolist(), "counts": qual_counts.tolist()},
            "missing_rate": {"bins": miss_bins.tolist(), "counts": miss_counts.tolist()},
        },
        "computed_at": time.time(),
    }

    # save cache
    try:
        cache_file.write_text(json.dumps(_jsonable(out)))
    except Exception:
        pass

    return out
