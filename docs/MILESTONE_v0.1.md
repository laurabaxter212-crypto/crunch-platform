# CRUNCH — v0.1 Milestone Summary

**Milestone:** Development of prototype variant viewer — v0.1 (initial working prototype)

**Date:** (snapshot) — current working state

---

## What we delivered (progress to date)

- Backend FastAPI server with core endpoints:
  - `/api/{species}/similarity` — similarity scoring with multiple metrics
  - `/api/{species}/pca_mds` — computes PCA and MDS from selected variants
  - `/api/{species}/heatmap` — distance matrix + hierarchical clustering
  - `/api/{species}/find_genes` — PubMed/Ensembl/PlantsDB evidence aggregation
  - `/api/data/{species}/samples` — sample listing for UI dropdowns
- Frontend React app:
  - Find Genes page (aggregates, merges by LOC, copy-to-clipboard, clickable PubMed links)
  - Run Analysis page:
    - Paste LOCs + blocks, choose combine=union|intersection
    - Select reference accession (dropdown)
    - Run similarity, compute PCA/MDS
    - Interactive Plotly 2D + optional 3D plot
    - Export CSV and PNG
- Multi-species-ready backend registry (`DATASETS`) with carrot present and onion placeholder
- Utility testing script `backend_test.sh` to exercise endpoints

---

## Known issues & fixes applied

- Fixed route prefixes to include `{species}` across API and frontend calls.
- Mapped PubMed symbols to LOC via Ensembl; unresolved symbols flagged.
- De-duplicated gene evidence and merged entries by LOC in the frontend.
- Fixed several import, CORS and API path issues; updated frontend API helper module.
- Prevented large data files being committed to Git (added `.gitignore`, suggested Git LFS).

---

## Recommended improvements (short term)

1. **Robust symbol→LOC mapping cache**: build and persist a mapping so lookups are not done per-request.
2. **Coordinate parsing & direct region support**: allow `chr:start-end` inputs and fast subsetting.
3. **Error handling & user messages**: surface friendly errors on the frontend (no more raw `HTTP 500` messages).
4. **Tests & CI**: run `backend_test.sh` in CI; unit tests for subset functions and PCA.
5. **Security & deployment**: containerize backend, configure basic auth for staging, and add resource limits.

---

## Long-term/extensions (v0.2 → v1.0 highlights)

- Variant-browser integration (DivBrowse), multi-dataset management, SNP effect pipelines (VEP/SnpEff), GWAS dashboards, and user-upload/processing pipelines.

---

**Conclusion**

v0.1 is a functional prototype demonstrating the platform, interactive visualisations, and multi-species capability scaffolding. Next priorities are robustness (caching, better error handling), region-based subsetting, and UX polish.

