import React, { useRef, useMemo } from "react";
import Plot from "react-plotly.js";

/*
  DistanceClustergram.jsx — simplified clean version

  - Reorders samples/matrix using dendrogram.leaves (frontend).
  - Normalises SciPy dcoord → 0..1 range (so leaves align perfectly).
  - Converts SciPy icoord (5,15,25…) → heatmap indices.
  - Draws clean dendrograms without artifacts or clipping tricks.
  - Perfect seaborn-style clustergram layout.
*/

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Convert SciPy icoord x-values (5,15,25…) into matrix index space 0..n-1
function mapIcoordToIndices(icoord) {
  // SciPy dendrogram x positions are (5 + 10*i)
  // → mapped index = (x - 5) / 10
  return icoord.map((xs) => xs.map((x) => (x - 5) / 10));
}

// Normalise dendrogram heights to 0..1 (leaves=0)
function normalizeDcoord(dcoord) {
  if (!dcoord || dcoord.length === 0) return dcoord;
  const all = dcoord.flat();
  const min = Math.min(...all);
  const max = Math.max(...all);
  const scale = max === min ? 1 : 1 / (max - min);
  return dcoord.map((row) => row.map((v) => (v - min) * scale));
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function DistanceClustergram({ samples, matrix, dendrogram }) {
  const plotRef = useRef(null);

  if (!samples || !matrix || !dendrogram)
    return <div style={{ padding: 12 }}>Waiting for heatmap data…</div>;

  const n = samples.length;
  const leaves = dendrogram.leaves || [];

  // ─ Reorder samples + matrix (frontend-side)
  const { samplesReordered, matrixReordered } = useMemo(() => {
    if (!Array.isArray(leaves) || leaves.length !== n) {
      return { samplesReordered: samples, matrixReordered: matrix };
    }
    const s = leaves.map((i) => samples[i]);
    const m = leaves.map((i) => leaves.map((j) => matrix[i][j]));
    return { samplesReordered: s, matrixReordered: m };
  }, [samples, matrix, leaves, n]);

  // ─ Prepare dendrogram coord data
  const icoord = dendrogram.icoord || [];
  const dcoordRaw = dendrogram.dcoord || [];

  const icoordMapped = useMemo(() => mapIcoordToIndices(icoord), [icoord]);
  const dcoord = useMemo(() => normalizeDcoord(dcoordRaw), [dcoordRaw]);

  // Build list of dendrogram segments:
  // each segment = { x: [..], y: [..] }
  const colDendroSegments = useMemo(() => {
    return icoordMapped.map((xs, i) => ({
      x: xs,
      y: dcoord[i],
    }));
  }, [icoordMapped, dcoord]);

  // Row dendrogram: swap coords (scipy’s dendrogram is always for columns)
  const rowDendroSegments = useMemo(() => {
    return icoordMapped.map((xs, i) => ({
      // Swap: x ← height, y ← index positions
      x: dcoord[i],
      y: xs,
    }));
  }, [icoordMapped, dcoord]);

  const indices = useMemo(() => Array.from({ length: n }, (_, i) => i), [n]);

  // ─────────────────────────────────────────────────────────────
  // Traces
  // ─────────────────────────────────────────────────────────────

  const heatTrace = {
    type: "heatmap",
    z: matrixReordered,
    x: indices,
    y: indices,
    colorscale: "Viridis",
    colorbar: { title: "Distance", len: 0.75 },
    zsmooth: false,
    hovertemplate: "<b>%{y}</b> × <b>%{x}</b><br>Distance: %{z}<extra></extra>",
  };

  const colDendroTraces = colDendroSegments.map((seg) => ({
    type: "scatter",
    mode: "lines",
    x: seg.x,
    y: seg.y,
    xaxis: "x3",
    yaxis: "y3",
    line: { color: "#000", width: 1.1 },
    hoverinfo: "none",
  }));

  const rowDendroTraces = rowDendroSegments.map((seg) => ({
    type: "scatter",
    mode: "lines",
    x: seg.x,
    y: seg.y,
    xaxis: "x2",
    yaxis: "y2",
    line: { color: "#000", width: 1.1 },
    hoverinfo: "none",
  }));

  // ─────────────────────────────────────────────────────────────
  // Layout — clean seaborn-style layout
  // ─────────────────────────────────────────────────────────────

  const heatStart = 0.0;
  const heatEnd = 0.75;
  const rightStart = 0.8;
  const rightEnd = 1.0;
  const topStart = 0.78;
  const topEnd = 1.0;

  const layout = {
    width: Math.round(Math.min(window.innerWidth * 0.9, 1200)),
    height: Math.max(480, Math.min(1600, 50 * n + 200)),
    margin: { l: 160, r: 60, t: 80, b: 160 },

    // Heatmap axes
    xaxis: {
      domain: [heatStart, heatEnd],
      tickmode: "array",
      tickvals: indices,
      ticktext: samplesReordered,
      tickangle: -45,
      showgrid: false,
      automargin: true,
    },
    yaxis: {
      domain: [0, topStart - 0.02],
      tickmode: "array",
      tickvals: indices,
      ticktext: samplesReordered,
      autorange: "reversed",
      showgrid: false,
      automargin: true,
    },

    // Right dendrogram axes (range 0..1)
    xaxis2: {
      domain: [rightStart, rightEnd],
      range: [0, 1],
      showticklabels: false,
      anchor: "y2",
      zeroline: false,
    },
    yaxis2: {
      domain: [0, topStart - 0.02],
      range: [-0.5, n - 0.5],
      showticklabels: false,
      anchor: "x2",
      zeroline: false,
    },

    // Top dendrogram axes (range 0..1)
    xaxis3: {
      domain: [heatStart, heatEnd],
      showticklabels: false,
      anchor: "y3",
      zeroline: false,
    },
    yaxis3: {
      domain: [topStart, topEnd],
      range: [0, 1],
      showticklabels: false,
      anchor: "x3",
      zeroline: false,
    },

    showlegend: false,
    hovermode: "closest",
    title: `Clustergram (n=${n}) — variants used: ${
      dendrogram.max_snps_used ?? "-"
    }`,
  };

  const data = [heatTrace, ...colDendroTraces, ...rowDendroTraces];

  // ─────────────────────────────────────────────────────────────
  // Export functions
  // ─────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const rows = [];
    rows.push(["Sample", ...samplesReordered]);
    for (let i = 0; i < n; i++) rows.push([samplesReordered[i], ...matrixReordered[i]]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "distance_matrix_reordered.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPNG = async () => {
    try {
      if (plotRef.current && window.Plotly?.toImage) {
        const img = await window.Plotly.toImage(plotRef.current, {
          format: "png",
          width: layout.width,
          height: layout.height,
        });
        const link = document.createElement("a");
        link.href = img;
        link.download = "clustergram.png";
        link.click();
      } else {
        alert("PNG export not available.");
      }
    } catch (err) {
      alert("Export failed: " + err.message);
    }
  };

  // ─────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button onClick={exportPNG}>Export clustergram (PNG)</button>
        <button onClick={exportCSV}>Export distance matrix (CSV)</button>
      </div>

      <Plot
        ref={plotRef}
        data={data}
        layout={layout}
        config={{ responsive: true, displaylogo: false }}
        useResizeHandler={true}
        style={{ width: "100%", height: layout.height }}
      />
    </div>
  );
}
