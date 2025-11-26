import requests

def search_plantsdb(phenotype: str):
    url = "https://plantsdb.xyz/api/search"
    try:
        r = requests.get(url, params={"q": phenotype, "species": "carrot"})
        if r.ok:
            data = r.json()
            return {g["gene"]: g["description"] for g in data.get("genes", [])}
    except:
        pass
    return {}

