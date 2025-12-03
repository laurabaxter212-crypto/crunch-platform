# backend/api/pubmed.py

from fastapi import APIRouter, HTTPException
import requests
from functools import lru_cache

router = APIRouter()


# --------------------------------------------------------
# LRU CACHE (up to 2000 PMIDs cached in memory)
# --------------------------------------------------------
@lru_cache(maxsize=2000)
def _fetch_pubmed_title_cached(pmid: str):
    """
    Cached helper. If rate-limited, the error propagates but repeated
    requests for the same PMID never hit PubMed again.
    """
    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        f"?db=pubmed&id={pmid}&retmode=json"
    )

    r = requests.get(url, timeout=10)

    # Rate limit
    if r.status_code == 429:
        raise HTTPException(429, "PubMed rate limit reached (429)")

    if r.status_code != 200:
        raise HTTPException(
            503, f"PubMed unavailable (HTTP {r.status_code})"
        )

    data = r.json()

    if "result" not in data:
        raise HTTPException(503, "Unexpected PubMed response format")

    # Ignore "uids" key
    result = data["result"]
    uids = [k for k in result.keys() if k != "uids"]

    if not uids:
        raise HTTPException(404, "PMID not found")

    uid = uids[0]
    title = result[uid].get("title")

    if not title:
        raise HTTPException(404, "Title not found for PMID")

    return title


@router.get("/pubmed/title/{pmid}")
def get_pubmed_title(pmid: str):
    """Public endpoint calls cached function."""

    try:
        title = _fetch_pubmed_title_cached(pmid)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(503, f"PubMed fetch failed: {e}")

    return {"pmid": pmid, "title": title}
