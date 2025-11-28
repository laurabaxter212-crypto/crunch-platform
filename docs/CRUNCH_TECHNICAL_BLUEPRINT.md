CRUNCH PLATFORM — TECHNICAL BLUEPRINT
1. Overview

CRUNCH is a multi-species genomic exploration tool supporting:

SNP matrix loading via Zarr

PCA and MDS projections

Sample similarity

Heatmaps & clustering

Gene-based and SNP-based association scans

Literature-driven gene finding from PubMed, Ensembl Plants, PlantsDB

Backend: FastAPI
Frontend: React / Plotly.js
Primary species: Carrot, expandable to others.

2. Directory Structure (High-Level)
CRUNCH/
  backend/
    api/
      similarity.py
      knowledge.py
      visualisation.py
      association.py
      utility.py
    analysis/
    data/
      carrot_300.zarr/
      variant_gene_map.pkl
      ...
    utils/
  frontend/
    src/
      pages/
      api/
      components/
  docs/

3. Backend Architecture
3.1 SpeciesData
SpeciesData(
    name="carrot",
    zarr_path="backend/data/carrot_300.zarr",
    variant_to_gene_path="backend/data/variant_gene_map.pkl",
    gene_to_variants_path="backend/data/gene_variant_index.pkl"
)


Provides:

samples

gt = genotypes

variant_to_gene

gene_to_variants

DATASETS = {"carrot": SpeciesData(...), "onion": SpeciesData(...), ...}

3.2 API Routes (from OpenAPI)
Utility
GET  /api/ping
GET  /api/data/{species}/samples

Find Genes
GET /api/{species}/find_genes?phenotype=...

PCA/MDS
POST /api/{species}/pca_mds

Sample Similarity
POST /api/{species}/similarity

Heatmap / Clustering
POST /api/{species}/heatmap

Association
POST /api/{species}

4. Frontend Architecture
Pages
Home.jsx
GeneFinder.jsx
Analysis.jsx
Heatmap.jsx (planned)

API access

frontend/src/api/index.js exposes:

getSamples

runPcaMds

runSimilarity

runHeatmap

runAssociation

searchKnowledge

5. Planned Enhancements (MVP + Future Work)
5.1 Global Similarity Heatmap

Compute full NxN matrix:

similarity[i,j] = 1 - (Hamming distance)


Render with Plotly heatmap.

Add controls:

cluster ordering

sample metadata overlays

download matrix (CSV)

5.2 Genomic Coordinate Support

Accepted inputs:

Genes (DcMYB1)

Regions (chr1:100000-150000)

Lists of either

Pipeline:

Parse coordinate

Map to variant indices

Restrict GT matrix

Run PCA / similarity on subset

Backend changes:

Add region parsing utility

Expose coordinate endpoints

Frontend:

Update input widgets to support both genes and coordinates

Add helper UI to select coordinates

5.3 Find Genes Enhancements

Weight PubMed hits by relevance, date

LS-TM/semantic embedding search of abstracts

Merge Ensembl and PlantsDB in smarter ways

Add species-specific mapping tables

Provide interactive filtering

5.4 Multi-Species Scaling

Species dropdown affects all endpoints

Frontend stores species state in context

Backend loads dataset on first access

Prepare for dozens of species later

6. External Tools Integration Plan
6.1 DivBrowse

DivBrowse is a browser-based variant exploration tool designed to load:

VCF or Zarr

GFF/GTF annotations

Integration options:

Embed via iframe inside CRUNCH (easy)

Launch DivBrowse using CRUNCH’s Zarr
CRUNCH exposes a URL to a temporary filtered VCF

Synchronise coordinates
When a user clicks a gene in CRUNCH, open DivBrowse at that region.

Recommended: integration module in React:

<iframe src={`https://divbrowse-url/?region=${region}`} />

6.2 SNPhub

SNPhub supports:

GWAS browsing

Variant filtering

Metadata-based querying

Integration:

Provide “Open in SNPhub” links using species + coordinates

Optional: Export CRUNCH association results as SNPhub-compatible TSV

6.3 KnetMiner

KnetMiner provides gene-level knowledge graphs.

Integration:

Add “Open in KnetMiner” button next to each gene hit:

https://knetminer.com/<species>/gene/<gene_id>


Include external evidence links in GeneFinder.

7. Testing
Backend endpoint tests:

backend/tests/backend_test.sh

Run:

bash backend/tests/backend_test.sh

8. Deployability
Backend

Serve via uvicorn or gunicorn

Load conda environment via environment.yml

Use nginx reverse proxy

Frontend

npm run build → static bundle

Serve via nginx or Vercel
