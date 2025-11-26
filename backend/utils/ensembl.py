import requests

def ensembl_plants_genes(phenotype: str):
    url = f"https://rest.ensembl.org/xrefs/symbol/daucus_carota/{phenotype}?content-type=application/json"
    try:
        r = requests.get(url)
        if r.ok:
            return {item["id"]: "Ensembl keyword match" for item in r.json()}
    except:
        pass
    return {}

