import React, { useState, useMemo, useEffect } from "react";
import { searchKnowledge, fetchPubmedTitle } from "../api";
import "./GeneFinder.css";
import { useGeneFinderStore } from "../state/geneFinderStore";

// Sleep helper
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export default function GeneFinder() {
  // Zustand store
  const {
    species: storeSpecies,
    phenotype: storePhenotype,
    results: storeResults,
    selected: storeSelected,
    setInputs,
    setResults,
    setSelected,
    clear
  } = useGeneFinderStore();

  // Local UI state
  const [species, setSpecies] = useState(storeSpecies);
  const [phenotype, setPhenotype] = useState(storePhenotype);
  const [mergedResults, setMergedResults] = useState(storeResults);
  const [selected, setSelectedLocal] = useState(storeSelected);
  const [loading, setLoading] = useState(false);

  // Sorting
  const [sortColumn, setSortColumn] = useState("loc_id");
  const [sortDirection, setSortDirection] = useState("asc");

  const [showColumns, setShowColumns] = useState({
    symbol: true,
    loc_id: true,
    source: true,
    pmid: true,
    evidence: true
  });
  const clearAll = () => {
    // 1. Clear Zustand store
    clear();

    // 2. Reset local state
    const defaultSpecies = "carrot";
    const defaultPhenotype = "";

    setSpecies(defaultSpecies);
    setPhenotype(defaultPhenotype);
    setMergedResults([]);
    setSelectedLocal({});

    // 3. Sync reset inputs back to Zustand
    setInputs(defaultSpecies, defaultPhenotype);
  };


  // ------------------------------------------------------------------
  // Restore Zustand → local state on first page load
  // ------------------------------------------------------------------
  useEffect(() => {
    setSpecies(storeSpecies);
    setPhenotype(storePhenotype);
    setMergedResults(storeResults);
    setSelectedLocal(storeSelected);
  }, []); // Only run once

  // Update store when user edits species/phenotype
  const onSpeciesChange = (value) => {
    setSpecies(value);
    setInputs(value, phenotype);
  };

  const onPhenotypeChange = (value) => {
    setPhenotype(value);
    setInputs(species, value);
  };

  // ------------------------------------------------------------------
  // Perform search
  // ------------------------------------------------------------------
  async function doSearch() {
    if (!phenotype.trim()) return;

    setLoading(true);
    setMergedResults([]);
    setSelectedLocal({});
    setSelected({}); // reset store selected

    try {
      const data = await searchKnowledge(species, phenotype);
      const rows = data.results || [];
      const geneMap = {};

      for (const r of rows) {
        const geneId = r.loc_id || r.symbol;
        if (!geneId) continue;

        if (!geneMap[geneId]) {
          geneMap[geneId] = {
            symbol: r.symbol || "",
            loc_id: r.loc_id || "",
            source: r.source || "",
            pmids: []
          };
        }

        if (r.pmid) {
          const pmids =
            Array.isArray(r.pmid)
              ? r.pmid
              : String(r.pmid).split(/[,\s]+/).filter(Boolean);

          pmids.forEach((pmid) => {
            if (!geneMap[geneId].pmids.find((x) => x.pmid === pmid)) {
              geneMap[geneId].pmids.push({ pmid, title: "Loading…" });
            }
          });
        }
      }

      const merged = Object.values(geneMap);

      // Update UI + store
      setMergedResults(merged);
      setResults(merged);
      setInputs(species, phenotype);

      // -------------------------------------
      // Fetch PubMed titles with rate limit
      // -------------------------------------
      for (const gene of merged) {
        for (const entry of gene.pmids) {
          let title = "(title unavailable)";

          try {
            const res = await fetchPubmedTitle(entry.pmid);
            if (res && typeof res.title === "string") {
              title = res.title;
            }
          } catch {
            /* Ignore, leave default */
          }

          entry.title = title;

          // Trigger UI re-render
          setMergedResults((prev) => [...prev]);

          // Also update store with safe non-functional setter
          const latest = merged.map((g) => ({ ...g }));
          setResults(latest);

          await sleep(350);
        }
      }
    } catch (err) {
      console.error("GeneFinder search failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------------
  // Sorting
  // ------------------------------------------------------------------
  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const sortedResults = useMemo(() => {
    const list = [...mergedResults];

    list.sort((a, b) => {
      let A, B;

      switch (sortColumn) {
        case "symbol":
          A = a.symbol || "";
          B = b.symbol || "";
          break;
        case "loc_id":
          A = a.loc_id || "";
          B = b.loc_id || "";
          break;
        case "source":
          A = a.source || "";
          B = b.source || "";
          break;
        case "pmid":
          A = a.pmids.length;
          B = b.pmids.length;
          break;
        case "evidence":
          A = a.pmids.map((x) => x.title).join(" ");
          B = b.pmids.map((x) => x.title).join(" ");
          break;
        default:
          A = "";
          B = "";
      }

      if (A < B) return sortDirection === "asc" ? -1 : 1;
      if (A > B) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [mergedResults, sortColumn, sortDirection]);

  // ------------------------------------------------------------------
  // Selection
  // ------------------------------------------------------------------
  const toggleSelected = (id) => {
    const next = { ...selected, [id]: !selected[id] };
    setSelectedLocal(next);
    setSelected(next);
  };

  const selectAll = () => {
    const all = {};
    mergedResults.forEach((r) => {
      const id = r.loc_id || r.symbol;
      if (id) all[id] = true;
    });
    setSelectedLocal(all);
    setSelected(all);
  };

  const clearSelection = () => {
    setSelectedLocal({});
    setSelected({});
  };

  // ------------------------------------------------------------------
  // Export helpers
  // ------------------------------------------------------------------
  const copySelected = () => {
    const ids = sortedResults
      .filter((r) => selected[r.loc_id || r.symbol])
      .map((r) => r.loc_id || r.symbol);

    if (ids.length === 0) return alert("No selected rows.");

    navigator.clipboard.writeText(ids.join("\n"));
    alert(`Copied ${ids.length} gene IDs.`);
  };

  const copyAll = () => {
    const ids = sortedResults.map((r) => r.loc_id || r.symbol);
    navigator.clipboard.writeText(ids.join("\n"));
    alert(`Copied ${ids.length} gene IDs.`);
  };

  const exportCsv = (onlySelected = false) => {
    const rows = onlySelected
      ? sortedResults.filter((r) => selected[r.loc_id || r.symbol])
      : sortedResults;

    if (rows.length === 0) return alert("No data to export.");

    const header = ["GeneID", "Symbol", "Source", "PMIDs", "EvidenceTitles"];

    const csv = [
      header.join(","),
      ...rows.map((r) => {
        const geneId = r.loc_id || r.symbol;
        const pmidList = r.pmids.map((x) => x.pmid).join(";");
        const titles = r.pmids.map((x) => x.title).join(";;");
        return [geneId, r.symbol, r.source, pmidList, titles]
          .map((v) => `"${v.replace(/"/g, '""')}"`)
          .join(",");
      })
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlySelected ? "selected_genes.csv" : "all_genes.csv";
    a.click();
  };

  const exportTxt = (onlySelected = false) => {
    const rows = onlySelected
      ? sortedResults.filter((r) => selected[r.loc_id || r.symbol])
      : sortedResults;

    const text = rows.map((r) => r.loc_id || r.symbol).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlySelected ? "selected_gene_ids.txt" : "all_gene_ids.txt";
    a.click();
  };

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  const th = (col) => ({
    padding: "6px 8px",
    borderBottom: "1px solid #ccc",
    cursor: "pointer",
    background:
      sortColumn === col ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.4)"
  });

  const td = { padding: "6px 8px", borderBottom: "1px solid #eee" };

  const sortIndicator = (col) =>
    sortColumn === col ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="gf-container">
      <h2>Find Genes</h2>

      {/* Controls */}
      <div className="gf-controls">
        <label>
          Species:&nbsp;
          <select value={species} onChange={(e) => onSpeciesChange(e.target.value)}>
            <option value="carrot">Carrot</option>
            <option value="onion">Onion</option>
          </select>
        </label>

        <label>
          Phenotype:&nbsp;
          <input
            value={phenotype}
            onChange={(e) => onPhenotypeChange(e.target.value)}
            placeholder="e.g. bolting, purple root…"
          />
        </label>
        {/* Search buttons */}
        <button onClick={doSearch}>Search</button>
        <button onClick={clearAll} style={{ marginLeft: "10px" }}>
          Clear Results
        </button>

      </div>

      {/* Column toggles */}
      <div className="gf-col-toggles">
        {Object.keys(showColumns).map((col) => (
          <label key={col}>
            <input
              type="checkbox"
              checked={showColumns[col]}
              onChange={() =>
                setShowColumns((prev) => ({ ...prev, [col]: !prev[col] }))
              }
            />
            &nbsp;{col}
          </label>
        ))}
      </div>

      {loading && <p>Searching…</p>}

      {/* Actions */}
      {sortedResults.length > 0 && (
        <div className="gf-actions">
          <button onClick={copySelected}>Copy selected</button>
          <button onClick={copyAll}>Copy all</button>
          <button onClick={selectAll}>Select all</button>
          <button onClick={clearSelection}>Clear selection</button>

          <div className="gf-export">
            <button onClick={() => exportCsv(false)}>Export ALL CSV</button>
            <button onClick={() => exportCsv(true)}>Export SELECTED CSV</button>
            <button onClick={() => exportTxt(false)}>Export ALL TXT</button>
            <button onClick={() => exportTxt(true)}>Export SELECTED TXT</button>
          </div>
        </div>
      )}

      {/* Table */}
      {sortedResults.length > 0 && (
        <div className="gf-table-wrapper">
          <table className="gf-table">
            <thead>
              <tr>
                <th>Select</th>

                {showColumns.symbol && (
                  <th style={th("symbol")} onClick={() => handleSort("symbol")}>
                    Symbol{sortIndicator("symbol")}
                  </th>
                )}

                {showColumns.loc_id && (
                  <th style={th("loc_id")} onClick={() => handleSort("loc_id")}>
                    Gene ID{sortIndicator("loc_id")}
                  </th>
                )}

                {showColumns.source && (
                  <th style={th("source")} onClick={() => handleSort("source")}>
                    Source{sortIndicator("source")}
                  </th>
                )}

                {showColumns.pmid && (
                  <th style={th("pmid")} onClick={() => handleSort("pmid")}>
                    PMIDs{sortIndicator("pmid")}
                  </th>
                )}

                {showColumns.evidence && (
                  <th style={th("evidence")} onClick={() => handleSort("evidence")}>
                    Evidence{sortIndicator("evidence")}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {sortedResults.map((r) => {
                const geneId = r.loc_id || r.symbol;

                return (
                  <tr key={geneId} className={selected[geneId] ? "selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!selected[geneId]}
                        onChange={() => toggleSelected(geneId)}
                      />
                    </td>

                    {showColumns.symbol && <td style={td}>{r.symbol}</td>}

                    {showColumns.loc_id && <td style={td}>{r.loc_id}</td>}

                    {showColumns.source && <td style={td}>{r.source}</td>}

                    {showColumns.pmid && (
                      <td style={td}>
                        {r.pmids.map((p, i) => (
                          <span key={p.pmid}>
                            <a
                              href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {p.pmid}
                            </a>
                            {i < r.pmids.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </td>
                    )}

                    {showColumns.evidence && (
                      <td style={td}>
                        {r.pmids.map((p) => (
                          <div key={p.pmid}>
                            <strong>PMID {p.pmid}</strong> — {p.title}
                          </div>
                        ))}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sortedResults.length === 0 && phenotype && (
        <p>No results found.</p>
      )}
    </div>
  );
}
