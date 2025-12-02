// frontend/src/pages/Analysis.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import Plot from "react-plotly.js";
import { getSamples, runSimilarity, runPcaMds, API } from "../api/index.js";
import DistanceClustergram from "../components/DistanceClustergram.jsx";
import { postHeatmap } from "../api";

const DEFAULT_CATEGORICAL_PALETTE = [
  "#440154", "#3b528b", "#21918c", "#5ec962", "#fde725",
  "#ff7f0e", "#1f77b4", "#d62728", "#9467bd", "#8c564b"
];

function isNumericArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const coerced = arr.map((v) => Number(v)).filter((v) => !Number.isNaN(v));
  return coerced.length >= 2;
}

function viridisColor(t) {
  t = Math.min(1, Math.max(0, t));
  const r = Math.round(68 + 186 * t - 125 * t * t);
  const g = Math.round(1 + 136 * t + 131 * t * t);
  const b = Math.round(84 + 79 * t + 41 * t * t);
  return `rgb(${r},${g},${b})`;
}

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

  // metadata
  const [metadata, setMetadata] = useState({});
  const [metadataFields, setMetadataFields] = useState([]);
  const [displayNames, setDisplayNames] = useState({});
  const [selectedMetadataField, setSelectedMetadataField] = useState(null);
  const [paletteName, setPaletteName] = useState("default");
  const [customCategoryColors, setCustomCategoryColors] = useState({});

  // heatmap state
  const [heatmapResult, setHeatmapResult] = useState(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

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

        // Fetch metadata fields
        const fieldsResp = await fetch(`${API}/api/${species}/metadata/fields`);
        if (fieldsResp.ok) {
          const fieldsJson = await fieldsResp.json();
          if (mounted) {
            setMetadataFields(fieldsJson.fields || []);
            setDisplayNames(fieldsJson.display_names || {});
          }
        }

        // Fetch metadata
        const metaResp = await fetch(`${API}/api/${species}/metadata`);
        if (metaResp.ok) {
          const metaJson = await metaResp.json();
          if (mounted) setMetadata(metaJson);
        }
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

  // heatmap handlers
  async function runHeatmapFromGenes() {
  setHeatmapLoading(true);
  setHeatmapResult(null);

  try {
    const payload = {
      phenotype_blocks: blocks
        .map(b => ({
          genes: (b.text || "")
            .split(/[\s,]+/)
            .map(g => g.trim())
            .filter(Boolean),
        }))
        .filter(b => b.genes.length > 0),
      combine: "union",
    };


    const raw = await postHeatmap(species, payload);
    if (raw.error) {
      alert("Heatmap failed: " + raw.error);
      return;
    }
    const normalized = {
      samples: raw.samples ?? [],
      distance_matrix: raw.distance_matrix_reordered ?? raw.distance_matrix ?? [],
      dendrogram: {
        icoord: raw.icoord ?? raw.dendrogram?.icoord ?? [],
        dcoord: raw.dcoord ?? raw.dendrogram?.dcoord ?? [],
        order: raw.order ?? raw.dendrogram?.order ?? [],
      },
      n_variants: raw.n_variants,
      n_samples: raw.n_samples ?? (raw.samples ? raw.samples.length : null),
    };

    setHeatmapResult(normalized);
  } catch (err) {
    alert("Heatmap computation failed: " + err);
  } finally {
    setHeatmapLoading(false);
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

  // === compute metadata colors for PCA ===
  const { metadataColors, categoricalMap, numericRange } = useMemo(() => {
    if (!selectedMetadataField || !metadata || !pcaData?.samples) {
      return { metadataColors: null, categoricalMap: null, numericRange: null };
    }

    const vals = pcaData.samples.map((s) => {
      const v = metadata?.[s]?.[selectedMetadataField];
      return v === undefined ? null : v;
    });

    const nonNull = vals.filter((v) => v !== null);
    const numeric = isNumericArray(nonNull);

    if (numeric) {
      const nums = nonNull.map((v) => Number(v));
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const denom = max === min ? 1 : (max - min);
      const colors = vals.map((v) => (v === null ? "#cccccc" : viridisColor((Number(v) - min) / denom)));
      return { metadataColors: colors, categoricalMap: null, numericRange: { min, max } };
    } else {
      const uniq = Array.from(new Set(nonNull));

      const PRESET_PALETTES = {
        default: DEFAULT_CATEGORICAL_PALETTE,
        pastel: ["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fed9a6", "#ffffcc", "#e5d8bd", "#fddaec", "#f2f2f2"],
        vibrant: ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641", "#2b83ba", "#7b3294", "#f46d43", "#66c2a5"],
        set2: ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"],
      };

      const palette = PRESET_PALETTES[paletteName] || DEFAULT_CATEGORICAL_PALETTE;

      const cmap = {};
      uniq.forEach((u, i) => {
        if (customCategoryColors && customCategoryColors[u]) {
          cmap[u] = customCategoryColors[u];
        } else {
          cmap[u] = palette[i % palette.length];
        }
      });
      const colors = vals.map((v) => (v === null ? "#cccccc" : (cmap[v] || "#999999")));
      return { metadataColors: colors, categoricalMap: cmap, numericRange: null };
    }
  }, [selectedMetadataField, metadata, pcaData?.samples, paletteName, customCategoryColors]);

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
          <button onClick={runHeatmapFromGenes} disabled={heatmapLoading}>
            {heatmapLoading ? "Computing heatmap…" : "Compute gene-set heatmap"}
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
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

            {/* Metadata field selector */}
            {Array.isArray(metadataFields) && metadataFields.length > 0 && (
              <div>
                <label style={{ display: "block", fontWeight: 600 }}>Color by metadata</label>
                <select value={selectedMetadataField || ""} onChange={(e) => setSelectedMetadataField(e.target.value || null)}>
                  <option value="">-- none --</option>
                  {metadataFields.map((f) => (
                    <option key={f} value={f}>
                      {displayNames && displayNames[f] ? displayNames[f] : f}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Palette selector */}
            {selectedMetadataField && (
              <div>
                <label style={{ display: "block", fontWeight: 600 }}>Palette</label>
                <select value={paletteName} onChange={(e) => setPaletteName(e.target.value)}>
                  <option value="default">Default</option>
                  <option value="pastel">Pastel</option>
                  <option value="vibrant">Vibrant</option>
                  <option value="set2">Set2</option>
                </select>
              </div>
            )}

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

          {/* Metadata legend */}
          {selectedMetadataField && (
            <div style={{ marginBottom: 8, padding: 8, background: "#fafafa", borderRadius: 4 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {displayNames[selectedMetadataField] || selectedMetadataField}
              </div>
              {numericRange ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 200,
                    height: 12,
                    borderRadius: 4,
                    background: "linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #fde725)",
                    border: "1px solid #ccc"
                  }} />
                  <div style={{ fontSize: 12 }}>
                    {numericRange.min?.toFixed(2)} → {numericRange.max?.toFixed(2)}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {categoricalMap && Object.entries(categoricalMap).map(([k, col]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 12, height: 12, background: col, borderRadius: 2 }} />
                      <div style={{ fontSize: 12 }}>{k}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Per-category color pickers for categorical metadata */}
              {categoricalMap && (
                <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(categoricalMap).map(([k, col]) => (
                    <div key={`picker-${k}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="color"
                        value={col}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomCategoryColors((prev) => ({ ...prev, [k]: v }));
                        }}
                      />
                      <div style={{ fontSize: 12 }}>{k}</div>
                    </div>
                  ))}
                  <button onClick={() => setCustomCategoryColors({})}>Reset colors</button>
                </div>
              )}
            </div>
          )}

          {/* 2D PCA */}
          <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
            <h4>PCA (2D)</h4>
            {pca2d ? (
              <>
                <div style={{ textAlign: "right", marginBottom: 6 }}>
                  <button
                    onClick={async () => {
                      // export PNG using plotly's toImage with legend overlay
                      try {
                        if (!pca2dRef.current) return;
                        const Plotly = await import("plotly.js-dist");
                        const url = await Plotly.toImage(pca2dRef.current, { format: "png", width: 1200, height: 900 });

                        // Helper: composite legend onto exported image
                        async function compositeAndDownload(imgDataUrl) {
                          try {
                            const imgEl = new Image();
                            imgEl.src = imgDataUrl;
                            await new Promise((res) => { imgEl.onload = res; imgEl.onerror = res; });

                            const cw = imgEl.width;
                            const ch = imgEl.height;
                            const canvas = document.createElement('canvas');
                            canvas.width = cw;
                            canvas.height = ch;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(imgEl, 0, 0);

                            // Draw legend if metadata is selected
                            if (selectedMetadataField && (metadataColors || categoricalMap || numericRange)) {
                              try {
                                const titleText = (displayNames && displayNames[selectedMetadataField]) ? displayNames[selectedMetadataField] : selectedMetadataField;
                                const legendWidth = 260;
                                const legendX = cw - legendWidth - 15;
                                let legendY = Math.max(ch * 0.88, ch - 120);

                                let entriesCount = 0;
                                if (numericRange) {
                                  entriesCount = 1;
                                } else if (categoricalMap) {
                                  entriesCount = Object.keys(categoricalMap).length;
                                }
                                const entriesHeight = entriesCount * 20 + 24;

                                // draw white background box
                                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                                const pad = 10;
                                const bgX = legendX - pad / 2;
                                const bgY = legendY - 8;
                                const bgW = legendWidth + pad;
                                const bgH = entriesHeight + pad;
                                ctx.fillRect(bgX, bgY, bgW, bgH);
                                ctx.strokeStyle = 'rgba(200,200,200,0.9)';
                                ctx.lineWidth = 1;
                                ctx.strokeRect(bgX, bgY, bgW, bgH);

                                // draw title
                                ctx.font = '14px sans-serif';
                                ctx.fillStyle = '#000';
                                ctx.fillText(titleText, legendX, legendY + 12);
                                legendY += 22;

                                if (categoricalMap) {
                                  // Draw categorical legend
                                  const entries = Object.entries(categoricalMap);
                                  const rowH = 20;
                                  entries.forEach(([k, col], i) => {
                                    const y = legendY + i * rowH;
                                    ctx.fillStyle = col || '#cccccc';
                                    ctx.fillRect(legendX, y, 14, 14);
                                    ctx.fillStyle = '#000';
                                    ctx.font = '12px sans-serif';
                                    ctx.fillText(k, legendX + 20, y + 12);
                                  });
                                } else if (numericRange) {
                                  // Draw numeric gradient
                                  const gradW = 140;
                                  const gradH = 12;
                                  const gx = legendX;
                                  const gy = legendY;
                                  const steps = 40;
                                  for (let s = 0; s < steps; s++) {
                                    const frac = s / (steps - 1);
                                    ctx.fillStyle = viridisColor(frac);
                                    ctx.fillRect(gx + (s / steps) * gradW, gy, gradW / steps + 1, gradH);
                                  }
                                  ctx.fillStyle = '#000';
                                  ctx.font = '11px sans-serif';
                                  ctx.fillText(numericRange.min?.toFixed(2), gx, gy + gradH + 14);
                                  ctx.fillText(numericRange.max?.toFixed(2), gx + gradW - 30, gy + gradH + 14);
                                }
                              } catch (e) {
                                console.warn('Legend drawing failed', e);
                              }
                            }

                            const composite = canvas.toDataURL('image/png');
                            const a = document.createElement('a');
                            a.href = composite;
                            a.download = 'pca_2d.png';
                            a.click();
                          } catch (e) {
                            // If canvas compositing fails, fall back to raw Plotly export
                            const a = document.createElement("a");
                            a.href = imgDataUrl;
                            a.download = "pca_2d.png";
                            a.click();
                          }
                        }

                        await compositeAndDownload(url);
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
                        color: metadataColors || pcaData.samples.map((s) => {
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
                        color: metadataColors || pcaData.samples.map((s) => {
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
      {heatmapResult && (
        <div style={{ marginTop: 30 }}>
          <h3>Gene-Set Heatmap</h3>

          <div style={{ marginBottom: 8 }}>
            <strong>Samples:</strong> {heatmapResult.n_samples} &nbsp;|&nbsp;
            <strong>Variants:</strong> {heatmapResult.n_variants}
          </div>

          <DistanceClustergram
            samples={heatmapResult.samples}
            matrix={heatmapResult.distance_matrix}
            dendrogram={heatmapResult.dendrogram}
            metadata={metadata}
            metadataFields={metadataFields}
            displayNames={displayNames}
          />
        </div>
      )}

      {/* error display */}
      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          <strong>Error:</strong> {String(error)}
        </div>
      )}
    </div>
  );
}
