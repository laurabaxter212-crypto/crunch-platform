import React, { useState, useMemo } from "react";
import { searchKnowledge, fetchPubmedTitle } from "../api";
import "./GeneFinder.css";

// Sleep helper to avoid pubmed hammering
const sleep = ms => new Promise(res => setTimeout(res, ms));

export default function GeneFinder() {
  const [species, setSpecies] = useState("carrot");
  const [phenotype, setPhenotype] = useState("");

  const [mergedResults, setMergedResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});

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

  // ================================================================
  // FETCH + MERGE + RATE-SAFE TITLE FETCH
  // ================================================================

  async function doSearch() {
    if (!phenotype.trim()) return;

    setLoading(true);
    setMergedResults([]);
    setSelected({});

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
            pmids: [] // [{ pmid, title }]
          };
        }

        // Normalize PMIDs into array
        if (r.pmid) {
          const pmids = Array.isArray(r.pmid)
            ? r.pmid
            : String(r.pmid).split(/[,\s]+/).filter(Boolean);

          pmids.forEach(pmid => {
            if (!geneMap[geneId].pmids.find(x => x.pmid === pmid)) {
              geneMap[geneId].pmids.push({ pmid, title: "Loading…" });
            }
          });
        }
      }

      const merged = Object.values(geneMap);
      setMergedResults(merged);

      // -----------------------------------------
      // Rate-limited PubMed fetch
      // -----------------------------------------
      for (const gene of merged) {
        for (const entry of gene.pmids) {
          let title = "(title unavailable)";

          try {
            const res = await fetchPubmedTitle(entry.pmid);

            // backend returns: { pmid, title } or { detail: ... }
            if (res && typeof res.title === "string") {
              title = res.title;
            }
          } catch (err) {
            console.warn("PubMed title fetch failed:", entry.pmid, err);
          }

          entry.title = title;
          setMergedResults(prev => [...prev]); // trigger re-render

          await sleep(350); // ~3/sec to avoid 429
        }
      }
    } catch (err) {
      console.error("GeneFinder search failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // ================================================================
  // SORTING
  // ================================================================

  function handleSort(col) {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  }

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
          A = a.pmids.map(x => x.title).join(" ");
          B = b.pmids.map(x => x.title).join(" ");
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

  // ================================================================
  // SELECTION / EXPORT (unchanged)
  // ================================================================

  function toggleSelected(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAll() {
    const all = {};
    mergedResults.forEach(r => {
      const id = r.loc_id || r.symbol;
      if (id) all[id] = true;
    });
    setSelected(all);
  }

  function clearSelected() {
    setSelected({});
  }

  function copySelected() {
    const ids = sortedResults
      .filter(r => selected[r.loc_id || r.symbol])
      .map(r => r.loc_id || r.symbol);
    if (ids.length === 0) return alert("No selected rows.");
    navigator.clipboard.writeText(ids.join("\n"));
    alert(`Copied ${ids.length} gene IDs.`);
  }

  function copyAll() {
    const ids = sortedResults.map(r => r.loc_id || r.symbol);
    navigator.clipboard.writeText(ids.join("\n"));
    alert(`Copied ${ids.length} gene IDs.`);
  }

  function exportCsv(onlySelected = false) {
    const rows = onlySelected
      ? sortedResults.filter(r => selected[r.loc_id || r.symbol])
      : sortedResults;

    if (rows.length === 0) return alert("No data to export.");

    const header = ["GeneID", "Symbol", "Source", "PMIDs", "EvidenceTitles"];

    const csv = [
      header.join(","),
      ...rows.map(r => {
        const geneId = r.loc_id || r.symbol;
        const pmidList = r.pmids.map(x => x.pmid).join(";");
        const titles = r.pmids.map(x => x.title).join(";;");
        return [geneId, r.symbol, r.source, pmidList, titles]
          .map(v => `"${v.replace(/"/g, '""')}"`)
          .join(",");
      })
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlySelected ? "selected_genes.csv" : "all_genes.csv";
    a.click();
  }

  function exportTxt(onlySelected = false) {
    const rows = onlySelected
      ? sortedResults.filter(r => selected[r.loc_id || r.symbol])
      : sortedResults;

    const text = rows.map(r => r.loc_id || r.symbol).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlySelected ? "selected_gene_ids.txt" : "all_gene_ids.txt";
    a.click();
  }

  // ================================================================
  // RENDER
  // ================================================================

  const th = col => ({
    padding: "6px 8px",
    borderBottom: "1px solid #ccc",
    cursor: "pointer",
    background:
      sortColumn === col ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.4)"
  });

  const td = { padding: "6px 8px", borderBottom: "1px solid #eee" };

  const sortIndicator = col =>
    sortColumn === col ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="gf-container">
      <h2>Find Genes</h2>

      {/* Controls */}
      <div className="gf-controls">
        <label>
          Species:&nbsp;
          <select value={species} onChange={e => setSpecies(e.target.value)}>
            <option value="carrot">Carrot</option>
            <option value="onion">Onion</option>
          </select>
        </label>

        <label>
          Phenotype:&nbsp;
          <input
            value={phenotype}
            onChange={e => setPhenotype(e.target.value)}
            placeholder="e.g. bolting, purple root…"
          />
        </label>

        <button onClick={doSearch}>Search</button>
      </div>

      {/* Column toggles */}
      <div className="gf-col-toggles">
        {Object.keys(showColumns).map(col => (
          <label key={col}>
            <input
              type="checkbox"
              checked={showColumns[col]}
              onChange={() =>
                setShowColumns(prev => ({ ...prev, [col]: !prev[col] }))
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
          <button onClick={clearSelected}>Clear selection</button>

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
                  <th
                    style={th("evidence")}
                    onClick={() => handleSort("evidence")}
                  >
                    Evidence{sortIndicator("evidence")}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {sortedResults.map(r => {
                const geneId = r.loc_id || r.symbol;

                return (
                  <tr
                    key={geneId}
                    className={selected[geneId] ? "selected" : ""}
                  >
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
                        {r.pmids.map(p => (
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
