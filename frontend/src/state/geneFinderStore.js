import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useGeneFinderStore = create(
  persist(
    (set) => ({
      hydrated: false,

      species: "carrot",
      phenotype: "",
      results: [],
      selected: {},

      setInputs: (species, phenotype) =>
        set({ species, phenotype }),

      setResults: (results) =>
        set({ results }),

      setSelected: (selected) =>
        set({ selected }),

      clear: () =>
        set({ results: [], selected: {} }),

      // hydration flag
      setHydrated: () => set({ hydrated: true })
    }),
    {
      name: "gene-finder-storage", // localStorage key
      onRehydrateStorage: () => (state) => {
        if (state) state.setHydrated();
      }
    }
  )
);
