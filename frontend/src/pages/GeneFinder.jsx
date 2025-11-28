import React, { useState } from "react";
import { searchKnowledge } from "../api";
import "./GeneFinder.css";

// Cache PubMed titles
const pmidCache = {};

async function fetchPubmedTitle(pmid) {
  if (pmidCache[pmid]) return pmidCache[pmid];

  try {
    const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    const res = await fetch(url);
    const json = await res.json();
    const article = json.result?.[pmid];

    const title = article?.title || "Unknown article";
    pmidCache[pmid] = title;
    return title;
  } catch (err) {
    console.error("PubMed fetch error:", err);
    return "Unknown article";
  }
}

export default function GeneFinder() {
  const [species, setSpecies] = useState("carrot");
  const [phenotype, setPhenotype] = useState("");

  const [mergedResults, setMergedResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState({});
  const [showColumns, setShowColumns] = useState({
    symbol: true,
    loc_id: true,
    source: true,
    pmid: true,
    evidence: true
  });

  // ---------------------------------------------------------
  // MAIN SEARCH + MERGING LOGIC
  // ---------------------------------------------------------

  async function doSearch() {
    if (!phenotype.trim()) return;

    setLoading(true);
    setSelected({});
    setMergedResults([]);

    try {
      const data = await searchKnowledge(species, phenotype);
      const rows = data.results || [];

      // Collapse rows by gene (loc_id)
      const geneMap = {};

      for (const r of rows) {
        const gene = r.loc_id || r.symbol; // fallback

        if (!geneMap[gene]) {
          geneMap[gene] = {
            symbol: r.symbol || "",
            loc_id: r.loc_id || "",
            source: r.source || "",
            pmids: []   // list of { pmid, title }
          };
        }

        // Extract PMIDs
        if (r.pmid) {
          const pmids = Array.isArray(r.pmid)
            ? r.pmid
            : String(r.pmid).split(/[,\s]+/).filter(Boolean);

          pmids.forEach(pmid => {
            if (!geneMap[gene].pmids.find(e => e.pmid === pmid)) {
              geneMap[gene].pmids.push({ pmid, title: "Loading…" });
            }
          });
        }
      }

      const merged = Object.values(geneMap);
      setMergedResults(merged);

      // Fetch article titles
      merged.forEach(gene => {
        gene.pmids.forEach(async (entry) => {
          const title = await fetchPubmedTitle(entry.pmid);
          entry.title = title;

          // Force refresh
          setMergedResults(prev => [...prev]);
        });
      });

    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // SELECTION CONTROLS
  // ---------------------------------------------------------

  function toggleSelected(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAll() {
    const all = {};
    mergedResults.forEach(r => { if (r.loc_id) all[r.loc_id] = true; });
    setSelected(all);
  }

  function clearSelected() {
    setSelected({});
  }

  // ---------------------------------------------------------
  // CLIPBOARD & EXPORT
  // ---------------------------------------------------------

  function copySelected() {
    const ids = mergedResults
      .filter(r => selected[r.loc_id])
      .map(r => r.loc_id);

    if (ids.length === 0) {
      alert("No selected rows.");
      return;
    }

    navigator.clipboard.writeText(ids.join("\n"));
    alert(`Copied ${ids.length} gene IDs.`);
  }

  function copyAll() {
    const ids = mergedResults.map(r => r.loc_id).filter(Boolean);
    navigator.clipboard.writeText(ids.join("\n"));
    alert(`Copied ${ids.length} gene IDs.`);
  }

  function exportCsv(onlySelected = false) {
    const rows = onlySelected
      ? mergedResults.filter(r => selected[r.loc_id])
      : mergedResults;

    if (rows.length === 0) {
      alert("No data to export.");
      return;
    }

    const header = ["GeneID", "Symbol", "Source", "PMIDs", "EvidenceTitles"];

    const csv = [
      header.join(","),
      ...rows.map(r => {
        const pmidList = r.pmids.map(x => x.pmid).join(";");
        const titles = r.pmids.map(x => x.title).join(";;");
        return [
          r.loc_id,
          r.symbol,
          r.source,
          pmidList,
          titles
        ]
          .map(x => `"${String(x).replace(/"/g, '""')}"`)
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
      ? mergedResults.filter(r => selected[r.loc_id])
      : mergedResults;

    const text = rows.map(r => r.loc_id).join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlySelected ? "selected_gene_ids.txt" : "all_gene_ids.txt";
    a.click();
  }

  // ---------------------------------------------------------
  // RENDERING
  // ---------------------------------------------------------

  const th = { padding: "6px 8px", borderBottom: "1px solid #ddd" };
  const td = { padding: "6px 8px", borderBottom: "1px solid #eee" };

  return (
    <div style={{ padding: 20 }}>
      <h2>Find Genes</h2>

      {/* Search controls */}
      <div style={{ marginBottom: 12 }}>
        <label>
          Species:&nbsp;
          <select value={species} onChange={e => setSpecies(e.target.value)}>
            <option value="carrot">Carrot</option>
            <option value="onion">Onion</option>
          </select>
        </label>

        <label style={{ marginLeft: 16 }}>
          Phenotype:&nbsp;
          <input
            value={phenotype}
            onChange={e => setPhenotype(e.target.value)}
            placeholder="e.g. bolting, purple root…"
            style={{ width: 250 }}
          />
        </label>

        <button onClick={doSearch} style={{ marginLeft: 12 }}>
          Search
        </button>
      </div>

      {/* Column toggles */}
      <div style={{ marginBottom: 10 }}>
        {Object.keys(showColumns).map(col => (
          <label key={col} style={{ marginRight: 12 }}>
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
      {mergedResults.length > 0 && (
        <div className="gene-actions">
          <button onClick={copySelected}>Copy selected</button>
          <button onClick={copyAll}>Copy all</button>
          <button onClick={selectAll}>Select all</button>
          <button onClick={clearSelected}>Clear selection</button>

          <div className="export-buttons">
            <button onClick={() => exportCsv(false)}>Export ALL CSV</button>
            <button onClick={() => exportCsv(true)}>Export SELECTED CSV</button>
            <button onClick={() => exportTxt(false)}>Export ALL TXT</button>
            <button onClick={() => exportTxt(true)}>Export SELECTED TXT</button>
          </div>
        </div>
      )}

      {/* RESULTS TABLE */}
      {mergedResults.length > 0 && (
        <table className="gene-table">
          <thead>
            <tr>
              <th style={th}>Select</th>
              {showColumns.symbol && <th style={th}>Symbol</th>}
              {showColumns.loc_id && <th style={th}>Gene ID</th>}
              {showColumns.source && <th style={th}>Source</th>}
              {showColumns.pmid && <th style={th}>PMIDs</th>}
              {showColumns.evidence && <th style={th}>Evidence</th>}
            </tr>
          </thead>

          <tbody>
            {mergedResults.map(r => (
              <tr
                key={r.loc_id}
                className={selected[r.loc_id] ? "selected" : ""}
              >
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={!!selected[r.loc_id]}
                    onChange={() => toggleSelected(r.loc_id)}
                  />
                </td>

                {showColumns.symbol && (
                  <td style={td}>{r.symbol || "—"}</td>
                )}

                {showColumns.loc_id && (
                  <td style={td}>{r.loc_id || "—"}</td>
                )}

                {showColumns.source && (
                  <td style={td}>{r.source || "—"}</td>
                )}

                {showColumns.pmid && (
                  <td style={td}>
                    {r.pmids.length === 0
                      ? "—"
                      : r.pmids.map((p, i) => (
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
                    {r.pmids.length === 0
                      ? "—"
                      : r.pmids.map((p, i) => (
                          <div key={p.pmid}>
                            <strong>PMID {p.pmid}</strong> — {p.title}
                          </div>
                        ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && mergedResults.length === 0 && phenotype.trim() && (
        <p>No results found.</p>
      )}
    </div>
  );
}
