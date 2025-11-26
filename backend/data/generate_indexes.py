#!/usr/bin/env python3
"""
generate_indexes.py

Robust, Zarr v3–compatible script to:
 - parse a GTF (gene features)
 - build interval trees per chromosome
 - annotate variants from a scikit-allel-style Zarr store
 - write two pickle outputs:
     * variant_gene_map.pkl   (dict: variant_index -> [gene_id,...])
     * gene_variant_index.pkl  (dict: gene_id -> [variant_index,...])

Place this file in backend/data/ and run:
    python generate_indexes.py

Adjust GTF_PATH or ZARR_PATH variables below if your files live elsewhere.
"""
from __future__ import annotations
import os
import pickle
from collections import defaultdict
from intervaltree import IntervalTree
import zarr

# --------------------
# Config (adjust if needed)
# --------------------
BASE_DIR = os.path.dirname(__file__) or "."
GTF_PATH = os.path.join(BASE_DIR, "GCF_001625215.2.gtf")  # update if different
ZARR_PATH = os.path.join(BASE_DIR, "carrot_300.zarr")     # update if different

OUT_VARIANT_PICKLE = os.path.join(BASE_DIR, "variant_gene_map.pkl")
OUT_GENE_PICKLE = os.path.join(BASE_DIR, "gene_variant_index.pkl")

# Process variants in chunks to avoid high memory use / speed up IO
CHUNK_SIZE = 1_000_000


# --------------------
# Helpers
# --------------------
def decode_if_bytes(x):
    """Return a Python str if x is bytes-like or numpy bytes scalar, else return as-is."""
    # numpy.bytes_ and bytes both handled
    try:
        # If x is a numpy scalar, .item() gives a Python type
        if hasattr(x, "item"):
            val = x.item()
        else:
            val = x
    except Exception:
        val = x

    if isinstance(val, (bytes, bytearray)):
        return val.decode("utf-8")
    return val


def parse_gene_id(attrs_field: str) -> str | None:
    """
    Robustly extract gene_id from GTF attributes column.
    Accepts forms like:
      gene_id "XYZ";
      gene_id "XYZ"; gene_name "abc";
    Returns the raw gene_id string or None.
    """
    # naive but robust split on ';' then find gene_id token
    for part in attrs_field.split(";"):
        part = part.strip()
        if not part:
            continue
        # Expected formats: gene_id "XYZ"  OR gene_id "XYZ"
        if part.startswith("gene_id"):
            # split once on space
            kv = part.split(" ", 1)
            if len(kv) == 2:
                return kv[1].strip().strip('"')
            # fallback: maybe no space
            maybe = part[len("gene_id"):].strip().strip('"')
            if maybe:
                return maybe
    return None


# --------------------
# Core functions
# --------------------
def parse_gtf(gtf_path: str) -> dict[str, list[tuple[int, int, str]]]:
    """Parse GTF and return dict: chrom -> list of (start, end, gene_id)."""
    if not os.path.exists(gtf_path):
        raise FileNotFoundError(f"GTF file not found: {gtf_path}")

    genes: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
    count = 0
    with open(gtf_path, "rt") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 9:
                continue
            chrom, source, feature, start_s, end_s, score, strand, frame, attributes = parts

            # normalize feature token and accept "gene"
            if feature.strip().lower().rstrip(";") != "gene":
                continue

            try:
                start = int(start_s)
                end = int(end_s)
            except ValueError:
                continue

            gene_id = parse_gene_id(attributes)
            if gene_id is None:
                continue

            chrom = decode_if_bytes(chrom)
            genes[chrom].append((start, end, gene_id))
            count += 1

    print(f"Parsed {count:,} genes across {len(genes):,} chromosomes from GTF: {gtf_path}")
    return genes


def build_trees(gene_dict: dict[str, list[tuple[int, int, str]]]) -> dict[str, IntervalTree]:
    """Build IntervalTree per chromosome from parsed gene intervals."""
    trees: dict[str, IntervalTree] = {}
    for chrom, entries in gene_dict.items():
        tree = IntervalTree()
        for start, end, gid in entries:
            # IntervalTree uses half-open intervals; use end+1 to include end
            tree[start:end + 1] = gid
        trees[chrom] = tree
    print(f"Built interval trees for {len(trees):,} chromosomes.")
    return trees


def annotate_variants(zarr_path: str, trees: dict[str, IntervalTree], chunk_size: int = CHUNK_SIZE):
    """Iterate variants in chunks and create two dicts: variant->genes and gene->variants."""
    if not os.path.exists(zarr_path):
        raise FileNotFoundError(f"Zarr store not found: {zarr_path}")

    root = zarr.open(zarr_path, mode="r")

    # Expect scikit-allel style layout under "variants"
    if "variants" not in root:
        raise KeyError(f"'variants' group not found in Zarr store: {zarr_path}")

    variants_group = root["variants"]
    # support both v2 and v3 (mapping-like access)
    # Access arrays (these are zarr arrays; avoid reading everything at once)
    if "CHROM" not in variants_group or "POS" not in variants_group:
        raise KeyError("variants/CHROM or variants/POS not found in Zarr store.")

    chroms = variants_group["CHROM"]
    positions = variants_group["POS"]

    # zarr v3 arrays: use .size or .shape[0]
    try:
        total = int(positions.size)
    except Exception:
        try:
            total = int(positions.shape[0])
        except Exception as e:
            raise RuntimeError("Unable to determine number of variants from Zarr POS array") from e

    print(f"Total variants: {total:,}")

    variant_to_genes: dict[int, list[str]] = {}
    gene_to_variants: dict[str, list[int]] = defaultdict(list)

    # Iterate in chunks
    for start in range(0, total, chunk_size):
        end = min(start + chunk_size, total)
        # read chunk (will be numpy arrays / scalars)
        chrom_chunk = chroms[start:end]   # array-like of bytes or strings
        pos_chunk = positions[start:end]  # numeric array

        # Ensure we can iterate over chunk elements
        for offset, (c_val, p_val) in enumerate(zip(chrom_chunk, pos_chunk)):
            i = start + offset  # global variant index

            chrom = decode_if_bytes(c_val)
            # ensure chrom is a hashable string
            if chrom is None:
                continue

            # convert pos to int (numpy scalar -> Python int)
            try:
                pos = int(p_val)
            except Exception:
                # skip malformed positions
                continue

            tree = trees.get(chrom)
            if not tree:
                continue

            hits = tree[pos]
            if not hits:
                continue

            # collect all gene ids overlapping this variant
            gids = []
            for h in hits:
                gid = h.data
                gids.append(gid)
                gene_to_variants[gid].append(i)

            # store only if any hits
            if gids:
                variant_to_genes[i] = gids

        # simple progress print
        print(f"  processed variants {start:,}–{end - 1:,}")

    total_links = sum(len(v) for v in variant_to_genes.values())
    print(f"Annotated {total_links:,} variant→gene links (variants touching ≥1 gene).")
    return variant_to_genes, gene_to_variants


def save_pickle(path: str, obj):
    with open(path, "wb") as fh:
        pickle.dump(obj, fh, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"Saved pickle: {path} (items: {len(obj):,})")


# --------------------
# Main
# --------------------
def main():
    print("Parsing GTF…")
    genes = parse_gtf(GTF_PATH)

    print("Building interval trees…")
    trees = build_trees(genes)

    print("Annotating variants… (this may take several minutes)")
    variant_map, gene_map = annotate_variants(ZARR_PATH, trees, chunk_size=CHUNK_SIZE)

    print("Saving outputs…")
    save_pickle(OUT_VARIANT_PICKLE, variant_map)
    save_pickle(OUT_GENE_PICKLE, gene_map)

    print("Done.")


if __name__ == "__main__":
    main()

