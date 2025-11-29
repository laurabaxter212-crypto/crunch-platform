CHANGELOG
v0.1.0 — Initial Public Prototype

Date: 2025-11
Summary:
First full working version of CRUNCH with carrot genotype dataset.

Added

PCA + MDS visualisation

Association (gene-level)

Literature-based gene finder

Multi-species backend architecture

Ability to load carrot dataset from Zarr

Refactor API routes under /api/

SpeciesData loader with auto-detection of missing datasets

Frontend species dropdown

Clean sample names (strip BAM/VCF suffixes)

Backend test script (backend_test.sh)

Known next features

Global sample similarity heatmap

Genomic coordinate input support

DivBrowse & KnetMiner integration

SNPhub links

Find Genes ranking improvements

## [0.3.0] - 2025-11-28
### Added
- New `DistanceClustergram` component combining dendrogram and distance heatmap.
- New frontend visualisation pipeline to render SciPy dendrogram coordinates correctly.
- Support for hierarchical clustering display with aligned heatmap and tree.

### Changed
- Updated `HeatmapPage` to use the new `DistanceClustergram` component.
- Revised backend `clustering.py` to fix dendrogram orientation and line coordinate scaling.
- Updated backend `visualisation.py` endpoint to return matrix + dendrogram bundle for unified rendering.
- Updated `frontend/src/api/index.js` to point to the revised visualisation/clustering API.

### Removed
- Deprecated `DistanceHeatmap.jsx` component.

### Fixed
- Corrected distorted/“wonky” dendrogram line drawing caused by misinterpreted `icoord`/`dcoord` values.
- Improved stability and accuracy of the reordered distance matrix passed to the frontend.



v0.4.0 — Metadata System + Heatmap Enhancements

Released: 2025-11-29

✨ New Features

Full metadata backend system

Per-species metadata storage under backend/metadata/

Supports CSV/TSV upload and incremental updates

Fields exposed to frontend using exposed_fields.json

Persistent across server restarts

Metadata-aware heatmap

Colour strips drawn above heatmap driven by selected metadata field

Automatic categorical palette generation

Dynamic legend showing all category → colour mappings

Metadata fetching integrated cleanly into HeatmapPage.jsx

Metadata-aware clustergram

Column colour bar correctly aligned with dendrogram leaves

Metadata selection dropdown added

Export PNG and CSV still fully supported

Viridis-like palette added for categorical visualisation

🎨 Visual Improvements

Greatly improved dendrogram alignment

Leaves now centred relative to heatmap rows/columns

Column and row dendrograms scaled to correct heatmap centre positions

Fixed metadata blocks being half-width at edges

Cleaner spacing and layout

Plotly layout tuned for no-overlap

Metadata strip, dendrogram, and heatmap now line up precisely

🛠 Backend Enhancements

New routes:

GET /api/<species>/metadata

GET /api/<species>/metadata/fields

POST /api/<species>/metadata/upload

Metadata automatically merged into dataset at load time

Validation of unknown sample IDs

Full read/write storage handled by backend/metadata/store.py

Updated heatmap and PCA endpoints to return metadata blocks

🧹 Cleanup

Removed all tracked __pycache__ directories

Updated .gitignore to prevent pycache from being committed again

Minor code organisation improvements across backend & frontend

🐛 Fixed

Incorrect dendrogram positioning relative to heatmap

Metadata bars not rendering at correct widths

Missing metadata strip at edges of heatmap

Heatmap POST returning improper errors when using use_all=true

