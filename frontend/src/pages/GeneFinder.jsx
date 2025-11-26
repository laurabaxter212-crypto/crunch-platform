// frontend/src/pages/GeneFinder.jsx
import React, { useState } from "react";
import { searchKnowledge } from "../api/index.js";

export default function GeneFinder() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  // NEW: species selector
  const [species, setSpecies] = useState("carrot");

  // Column visibility toggles
  const [showColumns, setShowColumns] = useState({
    symbol: true,
    loc_id: true,
    source: true,
    pmid: true,
    evidence: true
  });

  async function doSearch() {
    setLoading(true);
    try {
      // UPDATED: pass species + phenotype
      const res = await searchKnowledge(species, query);

      // ---- Merge results by LOC ID ----
      const locMap = {};

      for (const r of res.results || []) {
        const loc = r.loc_id || "NO_LOC";

        if (!locMap[loc]) {
          locMap[loc] = {
            loc_id: r.loc_id,
            symbols: new Set(),
            pmids: new Set(),
            evidence: new Set(),
            sources: new Set()
          };
        }

        if (r.symbol) locMap[loc].symbols.add(r.symbol);
        if (r.source) locMap[loc].sources.add(r.source);
        if (r.pmid) locMap[loc].pmids.add(r.pmid);
        if (r.evidence) locMap[loc].evidence.add(r.evidence);
      }

      const merged = Object.values(locMap).map((v) => ({
        loc_id: v.loc_id,
        symbol: [...v.symbols].join(", "),
        pmid: [...v.pmids].join(", "),
        evidence: [...v.evidence].join("\n"),
        source: [...v.sources].join(", ")
      }));

      setResults(merged);
    } catch (err) {
      setResults([{ error: err.message }]);
    } finally {
      setLoading(false);
    }
  }

  function toggleColumn(col) {
    setShowColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  }

  const td = {
    border: "1px solid #ccc",
    padding: 6,
    verticalAlign: "top"
  };

  const th = {
    border: "1px solid #ccc",
    padding: 6,
    background: "#eee"
  };

  // Collect all non-null LOC IDs for the Copy-All button
  const allLocIds = results
    ? results.map((r) => r.loc_id).filter(Boolean)
    : [];

  return (
    <div style={{ padding: 12 }}>
      <h2>Find genes associated with a phenotype</h2>

      {/* Species selector (NEW) */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontWeight: 600 }}>Species:</label>
        <select
          value={species}
          onChange={(e) => setSpecies(e.target.value)}
          style={{ marginLeft: 8 }}
        >
          <option value="carrot">Carrot</option>
          <option value="onion">Onion</option>
        </select>
      </div>

      {/* Search input */}
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. root color"
          style={{ width: 300 }}
        />
        <button
          onClick={doSearch}
          disabled={!query || loading}
          style={{ marginLeft: 8 }}
        >
          Search
        </button>
      </div>

      {loading && <p>Searching…</p>}

      {/* Column selector */}
      <div style={{ marginTop: 20 }}>
        <strong>Show/Hide Columns:</strong>
        {Object.keys(showColumns).map((col) => (
          <label key={col} style={{ marginLeft: 12 }}>
            <input
              type="checkbox"
              checked={showColumns[col]}
              onChange={() => toggleColumn(col)}
            />{" "}
            {col}
          </label>
        ))}
      </div>

      {/* Copy-all button */}
      {results && results.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => {
              if (allLocIds.length === 0) {
                alert("No LOC IDs found to copy.");
                return;
              }
              navigator.clipboard.writeText(allLocIds.join("\n"));
              alert(`Copied ${allLocIds.length} LOC IDs!`);
            }}
          >
            Copy All LOC IDs
          </button>
        </div>
      )}

      {/* Results table */}
      {results && results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {showColumns.symbol && <th style={th}>Symbol(s)</th>}
                {showColumns.loc_id && <th style={th}>LOC ID</th>}
                {showColumns.source && <th style={th}>Source(s)</th>}
                {showColumns.pmid && <th style={th}>PMID(s)</th>}
                {showColumns.evidence && <th style={th}>Evidence</th>}
              </tr>
            </thead>

            <tbody>
              {results.map((row, idx) => (
                <tr key={idx}>
                  {showColumns.symbol && <td style={td}>{row.symbol || "—"}</td>}

                  {/* Click-to-copy LOC ID */}
                  {showColumns.loc_id && (
                    <td
                      style={{
                        ...td,
                        cursor: row.loc_id ? "pointer" : "default",
                        color: row.loc_id ? "#004" : "#000"
                      }}
                      title={row.loc_id ? "Click to copy" : ""}
                      onClick={() => {
                        if (row.loc_id) {
                          navigator.clipboard.writeText(row.loc_id);
                          alert(`Copied LOC ID: ${row.loc_id}`);
                        }
                      }}
                    >
                      {row.loc_id || "—"}
                    </td>
                  )}

                  {showColumns.source && <td style={td}>{row.source || "—"}</td>}

                  {/* PMIDs become clickable PubMed links */}
                  {showColumns.pmid && (
                    <td style={td}>
                      {row.pmid
                        ? row.pmid.split(", ").map((p, i) => (
                            <div key={i}>
                              <a
                                href={`https://pubmed.ncbi.nlm.nih.gov/${p}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {p}
                              </a>
                            </div>
                          ))
                        : "—"}
                    </td>
                  )}

                  {/* Evidence text */}
                  {showColumns.evidence && (
                    <td style={{ ...td, whiteSpace: "pre-wrap" }}>
                      {row.evidence || "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No results */}
      {results && results.length === 0 && (
        <p style={{ marginTop: 20 }}>No matching genes found.</p>
      )}
    </div>
  );
}
