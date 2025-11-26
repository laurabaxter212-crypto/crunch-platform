# backend/api/knowledge.py
from fastapi import APIRouter, Query
from backend.utils.pubmed import search_pubmed_genes
from backend.utils.ensembl import ensembl_plants_genes
from backend.utils.plantsdb import search_plantsdb
from backend.utils.gene_map import symbol_to_loc

router = APIRouter()

@router.get("/{species}/find_genes")
def find_genes(
    species: str,
    phenotype: str = Query(...)
):
    """
    Find genes associated with a phenotype keyword.
    Species currently unused, but included for future multi-species support.
    """

    # --- Fetch evidence from each source ---
    pubmed_hits = search_pubmed_genes(phenotype)       # {symbol: [ (pmid, text) ]}
    ensembl_hits = ensembl_plants_genes(phenotype)     # {symbol: description}
    plantsdb_hits = search_plantsdb(phenotype)         # {gene: description}

    rows = []

    # --- PubMed ---
    for symbol, entries in pubmed_hits.items():
        loc_id = symbol_to_loc(symbol)
        for (pmid, evidence) in entries:
            rows.append({
                "symbol": symbol,
                "loc_id": loc_id,
                "source": "pubmed",
                "pmid": pmid,
                "evidence": evidence,
            })

    # --- Ensembl Plants ---
    for symbol, description in ensembl_hits.items():
        loc_id = symbol_to_loc(symbol)
        rows.append({
            "symbol": symbol,
            "loc_id": loc_id,
            "source": "ensembl",
            "pmid": None,
            "evidence": description,
        })

    # --- PlantsDB ---
    for symbol, description in plantsdb_hits.items():
        loc_id = symbol_to_loc(symbol)
        rows.append({
            "symbol": symbol,
            "loc_id": loc_id,
            "source": "plantsdb",
            "pmid": None,
            "evidence": description,
        })

    return {"species": species, "results": rows}
