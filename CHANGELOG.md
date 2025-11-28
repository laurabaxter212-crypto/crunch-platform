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

