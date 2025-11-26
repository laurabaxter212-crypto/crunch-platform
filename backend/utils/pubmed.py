import re
import requests
from backend.utils.gene_map import symbol_to_loc

PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


def fetch_pubmed_ids(phenotype: str, retmax: int = 20):
    """Search PubMed for carrot phenotype → return PMIDs"""
    query = f"carrot ({phenotype}) gene"
    params = {"db": "pubmed", "term": query, "retmax": retmax}
    r = requests.get(PUBMED_SEARCH_URL, params=params)

    if r.status_code != 200:
        return []

    return re.findall(r"<Id>(\d+)</Id>", r.text)


def extract_gene_symbols(text: str):
    """Extract Dc-like gene symbols"""
    return set(re.findall(r"Dc[A-Za-z0-9]+", text))


def search_pubmed_genes(phenotype: str):
    """
    Returns:
        {
            "DcABC1": [
                (pmid, "some evidence"),
                (pmid, "more evidence")
            ],
            ...
        }
    """
    pmids = fetch_pubmed_ids(phenotype)
    results = {}

    for pmid in pmids:
        fetch_params = {"db": "pubmed", "id": pmid, "rettype": "abstract"}
        text = requests.get(PUBMED_FETCH_URL, params=fetch_params).text

        gene_symbols = extract_gene_symbols(text)

        for symbol in gene_symbols:
            if symbol not in results:
                results[symbol] = []

            # Evidence text
            evidence = f"PubMed evidence for {symbol} (PMID {pmid})"

            results[symbol].append((pmid, evidence))

    return results

