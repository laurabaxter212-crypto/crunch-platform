# CRUNCH — System Architecture

**Overview**

CRUNCH is a web platform for interactive exploration of genomic variant data across species. It supports gene-based and coordinate-based subsetting, PCA/MDS visualization, similarity metrics, clustering, and knowledge integration from public databases.

---

## High-level components

### Frontend (React)
- Pages: Home, Find Genes, Run analysis, Variant Browser (DivBrowse), Heatmap.
- Visualisations: interactive 2D/3D PCA (Plotly), heatmaps, tables.
- Features: column selection, click-to-copy LOCs/accessions, export PNG/CSV, integrate DivBrowse iframe.

### Backend (FastAPI)
- Router layout: `/api/{species}/...`
  - `/api/{species}/similarity` — compute similarity with chosen metric and reference accession
  - `/api/{species}/pca_mds` — compute PCA & MDS for chosen variants
  - `/api/{species}/heatmap` — pairwise distance matrix + clustering
  - `/api/{species}/find_genes` — search PubMed/Ensembl/PlantsDB and map symbols → LOC IDs
  - `/api/{species}/association` — per-SNP association tests and gene-level aggregation
  - `/api/data/{species}/samples` — list samples for UI dropdowns

### Data Layer
- `DATASETS` registry (in `backend/data/load_data.py`) — each species is a `SpeciesData` object.
- Storage formats:
  - Genotypes: Zarr (efficient slice access)
  - Annotations: GTF/GFF
  - Indices: pickled dictionaries (variant↔gene and gene↔variants)
- Adding a species: add an entry in `DATASETS` pointing to Zarr and index paths.

### Optional integrations
- DivBrowse for variant browsing
- KnetMiner for gene-trait networks
- Ensembl / EBI / GRIN for annotations and accession metadata
- Cloud object store for large datasets (S3/MinIO)

---

## Key design notes

- **Species pathing**: all dataset endpoints are prefixed with `{species}` to allow multiple datasets without code changes.
- **Subsetting**: accepts gene lists (LOC IDs), Dc symbols (mapped to LOC via Ensembl), and genomic coordinates `chr:start-end`.
- **PCA/Plot**: backend returns full matrix of PCs and explained variance so frontend can render any PC pair and 3D.
- **Interactivity**: clicks in PCA highlight & scroll to matching table row; points colored (reference green).
- **Exports**: PNG export uses Plotly client-side snapshot; CSV export for similarity tables.

---

## Recommended repo layout (high level)

/backend
/api
analysis.py
visualisation.py
knowledge.py
similarity.py
/data
datasets (zarr / pickles) [not committed]
/utils
/frontend
/src
pages
components
/docs
Architecture.md
Roadmap.md
/tests
backend_test.sh

## Next steps & operational notes
- Keep large files out of git; use `.gitignore` and optionally Git LFS for large non-sensitive data.
- Use automated tests to validate API surface (`openapi.json`), and a small CI step to run `backend_test.sh`.
- Provide developer docs for adding a species or regenerating indices.
