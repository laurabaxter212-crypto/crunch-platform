# CRUNCH Roadmap — v0.2 → v1.0

## Overarching goals
- Harden the prototype into a reliable analysis platform.
- Add region-based workflows and a browsable variant viewer.
- Improve performance and allow multiple species/datasets.
- Prepare for an internal pilot and external demonstration.

---

## v0.2 (next sprint — 2–4 weeks)
**Goals:** Stability, useful UX improvements, coordinate support.

1. **Coordinate-based subsetting (chr:start-end)**
   - Backend: parse coordinates, map to variant indices, reuse subset pipeline.
   - Frontend: allow coordinate textbox alongside LOC lists.
   - Owner: Backend lead
   - Effort: 3–5 days

2. **Symbol→LOC mapping cache**
   - Build offline script to query Ensembl for all symbols discovered; persist mapping JSON.
   - Add cache lookup to `gene_map`.
   - Owner: Backend
   - Effort: 2–3 days

3. **Refactor similarity endpoint to accept species path consistently**
   - Ensure frontend uses `/api/{species}/similarity`.
   - Owner: Frontend + Backend
   - Effort: 1–2 days

4. **Improved error reporting + tests**
   - `backend_test.sh` expands to validate payloads and timings.
   - Add unit tests for subset and metrics.
   - Owner: QA/Dev
   - Effort: 3 days

---

## v0.3 (1 month)
**Goals:** UX polish, caching, export, integration testing.

1. **Integrate DivBrowse or SNPhub for direct variant browsing**
   - Embed DivBrowse, map selected region from Run Analysis.
   - Owner: Frontend/Integration
   - Effort: 1–2 weeks

2. **Client-side PCA enhancements**
   - Allow arbitrary PC selection, point selection → table highlight (complete).
   - Add Plotly-based PNG export (client-side).
   - Owner: Frontend
   - Effort: 3–5 days

3. **Caching & async jobs**
   - For heavy PCA/similarity runs, add job queue (optional).
   - Owner: Backend
   - Effort: 1 week (MVP)

---

## v0.4 (2 months)
**Goals:** Analysis expanders — GWAS and effect prediction integration.

1. **SNP effect pipeline integration (SnpEff/VEP)**
   - Add optional step to annotate variants for impact prediction.
   - Owner: Bioinformatics
   - Effort: 2–3 weeks

2. **Association (GWAS) UI**
   - UI to upload phenotype vector; backend association tests; gene-level aggregation.
   - Owner: Backend + Frontend
   - Effort: 2 weeks

---

## v1.0 (3–6 months)
**Goals:** Production-ready release, multi-species, documentation, deployment.

1. **Multi-species operationalization**
   - Add onion dataset(s), validate data loading and API contracts.
   - Owner: Data Engineering
   - Effort: variable (data-dependent)

2. **Containerized deployment + CI/CD**
   - Docker images, Helm or docker-compose, automated tests in CI.
   - Add monitoring, resource limits, and a staging environment.
   - Owner: DevOps
   - Effort: 2–3 weeks

3. **Security & user management**
   - AuthN/AuthZ, user roles, audit logs.
   - Owner: DevOps/Security
   - Effort: 2–3 weeks

4. **Polish & documentation**
   - Complete user guide, developer guide, reproducible environment capture (conda env + `environment.yml` or `mamba-lock`).
   - Owner: Docs/Dev
   - Effort: 1–2 weeks

---

## Prioritisation & notes

- **Critical early wins:** coordinate-based subsetting, caching of symbol→LOC, fixing API/route consistency.
- **Medium priority:** DivBrowse integration and PCA/plot improvements.
- **Longer term:** SNP effect workflows and production deployment.

---

## Estimates & team assumptions
- Estimates assume a small team (1–2 backend devs, 1 frontend dev, 1 bioinfo).
- Data-prep (creating zarr datasets) for new species may dominate timeline for species additions.
