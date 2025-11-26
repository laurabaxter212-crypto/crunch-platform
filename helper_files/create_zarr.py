import allel
import zarr
import numpy as np

# Input VCF
vcf_path = "/Users/smsdad/Documents/Bioinf/DEFRA/BAMs/merged.calls.filtered.vcf.gz"

# Output Zarr store
zarr_path = "carrot_300.zarr"

print("Reading VCF...")
callset = allel.read_vcf(
    vcf_path,
    fields=[
        "variants/*",
        "calldata/GT",
        "samples"
    ]
)

print("Saving Zarr...")
root = zarr.open_group(zarr_path, mode='w')

def convert_object_array(arr):
    """Convert object arrays (strings, lists) to fixed-length byte strings."""
    # 1. Convert Python lists → NumPy arrays
    if isinstance(arr, list):
        arr = np.array(arr, dtype=object)

    # 2. Only process object dtype arrays
    if arr.dtype != object:
        return arr

    # Convert each element to bytes
    # Handle nested lists (e.g., ALT alleles)
    def to_bytes(x):
        if isinstance(x, bytes):
            return x
        if isinstance(x, str):
            return x.encode("utf8")
        if isinstance(x, (list, tuple)):
            return str(x).encode("utf8")  # encode the list as a string
        return str(x).encode("utf8")

    # Vectorized conversion
    flat = np.vectorize(to_bytes, otypes=[object])(arr)

    # Determine max byte length
    maxlen = max(len(x) for x in flat.flatten())

    # Create fixed-length byte array
    return flat.astype(f"S{maxlen}")

# Write all fields
for key, array in callset.items():
    array = convert_object_array(array)
    root[key] = array

print("Done!")

