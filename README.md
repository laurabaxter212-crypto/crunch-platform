![Status](https://img.shields.io/badge/status-active-blue)
![License](https://img.shields.io/badge/license-MIT-green)
# CRUNCH

![CRUNCH homepage](frontend/src/images/CRUNCH_helix.png)

**CRUNCH** is a web platform for exploring genotype variation across samples (SNPs/variants), built to support crop genomics datasets (e.g. carrot, but is extensible to other species).

## What you can do
- Browse variants and genotypes across samples
- Explore population structure (PCA) with metadata overlays
- Visualise sample similarity / clustering and heatmaps
- Search literature for genes related to phenotypes
- Query diversity with samples for subsets of genes
- Export subsets for downstream analysis (variants / samples)

## Quickstart (local development)

### Requirements
- Conda (recommended) or Python + Node

### Setup
```bash
## 1) clone
git clone https://github.com/<your-org-or-user>/crunch-platform.git
cd crunch-platform

## 2) create environment
conda env create -f environment.yml
conda activate crunch

## 3) backend
cd backend
python -m uvicorn app.main:app --reload

## 4) frontend (in a second terminal)
cd frontend
npm install
npm run dev
```
Now open in a browser:
http://localhost:5137

API documentation:
http://localhost:8000/docs

## Project structure
- `backend/` – API + analysis endpoints
- `frontend/` – web UI
- `docs/` – documentation and images

## Data and configuration
CRUNCH is designed to run against preprocessed variant datasets.
See `docs/` for expected input formats and configuration.

## Contributing
See `CONTRIBUTING.md`.

## Citing
If you use CRUNCH in academic work, please cite it (see `CITATION.cff`).

## License
See `LICENSE`.
