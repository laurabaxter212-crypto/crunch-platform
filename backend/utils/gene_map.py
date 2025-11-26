# backend/utils/gene_map.py

import requests

# === Curated DcSymbol → LOC mappings (HIGH CONFIDENCE) ===
CURATED = {
    "DcLCYB1": "LOC108205675",
    "DcLCYE": "LOC108205674",
    "DcPSY1": "LOC108211728",
    "DcPSY2": "LOC108211729",
    "DcZDS1": "LOC108217071",
    "DcCRT1": "LOC108217072",
    "DcCRT2": "LOC108217073",
    "DcPDS": "LOC108217070",
    "DcCYP97A3": "LOC108205676",
    "DcCYP97C1": "LOC108205677",
    "DcBCH1": "LOC108205678",
    "DcBCH2": "LOC108205679",
    "DcCCD4": "LOC108217078",

    # Anthocyanin / transcription factors
    "DcMYB7": "LOC108215440",
    "DcMYB6": "LOC108215439",
    "DcMYB8": "LOC108215441",
    "DcMYB113": "LOC108215442",
    "DcbHLH3": "LOC108215320",
    "DcGST1": "LOC108215890",

    # Sweetness / terpene pathway
    "DcTPS01": "LOC108219013",
    "DcTPS03": "LOC108219014",
    "DcTPS7": "LOC108219015",
    "DcTPS30": "LOC108219016",

    # Sugar / glycosyltransferases
    "DcUCGalT1": "LOC108214555",
    "DcUCGXT1": "LOC108214554",
    "DcUSAGT1": "LOC108214553",
    "DcSAT1": "LOC108214556",

    # Carrot uniform color / shape
    "DcRPGE1": "LOC108203002",
    "DcRPGE1W": "LOC108203003",
    "DcAPRR2": "LOC108203004",

    # Stress genes
    "DcDREB1A": "LOC108201918",

    # Genes with inconsistent capitalization
    "Dclcyb1": "LOC108205675",
}

# === Resolver ===

def symbol_to_loc(symbol: str):
    """Resolve carrot gene symbol → LOC ID using curated map + Ensembl fallback."""
    # 1. Local curated mapping (fast + reliable)
    if symbol in CURATED:
        return CURATED[symbol]

    # 2. Try Ensembl (rarely works for carrots)
    url = f"https://rest.ensembl.org/xrefs/symbol/daucus_carota/{symbol}"
    r = requests.get(url, headers={"Content-Type": "application/json"})

    if not r.ok:
        return None

    for hit in r.json():
        if hit.get("type") == "gene":
            return hit["id"]

    return None


def map_genes(symbols):
    mapping = {}
    for s in symbols:
        loc = symbol_to_loc(s)
        if loc:
            mapping[s] = loc
    return mapping

