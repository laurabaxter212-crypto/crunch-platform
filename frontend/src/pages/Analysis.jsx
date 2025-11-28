// frontend/src/pages/Analysis.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import Plot from "react-plotly.js";
import { getSamples, runSimilarity, runPcaMds } from "../api/index.js";

function csvEscape(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '""');
}

export default function Analysis() {
  // species selector
  const [species, setSpecies] = useState("carrot");

  // inputs
  const [samples, setSamples] = useState([]);
  const [loadingSamples, setLoadingSamples] = useState(true);
  const [blocks, setBlocks] = useState([{ id: Date.now(), text: "" }]);
  const [reference, setReference] = useState("");
  const [combine, setCombine] = useState("union");
  const [metric, setMetric] = useState("numeric");

  // run state
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [pcaData, setPcaData] = useState(null);
  const [error, setError] = useState(null);

  // PCA UI
  const [pcX, setPcX] = useState(1);
  const [pcY, setPcY] = useState(2);
  const [pcZ, setPcZ] = useState(3);
  const [show3d, setShow3d] = useState(false);

  // highlighting
  const [highlightSample, setHighlightSample] = useState(null);
  const rowRefs = useRef({});
  const pca2dRef = useRef(null);
  const pca3dRef = useRef(null);

  // load samples whenever species changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSamples(true);
      try {
        const data = await getSamples(species);
        // accept {samples: [...]} or plain array
        const list = Array.isArray(data) ? data : data.samples || data;
        if (!mounted) return;
        setSamples(list);
        if (list.length > 0) setReference(list[0]);
      } catch (err) {
        console.error("Failed to load samples:", err);
        setSamples([]);
        setReference("");
      } finally {
        if (mounted) setLoadingSamples(false);
      }
    })();
    return () => (mounted = false);
  }, [species]);

  const phenotypeBlocks = useMemo(
    () =>
      blocks.map((b) => {
        const genes = (b.text || "")
          .split(/[\s,;\n\r]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return { genes };
      }),
    [blocks]
  );

  function addBlock() {
    setBlocks((prev) => [...prev, { id: Date.now(), text: "" }]);
  }
  function removeBlock(idx) {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateBlock(idx, text) {
    setBlocks((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], text };
      return copy;
    });
  }

  function validToRunSimilarity() {
    const totalGenes = phenotypeBlocks.reduce((acc, b) => acc + (b.genes ? b.genes.length : 0), 0);
    return totalGenes > 0 && reference;
  }

  async function handleRunSimilarity() {
    setError(null);
    if (!validToRunSimilarity()) {
      setError("Please paste at least one LOC ID and select a reference accession.");
      return;
    }
    setRunning(true);
    setResults(null);
    try {
      const payload = { phenotype_blocks: phenotypeBlocks, reference_accession: reference, distance_measure: metric, combine };
      const res = await runSimilarity(payload, species);
      if (res && res.error) {
        setError(res.error);
        setResults(null);
      } else {
        setResults(res);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Unknown error running similarity");
      setResults(null);
    } finally {
      setRunning(false);
    }
  }

  async function handleRunPcaMds() {
    setError(null);
    setPcaData(null);
    try {
      const payload = { phenotype_blocks: phenotypeBlocks, combine };
      const res = await runPcaMds(payload, species);
      if (res && res.error) {
        setError(res.error);
        setPcaData(null);
      } else {
        setPcaData(res);
        if (res?.pca?.explained && res.pca.explained.length >= 2) {
          setPcX(1);
          setPcY(2);
          setPcZ(res.pca.explained.length >= 3 ? 3 : 1);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to compute PCA/MDS");
      setPcaData(null);
    }
  }

  // displayed results sort
  const displayedResults = useMemo(() => {
    if (!results || !results.results) return [];
    const arr = [...results.results];
    const ascending = metric === "numeric" || metric === "euclidean";
    arr.sort((a, b) => {
      const va = typeof a.score === "number" ? a.score : parseFloat(a.score);
      const vb = typeof b.score === "number" ? b.score : parseFloat(b.score);
      if (Number.isFinite(va) && Number.isFinite(vb)) return ascending ? va - vb : vb - va;
      return 0;
    });
    return arr;
  }, [results, metric]);

  function copyAllAccessions() {
    if (!displayedResults.length) {
      alert("No results to copy");
      return;
    }
    const text = displayedResults.map((r) => r.accession).join("\n");
    navigator.clipboard.writeText(text);
    alert(`Copied ${displayedResults.length} accessions`);
  }
  function exportCsv() {
    if (!displayedResults.length) {
      alert("No results to export");
      return;
    }
    const header = ["rank", "accession", "score"];
    const rows = displayedResults.map((r, i) => [i + 1, r.accession, r.score]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "similarity_results.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // PCA helpers
  const pcCount = pcaData?.pca?.explained ? pcaData.pca.explained.length : 0;
  const pcOptions = Array.from({ length: Math.max(2, pcCount) }, (_, i) => i + 1);

  const pca2d = useMemo(() => {
    if (!pcaData || !pcaData.pca || !pcaData.samples) return null;
    const coords = pcaData.pca.coords;
    const xIndex = Math.max(0, pcX - 1);
    const yIndex = Math.max(0, pcY - 1);
    return {
      xs: coords.map((r) => (r.length > xIndex ? r[xIndex] : null)),
      ys: coords.map((r) => (r.length > yIndex ? r[yIndex] : null)),
      samplesList: pcaData.samples,
    };
  }, [pcaData, pcX, pcY]);

  const pca3d = useMemo(() => {
    if (!pcaData || !pcaData.pca || !pcaData.samples) return null;
    const coords = pcaData.pca.coords;
    const xIndex = Math.max(0, pcX - 1);
    const yIndex = Math.max(0, pcY - 1);
    const zIndex = Math.max(0, pcZ - 1);
    return {
      xs: coords.map((r) => (r.length > xIndex ? r[xIndex] : null)),
      ys: coords.map((r) => (r.length > yIndex ? r[yIndex] : null)),
      zs: coords.map((r) => (r.length > zIndex ? r[zIndex] : null)),
      samplesList: pcaData.samples,
    };
  }, [pcaData, pcX, pcY, pcZ]);

  // click handlers & highlight/scroll
  useEffect(() => {
    if (!highlightSample) return;
    const el = rowRefs.current?.[highlightSample];
    if (el && el.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.backgroundColor = "#fffbdd";
      setTimeout(() => {
        if (el) el.style.backgroundColor = "";
      }, 900);
    }
  }, [highlightSample]);

  function onPcaClick(event) {
    if (!event || !event.points || event.points.length === 0) return;
    const pt = event.points[0];
    const idx = pt.pointNumber;
    const sample = pcaData?.samples?.[idx];
    if (sample) setHighlightSample(sample);
  }
  function onTableRowClick(accession) {
    setHighlightSample(accession);
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Run analysis — similarity / PCA</h2>

      {/* Top controls row */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", fontWeight: 600 }}>Dataset (species)</label>
          <select value={species} onChange={(e) => setSpecies(e.target.value)}>
            <option value="carrot">carrot</option>
            <option value="onion">onion</option>
          </select>
        </div>

        <div style={{ minWidth: 220 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Reference accession</label>
          {loadingSamples ? (
            <div>Loading sample list…</div>
          ) : (
            <select value={reference} onChange={(e) => setReference(e.target.value)} style={{ width: 260 }}>
              <option value="">-- choose accession --</option>
              {samples.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600 }}>Combine</label>
          <select value={combine} onChange={(e) => setCombine(e.target.value)}>
            <option value="union">Union</option>
            <option value="intersection">Intersection</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600 }}>Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="numeric">numeric — absolute allele difference</option>
            <option value="euclidean">euclidean — geometric genotype distance</option>
            <option value="match">match — proportion of identical genotypes</option>
            <option value="ibs">ibs — identity-by-state similarity</option>

          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <button onClick={handleRunSimilarity} disabled={running || !validToRunSimilarity()}>
            {running ? "Running…" : "Run similarity"}
          </button>
          <button onClick={handleRunPcaMds} disabled={phenotypeBlocks.every((b) => !b.genes.length)}>
            Compute PCA / MDS
          </button>
        </div>
      </div>

      {/* blocks input */}
      <div style={{ marginBottom: 12 }}>
        <strong>Phenotype blocks (LOC IDs)</strong>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          Paste LOC IDs (space, comma or newline separated).
        </div>
        {blocks.map((b, i) => (
          <div key={b.id} style={{ marginBottom: 8, border: "1px solid #eee", padding: 8, borderRadius: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong>Block {i + 1}</strong>
              <div>
                {blocks.length > 1 && <button onClick={() => removeBlock(i)}>Remove</button>}
              </div>
            </div>
            <textarea value={b.text} onChange={(e) => updateBlock(i, e.target.value)} rows={3} style={{ width: "100%" }} />
          </div>
        ))}
        <button onClick={addBlock}>+ Add block</button>
      </div>

      {/* results area */}
      <div style={{ display: "flex", gap: 12 }}>
        {/* similarity table */}
        <div style={{ flex: 1, minWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Similarity results</h3>
            <div>
              <button onClick={copyAllAccessions} disabled={!displayedResults.length}>
                Copy all
              </button>
              <button onClick={exportCsv} style={{ marginLeft: 8 }} disabled={!displayedResults.length}>
                Export CSV
              </button>
            </div>
          </div>

          {!results && <div>No results yet.</div>}

          {results && results.results && (
            <div>
              <div style={{ marginBottom: 6 }}>
                <strong>Reference:</strong> {results.reference} • <strong>Variants used:</strong> {results.n_variants}
              </div>
              <div style={{ maxHeight: "56vh", overflow: "auto", border: "1px solid #f0f0f0", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th style={{ padding: 8 }}>#</th>
                      <th style={{ padding: 8 }}>Accession</th>
                      <th style={{ padding: 8 }}>Score</th>
                      <th style={{ padding: 8 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedResults.map((r, i) => {
                      const isHighlighted = highlightSample === r.accession;
                      return (
                        <tr
                          key={r.accession}
                          ref={(el) => (rowRefs.current[r.accession] = el)}
                          onClick={() => onTableRowClick(r.accession)}
                          style={{ background: isHighlighted ? "#fffbdd" : "", cursor: "pointer" }}
                        >
                          <td style={{ padding: 8 }}>{i + 1}</td>
                          <td style={{ padding: 8 }}>{r.accession}</td>
                          <td style={{ padding: 8 }}>{Number.isFinite(r.score) ? r.score.toFixed(6) : r.score}</td>
                          <td style={{ padding: 8 }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(r.accession);
                                alert(`Copied accession ${r.accession}`);
                              }}
                            >
                              Copy
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* PCA plots */}
        <div style={{ flex: 1.2, minWidth: 420 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div>
              <label style={{ display: "block", fontWeight: 600 }}>X axis</label>
              <select value={pcX} onChange={(e) => setPcX(Number(e.target.value))}>
                {pcOptions.map((p) => {
                  const expl = pcaData?.pca?.explained?.[p - 1];
                  const label =
                    expl !== undefined
                      ? `PC${p} (${(expl * 100).toFixed(1)}%)`
                      : `PC${p}`;

                  return (
                    <option key={p} value={p}>
                      {label}
                    </option>
                  );
                })}

              </select>
            </div>
            <div>
              <label style={{ display: "block", fontWeight: 600 }}>Y axis</label>
              <select value={pcY} onChange={(e) => setPcY(Number(e.target.value))}>
                {pcOptions.map((p) => {
                  const expl = pcaData?.pca?.explained?.[p - 1];
                  const label =
                    expl !== undefined
                      ? `PC${p} (${(expl * 100).toFixed(1)}%)`
                      : `PC${p}`;

                  return (
                    <option key={p} value={p}>
                      {label}
                    </option>
                  );
                })}

              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center" }}>
              <input id="toggle3d" type="checkbox" checked={show3d} onChange={(e) => setShow3d(e.target.checked)} />
              <label htmlFor="toggle3d" style={{ marginLeft: 6 }}>
                Show 3D
              </label>
            </div>

            {show3d && (
              <div>
                <label style={{ display: "block", fontWeight: 600 }}>Z axis</label>
                <select value={pcZ} onChange={(e) => setPcZ(Number(e.target.value))}>
                {pcOptions.map((p) => {
                  const expl = pcaData?.pca?.explained?.[p - 1];
                  const label =
                    expl !== undefined
                      ? `PC${p} (${(expl * 100).toFixed(1)}%)`
                      : `PC${p}`;

                  return (
                    <option key={p} value={p}>
                      {label}
                    </option>
                  );
                })}

                </select>
              </div>
            )}
          </div>

          {/* 2D PCA */}
          <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
            <h4>PCA (2D)</h4>
            {pca2d ? (
              <>
                <div style={{ textAlign: "right", marginBottom: 6 }}>
                  <button
                    onClick={async () => {
                      // export PNG using plotly's toImage by importing plotly.js-dist dynamically
                      try {
                        if (!pca2dRef.current) return;
                        const Plotly = await import("plotly.js-dist");
                        const url = await Plotly.toImage(pca2dRef.current, { format: "png", width: 1200, height: 900 });
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "pca_2d.png";
                        a.click();
                      } catch (err) {
                        alert("Failed to export PNG: " + err);
                      }
                    }}
                  >
                    Export PNG
                  </button>
                </div>

                <Plot
                  data={[
                    {
                      x: pca2d.xs,
                      y: pca2d.ys,
                      text: pca2d.samplesList,
                      mode: "markers",
                      type: "scatter",
                      marker: {
                        size: 8,
                        opacity: 0.9,
                        color: pcaData.samples.map((s) => {
                          if (s === reference) return "green";
                          if (s === highlightSample) return "red";
                          return "#1f77b4";
                        }),
                      },
                      hovertemplate: "%{text}<br>PC" + pcX + ": %{x}<br>PC" + pcY + ": %{y}<extra></extra>",
                    },
                  ]}
                  layout={{ autosize: true, height: 380, margin: { t: 20, l: 40, r: 10, b: 40 }, xaxis: { title: `PC${pcX}` }, yaxis: { title: `PC${pcY}` } }}
                  onClick={onPcaClick}
                  onInitialized={(fig, div) => (pca2dRef.current = div)}
                  onUpdate={(fig, div) => (pca2dRef.current = div)}
                  useResizeHandler={true}
                  style={{ width: "100%" }}
                />
              </>
            ) : (
              <div>No PCA data (click "Compute PCA / MDS").</div>
            )}
          </div>

          {/* 3D PCA */}
          {show3d && (
            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
              <h4>3D PCA</h4>
              {pca3d ? (
                <Plot
                  data={[
                    {
                      x: pca3d.xs,
                      y: pca3d.ys,
                      z: pca3d.zs,
                      text: pca3d.samplesList,
                      mode: "markers",
                      type: "scatter3d",
                      marker: {
                        size: 4,
                        color: pcaData.samples.map((s) => {
                          if (s === reference) return "green";
                          if (s === highlightSample) return "red";
                          return "#1f77b4";
                        }),
                      },
                      hovertemplate:
                        "%{text}<br>" + `PC${pcX}: %{x}<br>` + `PC${pcY}: %{y}<br>` + `PC${pcZ}: %{z}<extra></extra>`,
                    },
                  ]}
                  layout={{ autosize: true, height: 420, margin: { t: 20, l: 0, r: 0, b: 40 }, scene: { xaxis: { title: `PC${pcX}` }, yaxis: { title: `PC${pcY}` }, zaxis: { title: `PC${pcZ}` } } }}
                  onClick={onPcaClick}
                  onInitialized={(fig, div) => (pca3dRef.current = div)}
                  onUpdate={(fig, div) => (pca3dRef.current = div)}
                  useResizeHandler={true}
                  style={{ width: "100%" }}
                />
              ) : (
                <div>No 3D PCA data.</div>
              )}
            </div>
          )}

          {pcaData?.pca?.explained && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <strong>Explained variance:</strong>{" "}
              {pcaData.pca.explained.map((v, i) => (
                <span key={i} style={{ marginRight: 8 }}>
                  PC{i + 1}: {(v * 100).toFixed(2)}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          <strong>Error:</strong> {String(error)}
        </div>
      )}
    </div>
  );
}
