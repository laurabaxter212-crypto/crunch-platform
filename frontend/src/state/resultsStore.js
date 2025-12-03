import { create } from "zustand";

export const useResultsStore = create((set) => ({

  // =====================================================
  // HEATMAP
  // =====================================================
  heatmap: null,
  heatmapSettings: null,

  setHeatmap: (data, settings = null) =>
    set(() => ({
      heatmap: data,
      heatmapSettings: settings,
    })),

  clearHeatmap: () =>
    set(() => ({
      heatmap: null,
      heatmapSettings: null,
    })),

  // =====================================================
  // PCA / MDS (Run Analysis)
  // =====================================================
  analysisPcaMds: null,
  analysisSettings: null,

  setAnalysisPcaMds: (data, settings = null) =>
    set(() => ({
      analysisPcaMds: data,
      analysisSettings: settings,
    })),

  clearAnalysisPcaMds: () =>
    set(() => ({
      analysisPcaMds: null,
      analysisSettings: null,
    })),

  // =====================================================
  // GENE FINDER
  // =====================================================
  geneFinderResults: null,
  geneFinderPhenotype: "",
  geneFinderSpecies: "carrot",

  setGeneFinderResults: (results) =>
    set(() => ({
      geneFinderResults: results,
    })),

  setGeneFinderInputs: (species, phenotype) =>
    set(() => ({
      geneFinderSpecies: species,
      geneFinderPhenotype: phenotype,
    })),

  clearGeneFinder: () =>
    set(() => ({
      geneFinderResults: null,
      geneFinderPhenotype: "",
      geneFinderSpecies: "carrot",
    })),

}));
