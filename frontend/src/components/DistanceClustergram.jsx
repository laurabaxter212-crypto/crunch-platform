// frontend/src/components/DistanceClustergram.jsx
import React, { useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";

/*
  DistanceClustergram.jsx
  - Props expected:
      samples: array of sample IDs (original order)
      matrix: NxN distance matrix (same order as samples)
      dendrogram: { icoord: [..], dcoord: [..], labels: [...], leaves: [...] }
      metadata: { sample: { field: value } }
      metadataFields: array of field names
      displayNames: { field: prettyName }
  - Optional props:
      externalSelectedField, onSelectedFieldChange  (if parent wants control)
*/

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
  // approximate viridis-ish mapping, t in [0,1]
  t = Math.min(1, Math.max(0, t));
  // polynomial-ish approximation (works well visually)
  const r = Math.round(68 + 186 * t - 125 * t * t);
  const g = Math.round(1 + 136 * t + 131 * t * t);
  const b = Math.round(84 + 79 * t + 41 * t * t);
  return `rgb(${r},${g},${b})`;
}

export default function DistanceClustergram(props) {
  const {
    samples = [],
    matrix = null,
    dendrogram = null,
    metadata = {},
    metadataFields = [],
    displayNames = {},
    externalSelectedField = null,
    onSelectedFieldChange = null,
  } = props;

  const plotRef = useRef(null);
  // if parent manages selection, use that; else local state
  const [localSelectedField, setLocalSelectedField] = useState(null);
  // Palette and custom color state for metadata
  const [paletteName, setPaletteName] = useState("default");
  const [customCategoryColors, setCustomCategoryColors] = useState({});
  const selectedField = externalSelectedField ?? localSelectedField;
  const setSelectedField = (v) => {
    if (onSelectedFieldChange) onSelectedFieldChange(v);
    if (externalSelectedField === null) setLocalSelectedField(v);
  };

  // === basic guards ===
  const n = samples?.length || 0;
  if (!samples || !matrix || !dendrogram) {
    return <div style={{ padding: 12 }}>Waiting for data…</div>;
  }

  // === reorder according to dendrogram leaves ===
  // dendrogram.leaves contains original sample indices (0..n-1)
  const leaves = (dendrogram.leaves && dendrogram.leaves.length === n)
    ? dendrogram.leaves
    : Array.from({ length: n }, (_, i) => i);

  const reorderedSamples = leaves.map((i) => samples[i]);
  const reorderedMatrix = leaves.map((r) => leaves.map((c) => matrix[r][c]));

  // For numeric coordinate mapping we will use integer indices 0..n-1.
  // Heatmap cell centers will be at 0..n-1 and cell spans at [i-0.5, i+0.5].

  const indexArray = Array.from({ length: n }, (_, i) => i);

  // === remap SciPy icoord to integer indices ===
  // SciPy icoord positions are roughly 5,15,25,... -> (x-5)/10 -> leaf index
  // We'll map each numeric x to nearest leaf index and clamp to [0, n-1].
  function remapIcoord(icoord) {
    if (!Array.isArray(icoord)) return [];
    return icoord.map((xs) =>
      xs.map((x) => {
        const k = Math.round((x - 5) / 10);
        return Math.max(0, Math.min(n - 1, k));
      })
    );
  }

  const mappedIcoord = useMemo(() => remapIcoord(dendrogram.icoord || []), [dendrogram, n]);

  // === normalize dcoord values for plotting heights (0..1) ===
  const mappedDcoord = useMemo(() => {
    const d = dendrogram.dcoord || [];
    if (!Array.isArray(d) || d.length === 0) return [];
    const all = d.flat();
    const min = Math.min(...all);
    const max = Math.max(...all);
    const rng = max === min ? 1 : max - min;
    // normalize to [0,1]
    return d.map((row) => row.map((v) => (v - min) / rng));
  }, [dendrogram]);

  // === build column (top) dendrogram traces using mappedIcoord for x and mappedDcoord for y ===
  // We'll render top dendrogram with y values scaled into a dedicated yaxis (yaxis_dendro_top)
  const colDendroTraces = useMemo(() => {
    if (!mappedIcoord || mappedIcoord.length === 0) return [];
    return mappedIcoord.map((xs, i) => ({
      x: xs,
      y: mappedDcoord[i].map((v) => v), // normalized height 0..1
      type: "scatter",
      mode: "lines",
      line: { color: "black", width: 1 },
      hoverinfo: "none",
      // bind to the dedicated top dendrogram axes created in layout
      xaxis: "x3",
      yaxis: "y3",
      showlegend: false,
    }));
  }, [mappedIcoord, mappedDcoord]);

  // === build row (right) dendrogram traces: swap coordinates ===
  // For vertical dendrogram on the right, use x=mappedDcoord and y=mappedIcoord
  const rowDendroTraces = useMemo(() => {
    if (!mappedIcoord || mappedIcoord.length === 0) return [];
    return mappedIcoord.map((xs, i) => ({
      x: mappedDcoord[i].map((v) => v), // normalized width 0..1
      y: xs,
      type: "scatter",
      mode: "lines",
      line: { color: "black", width: 1 },
      hoverinfo: "none",
      // bind to the dedicated right-side dendrogram x-axis and share heatmap y-axis
      xaxis: "x4",
      yaxis: "y",
      showlegend: false,
    }));
  }, [mappedIcoord, mappedDcoord]);

  // === build heatmap trace using integer indices as x/y coordinates, and tick labels mapping to sample names ===
  const heatmapTrace = useMemo(() => ({
    z: reorderedMatrix,
    x: indexArray,        // 0..n-1
    y: indexArray,        // 0..n-1
    type: "heatmap",
    colorscale: "Viridis",
    zsmooth: false,
    hovertemplate: "<b>%{customdata}</b><br>Distance: %{z}<extra></extra>",
    // we provide tick labels separately in layout
    xaxis: "x",
    yaxis: "y",
    customdata: (() => {
      // customdata used for hover: combine x,y -> label
      // Plotly will display customdata for the cell; but hovertemplate above uses it.
      // Provide a 2D array matching z for safety: placeholder cell label "col vs row"
      const cd = [];
      for (let i = 0; i < n; i++) {
        cd.push(reorderedSamples.map((c) => `${reorderedSamples[i]} × ${c}`));
      }
      return cd;
    })(),
  }), [reorderedMatrix, indexArray, reorderedSamples, n]);

  // === metadata strip: build colors and shapes aligned to indices 0..n-1 ===
  const { metadataColorsArray, categoricalMap, numericRange } = useMemo(() => {
    if (!selectedField || !metadata) return { metadataColorsArray: null, categoricalMap: null, numericRange: null };

    // values in the reordered order
    const vals = reorderedSamples.map((s) => {
      const v = metadata?.[s]?.[selectedField];
      return v === undefined ? null : v;
    });

    const nonNull = vals.filter((v) => v !== null);
    const numeric = isNumericArray(nonNull);

    if (numeric) {
      const nums = nonNull.map((v) => Number(v));
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const denom = max === min ? 1 : (max - min);
      const arr = vals.map((v) => (v === null ? "#eeeeee" : viridisColor((Number(v) - min) / denom)));
      return { metadataColorsArray: arr, categoricalMap: null, numericRange: { min, max } };
    } else {
      const uniq = Array.from(new Set(nonNull));

      // Preset palettes
      const PRESET_PALETTES = {
        default: DEFAULT_CATEGORICAL_PALETTE,
        pastel: ["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fed9a6", "#ffffcc", "#e5d8bd", "#fddaec", "#f2f2f2"],
        vibrant: ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641", "#2b83ba", "#7b3294", "#f46d43", "#66c2a5"],
        set2: ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"],
      };

      const palette = PRESET_PALETTES[paletteName] || DEFAULT_CATEGORICAL_PALETTE;

      const cmap = {};
      uniq.forEach((u, i) => {
        // allow custom override per-category from UI
        if (customCategoryColors && customCategoryColors[u]) {
          cmap[u] = customCategoryColors[u];
        } else {
          cmap[u] = palette[i % palette.length];
        }
      });
      const arr = vals.map((v) => (v === null ? "#eeeeee" : (cmap[v] || "#999999")));
      return { metadataColorsArray: arr, categoricalMap: cmap, numericRange: null };
    }
  }, [selectedField, metadata, reorderedSamples]);

  // We'll render the metadata strip as Plotly shapes (rectangles) anchored to the heatmap coordinate system.
  // Each rect spans x0 = i-0.5, x1 = i+0.5 and y domain will be mapped to 'paper' or dedicated axis.
  // To keep axes consistent we'll map shapes in xref:'x' and yref:'y3' where y3 has range [0, n-1] same as y.

  const metadataShapes = useMemo(() => {
    if (!metadataColorsArray) return [];
    return metadataColorsArray.map((col, i) => ({
      type: "rect",
      xref: "x",
      yref: "y3",
      x0: i - 0.5,
      x1: i + 0.5,
      y0: -0.5,
      y1: 0.5,
      fillcolor: col,
      line: { width: 0 },
    }));
  }, [metadataColorsArray]);

  // === Build traces list (heatmap first so it sits below dendrogram lines and above shapes if desired) ===
  // We'll place shapes in layout so they render behind or above as needed.
  const traces = useMemo(() => {
    const arr = [];
    // top dendrogram should be above heatmap; but trace order doesn't fully control layering.
    // include heatmap, then column dendrogram, then row dendrogram
    arr.push(heatmapTrace);

    // column dendrogram uses x axis same as heatmap and yaxis 'y_dendro_top'
    colDendroTraces.forEach((t) => arr.push(t));
    rowDendroTraces.forEach((t) => arr.push(t));

    return arr;
  }, [heatmapTrace, colDendroTraces, rowDendroTraces]);

  // === layout: set axes ranges explicitly so all layers align ===
  // We'll set the heatmap x/y ranges to [-0.5, n-0.5] so cell centers at integers 0..n-1.
  // y axis autorange reversed to show top->bottom matching sample order in reorderedSamples.
  const topDendroHeight = 0.18; // fraction of height for top dendrogram+metadata
  const metaBandHeight = 0.04;   // fraction for metadata band
  const topDendroDomainTop = 1;
  const topDendroDomainBottom = 1 - topDendroHeight;
  const metaDomainTop = topDendroDomainBottom + metaBandHeight;
  const metaDomainBottom = topDendroDomainBottom;

  const layout = useMemo(() => {
    // axis ranges for numeric coordinate mapping
    const axisRange = [-0.5, n - 0.5];

    return {
      autosize: true,
      height: Math.max(560, Math.min(40 * n + 260, 1400)),
      margin: { l: 160, r: 160, t: 80, b: 160 },

      // heatmap axes - use x/y with integer coordinate range, tick text mapped to sample names
      xaxis: {
        domain: [0.12, 0.88],
        range: axisRange,
        tickmode: "array",
        tickvals: indexArray,
        ticktext: reorderedSamples,
        tickangle: -45,
        ticks: "",
        automargin: true,
        zeroline: false,
        showgrid: false,
      },
      yaxis: {
        domain: [0.0, topDendroDomainBottom - 0.02], // heatmap takes lower region
        range: axisRange.slice().reverse(), // reverse so 0 is top row
        tickmode: "array",
        tickvals: indexArray,
        ticktext: reorderedSamples,
        automargin: true,
        ticks: "",
        autorange: false,
        zeroline: false,
        showgrid: false,
      },

      // column dendrogram axis: top area, shares same x range as heatmap
      xaxis_dendro_top: {
        domain: [0.12, 0.88],
        range: axisRange,
        showticklabels: false,
        zeroline: false,
        showgrid: false,
      },
      yaxis_dendro_top: {
        domain: [topDendroDomainBottom + metaBandHeight, topDendroDomainTop],
        showticklabels: false,
        zeroline: false,
        showgrid: false,
      },

      // metadata axis – sits between top dendrogram and heatmap, we use yref range same as heatmap's index range
      xaxis_meta: {
        domain: [0.12, 0.88],
        range: axisRange,
        showticklabels: false,
        zeroline: false,
        showgrid: false,
      },
      yaxis_meta: {
        domain: [topDendroDomainBottom, topDendroDomainBottom + metaBandHeight],
        range: axisRange.slice().reverse(), // align with heatmap orientation
        showticklabels: false,
        zeroline: false,
        showgrid: false,
      },

      // row dendrogram axis: to the right, shares same y range as heatmap
      xaxis_dendro_right: {
        domain: [0.9, 0.98], // narrow band to the right
        showticklabels: false,
        zeroline: false,
        showgrid: false,
      },
      yaxis_dendro_right: {
        domain: [0.0, topDendroDomainBottom - 0.02],
        range: axisRange.slice().reverse(),
        showticklabels: false,
        zeroline: false,
        showgrid: false,
      },

      shapes: metadataShapes, // metadata shapes will use xref:'x' and yref:'y3' (we set below to refer to x / yaxis_meta)

      showlegend: false,
      hovermode: "closest",
    };
  }, [n, reorderedSamples, indexArray, metadataShapes]);

  // Note: Plotly maps axes by their attribute names used in traces:
  // we used xaxis as 'x' and yaxis as 'y' for heatmapTrace,
  // used yaxis_dendro_top as yaxis name 'y_dendro_top' etc. Plotly expects axis names like yaxis, yaxis2, yaxis3...
  // To ensure the named axes are picked up by Plotly, we must map the names used in traces to standard axis numbers.
  // We'll do that by injecting aliases in layout: e.g. layout.yaxis_dendro_top -> layout['yaxis2'], layout.xaxis_dendro_top -> layout['xaxis']
  // But Plotly only recognizes xaxis, xaxis2, xaxis3,... and yaxis, yaxis2,...
  // We'll translate our named axes to xaxis/xaxis2/yaxis/yaxis2 form below.

  // Translate friendly names into Plotly axis names (do once)
  const normalizedLayout = useMemo(() => {
    // shallow clone to edit
    const L = { ...layout };

    // map our semantic axes to Plotly axis slots:
    // xaxis -> xaxis (heatmap)
    // yaxis -> yaxis (heatmap)
    // xaxis_dendro_top -> xaxis3
    // yaxis_dendro_top -> yaxis3
    // xaxis_meta -> xaxis (we reuse xaxis range for shapes by specifying xref:'x')
    // yaxis_meta -> yaxis3? We'll map metadata shapes with yref:'y' scaled into dedicated plotting using yaxis with domain
    // xaxis_dendro_right -> xaxis4
    // yaxis_dendro_right -> yaxis

    // We'll simplify: assign:
    // xaxis -> L.xaxis
    // yaxis -> L.yaxis
    // xaxis3 -> L.xaxis_dendro_top
    // yaxis3 -> L.yaxis_dendro_top
    // xaxis4 -> L.xaxis_dendro_right
    // yaxis4 -> L.yaxis_dendro_right
    // Additionally define yaxis_meta as yaxis3 domain area by moving shapes yref to 'y' with offsets.

    if (L.xaxis_dendro_top) {
      L["xaxis3"] = L.xaxis_dendro_top;
      delete L.xaxis_dendro_top;
    }
    if (L.yaxis_dendro_top) {
      L["yaxis3"] = L.yaxis_dendro_top;
      delete L.yaxis_dendro_top;
    }
    if (L.xaxis_dendro_right) {
      L["xaxis4"] = L.xaxis_dendro_right;
      delete L.xaxis_dendro_right;
    }
    if (L.yaxis_dendro_right) {
      L["yaxis4"] = L.yaxis_dendro_right;
      delete L.yaxis_dendro_right;
    }

    // For metadata shapes we set yref to 'y' and position them using yaxis range small band.
    // But to guarantee they sit between dendrogram and heatmap, we'll create yaxis_meta as yaxis5
    if (L.yaxis_meta) {
      L["yaxis5"] = L.yaxis_meta;
      delete L.yaxis_meta;
    }
    if (L.xaxis_meta) {
      L["xaxis5"] = L.xaxis_meta;
      delete L.xaxis_meta;
    }

    return L;
  }, [layout]);

  // Because we used shapes with yref:'y3' earlier, ensure shapes reference the correct axis: we'll transform shapes to use yref:'y' and then map to domain.
  // But Plotly shapes cannot be attached to a custom numeric axis name easily; to keep shapes aligned we must use xref:'x', yref:'y' and use y coordinates in same numeric range.
  // Our metadataShapes used y0:-0.5..0.5; but heatmap y uses range [-0.5, n-0.5] reversed. To place the metadata strip between top dendrogram and heatmap,
  // we'll convert shapes to use xref:'x', yref:'paper' and compute a paper y-range. That avoids complex axis remaps.
  // Simpler: instead of shapes we will produce a small extra heatmap trace for metadata on a dedicated y coordinate row in the numeric grid (index -1),
  // but that approach complicates z. Given time, we will keep shapes but use yref:'paper' with calculated normalized positions.

  // compute metadataShapes in paper coordinates (top-down) to ensure placement
  const finalShapes = useMemo(() => {
    if (!metadataColorsArray || metadataColorsArray.length === 0) return [];
    // Position metadata band between top dendrogram and heatmap: use topDendroDomainBottom .. topDendroDomainBottom + metaBandHeight
    // layout used domain fractions earlier; reuse them:
    // topDendroDomainBottom computed above
    const bandTop = topDendroDomainBottom + metaBandHeight;
    const bandBottom = topDendroDomainBottom;
    return metadataColorsArray.map((col, i) => ({
      type: "rect",
      xref: "x",
      yref: "paper",
      x0: i - 0.5,
      x1: i + 0.5,
      y0: bandBottom,
      y1: bandTop,
      fillcolor: col,
      line: { width: 0 },
    }));
  }, [metadataColorsArray]);

  // Attach finalShapes into normalizedLayout copy
  const layoutWithShapes = useMemo(() => {
    const L = { ...normalizedLayout };
    L.shapes = finalShapes;
    // ensure the primary axis mappings are present: xaxis,yaxis,yaxis3 (top dendro), xaxis3, xaxis4,yaxis4 etc.
    // ensure heatmap tick labels map to reorderedSamples
    // set xaxis ticktext and yaxis ticktext were already set above in layout generation
    return L;
  }, [normalizedLayout, finalShapes]);

  // === legend content (rendered in DOM under dropdown) ===
  const legendJSX = useMemo(() => {
    if (!selectedField) return null;
    if (numericRange) {
      return (
        <div style={{ marginLeft: 12, marginTop: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {displayNames[selectedField] || selectedField}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 220,
              height: 12,
              borderRadius: 4,
              background: "linear-gradient(to right, #440154, #414487, #2a788e, #22a884, #fde725)",
              border: "1px solid #ccc"
            }} />
            <div style={{ fontSize: 12 }}>
              <div>{numericRange.min?.toFixed(2)}</div>
            </div>
          </div>
        </div>
      );
    } else if (categoricalMap) {
      return (
        <div style={{ marginLeft: 12, marginTop: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {displayNames[selectedField] || selectedField}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(categoricalMap).map(([k, col]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 12, height: 12, background: col, borderRadius: 2 }} />
                <div style={{ fontSize: 12 }}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      );
    } else {
      return null;
    }
  }, [selectedField, numericRange, categoricalMap, displayNames]);

  // === export handlers (safe fallback) ===
  const exportPNG = async () => {
    try {
      if (!window.Plotly) {
        alert("PNG export not available (Plotly missing)");
        return;
      }

      // Prefer exporting the existing plot DOM if available
      let target = null;
      try {
        // react-plotly ref may be the DOM node or a component object; try common accessors
        target = plotRef.current?.el || plotRef.current?.container || plotRef.current;
      } catch (e) {
        target = plotRef.current;
      }

      // Helper: composite DOM legend onto exported image and trigger download
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

          // Draw legend in top-right area if present.
          // Prefer rendering the actual DOM legend (so text and colors match exactly).
          const legendNode = document.getElementById('distance-clustergram-legend');
          if (legendNode) {
            try {
              // Use the provided display name (metadata category) as title to avoid concatenated DOM text
              const titleText = (displayNames && displayNames[selectedField]) ? displayNames[selectedField] : selectedField;
              // Position legend outside plot area: bottom-right corner
              const legendWidth = 260;
              const legendX = cw - legendWidth - 15;
              // estimate plot bottom (typically around 80% down); place legend well below with extra padding
              let legendY = Math.max(ch * 0.88, ch - 120);

              // compute entries height to draw background box
              const colorBoxes = Array.from(legendNode.querySelectorAll('div')).filter((d) => {
                const s = window.getComputedStyle(d);
                return s && s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
              });
              const entriesCount = Math.max(0, colorBoxes.length) || (numericRange ? 1 : 0);
              const entriesHeight = entriesCount * 20 + 24;

              // draw white background box so legend doesn't overlap plot elements
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

              ctx.font = '14px sans-serif';
              ctx.fillStyle = '#000';
              ctx.fillText(titleText, legendX, legendY + 12);
              legendY += 22;

              if (colorBoxes.length > 0) {
                // assume each color box is followed by a label element in the DOM structure
                const entries = [];
                colorBoxes.forEach((box) => {
                  const col = window.getComputedStyle(box).backgroundColor;
                  // label is likely the next sibling
                  let label = '';
                  const parent = box.parentElement;
                  if (parent) {
                    const textNode = Array.from(parent.querySelectorAll('div')).find(el => el !== box && el.textContent && el.textContent.trim().length > 0);
                    if (textNode) label = textNode.textContent.trim();
                  }
                  entries.push({ label, col });
                });

                const rowH = 20;
                entries.forEach((entry, i) => {
                  const y = legendY + i * rowH;
                  ctx.fillStyle = entry.col || '#cccccc';
                  ctx.fillRect(legendX, y, 14, 14);
                  ctx.fillStyle = '#000';
                  ctx.font = '12px sans-serif';
                  ctx.fillText(entry.label, legendX + 20, y + 12);
                });
              } else if (numericRange) {
                // Fallback numeric gradient if no DOM color boxes found
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
              console.warn('Legend DOM drawing failed', e);
            }
          } else {
            // previous drawing fallback: draw based on categoricalMap or numericRange
            if (selectedField) {
              const title = (displayNames && displayNames[selectedField]) ? displayNames[selectedField] : selectedField;
              const legendWidth = 220;
              const legendX = Math.max(cw - legendWidth - 20, Math.floor(cw * 0.6));
              let legendY = 30;

              ctx.font = '14px sans-serif';
              ctx.fillStyle = '#000';
              ctx.fillText(title, legendX, legendY);
              legendY += 18;

              if (categoricalMap) {
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
            }
          }

          const composite = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = composite;
          a.download = 'clustergram.png';
          a.click();
        } catch (e) {
          // If canvas compositing fails, fall back to raw Plotly export
          const a = document.createElement("a");
          a.href = imgDataUrl;
          a.download = "clustergram.png";
          a.click();
        }
      }

      // If target exists and looks like a DOM element, try toImage directly
      if (target && target.nodeType === 1) {
        try {
          const img = await window.Plotly.toImage(target, { format: "png", width: 1200, height: 900 });
          // Composite DOM legend onto the exported image and download
          await compositeAndDownload(img);
          return;
        } catch (err) {
          // fall through to fallback below
          console.warn("Direct Plotly.toImage failed, falling back to offscreen render:", err);
        }
      }

      // Fallback: render traces/layout into an off-screen div and export that
      const off = document.createElement("div");
      off.style.position = "fixed";
      off.style.left = "-9999px";
      off.style.top = "-9999px";
      document.body.appendChild(off);

      // Prepare an export layout copy and inject legend (so exported PNG includes the metadata legend)
      const exportLayout = JSON.parse(JSON.stringify(layoutWithShapes || {}));

      // add legend for metadata (categorical or numeric) into exportLayout using paper coords
      const legendShapes = exportLayout.shapes ? exportLayout.shapes.slice() : [];
      const legendAnnotations = exportLayout.annotations ? exportLayout.annotations.slice() : [];

      if (selectedField) {
        const title = displayNames && displayNames[selectedField] ? displayNames[selectedField] : selectedField;
        // start top-right
        const startX = 0.92;
        let startY = 0.95;
        const vgap = 0.04;

        // Title annotation
        legendAnnotations.push({
          xref: 'paper', yref: 'paper', x: startX, y: startY + 0.02,
          xanchor: 'left', yanchor: 'bottom', showarrow: false,
          text: `<b>${title}</b>`, align: 'left', font: { size: 12 }
        });

        if (categoricalMap) {
          Object.entries(categoricalMap).forEach(([k, col], i) => {
            const yTop = startY - i * vgap;
            const yBottom = yTop - 0.03;
            // colored square
            legendShapes.push({ type: 'rect', xref: 'paper', yref: 'paper', x0: startX, x1: startX + 0.02, y0: yBottom, y1: yTop, fillcolor: col, line: { width: 0 } });
            // label
            legendAnnotations.push({ xref: 'paper', yref: 'paper', x: startX + 0.025, y: yBottom + 0.005, xanchor: 'left', yanchor: 'bottom', showarrow: false, text: k, font: { size: 11 } });
          });
        } else if (numericRange) {
          // draw a small gradient using multiple thin rects
          const steps = 10;
          const boxWidth = 0.06;
          for (let s = 0; s < steps; s++) {
            const frac = s / (steps - 1);
            const col = viridisColor(frac);
            const x0 = startX;
            const x1 = startX + boxWidth;
            const y0 = startY - 0.03;
            const y1 = startY - 0.01;
            const sx0 = x0 + (s / steps) * boxWidth;
            const sx1 = x0 + ((s + 1) / steps) * boxWidth;
            legendShapes.push({ type: 'rect', xref: 'paper', yref: 'paper', x0: sx0, x1: sx1, y0: y0, y1: y1, fillcolor: col, line: { width: 0 } });
          }
          // min/max labels
          legendAnnotations.push({ xref: 'paper', yref: 'paper', x: startX, y: startY - 0.04, xanchor: 'left', yanchor: 'top', showarrow: false, text: numericRange.min?.toFixed(2), font: { size: 10 } });
          legendAnnotations.push({ xref: 'paper', yref: 'paper', x: startX + 0.06, y: startY - 0.04, xanchor: 'right', yanchor: 'top', showarrow: false, text: numericRange.max?.toFixed(2), font: { size: 10 } });
        }
      }

      exportLayout.shapes = (exportLayout.shapes || []).concat(legendShapes);
      exportLayout.annotations = (exportLayout.annotations || []).concat(legendAnnotations);

      // Ensure heatmap colorbar is explicitly present and reserve right margin for it
      const exportTraces = (traces || []).map((t) => ({ ...t }));
      // find first heatmap trace and ensure it has a colorbar defined so Plotly will render it in export
      const hm = exportTraces.find((t) => t && (t.type === "heatmap" || t.type === "heatmapgl"));
      if (hm) {
        hm.colorbar = hm.colorbar || {};
        // position colorbar on the far right inside paper coords
        hm.colorbar.x = hm.colorbar.x ?? 0.98;
        hm.colorbar.xanchor = hm.colorbar.xanchor ?? "left";
        hm.colorbar.thickness = hm.colorbar.thickness ?? 20;
        hm.colorbar.len = hm.colorbar.len ?? 0.8;
        hm.colorbar.y = hm.colorbar.y ?? 0.5;
      }

      // increase right margin so colorbar + our legend annotations have space
      exportLayout.margin = exportLayout.margin || {};
      exportLayout.margin.r = Math.max(exportLayout.margin.r || 160, 260);

      // For reliable legend rendering, append phantom scatter traces for categoricalMap so Plotly generates a legend
      const exportTracesWithLegend = exportTraces.slice();
      if (categoricalMap) {
        // place points outside heatmap range so they don't appear in plot area
        const outsideCoord = n * 3;
        Object.entries(categoricalMap).forEach(([k, col]) => {
          exportTracesWithLegend.push({
            x: [outsideCoord], y: [outsideCoord], type: 'scatter', mode: 'markers',
            marker: { color: col, size: 12 }, name: k, hoverinfo: 'none', showlegend: true,
            xaxis: 'x', yaxis: 'y'
          });
        });
        // place legend on the right inside paper coordinates
        exportLayout.legend = exportLayout.legend || {};
        exportLayout.legend.x = exportLayout.legend.x ?? 0.92;
        exportLayout.legend.y = exportLayout.legend.y ?? 0.95;
        exportLayout.legend.xanchor = 'left';
        exportLayout.legend.yanchor = 'top';
        exportLayout.legend.font = exportLayout.legend.font || { size: 11 };
        exportLayout.legend.bordercolor = exportLayout.legend.bordercolor || '#ffffff';
        // ensure Plotly draws the legend
        exportLayout.showlegend = true;
      }

      await window.Plotly.newPlot(off, exportTracesWithLegend, exportLayout, { displayModeBar: false });
      const img = await window.Plotly.toImage(off, { format: "png", width: 1200, height: 900 });

      // Composite the exported image with a drawn legend (so DOM legend appears in PNG)
      try {
        const imgEl = new Image();
        imgEl.src = img;
        await new Promise((res) => { imgEl.onload = res; imgEl.onerror = res; });

        const cw = imgEl.width;
        const ch = imgEl.height;
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);

        // Draw legend in top-right area if present.
        // Prefer rendering the actual DOM legend (so text and colors match exactly).
        const legendNode = document.getElementById('distance-clustergram-legend');
        if (legendNode) {
          try {
            // Use the provided display name (metadata category) as title to avoid concatenated DOM text
            const titleText = (displayNames && displayNames[selectedField]) ? displayNames[selectedField] : selectedField;
            const legendWidth = 260;
            // place legend in the top-right corner outside the heatmap area
            const legendX = Math.max(cw - legendWidth - 20, Math.floor(cw * 0.7));
            let legendY = 12;

            // compute entries height to draw background box
            const colorBoxes = Array.from(legendNode.querySelectorAll('div')).filter((d) => {
              const s = window.getComputedStyle(d);
              return s && s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)';
            });
            const entriesCount = Math.max(0, colorBoxes.length) || (numericRange ? 1 : 0);
            const entriesHeight = entriesCount * 20 + 24;

            // draw white rounded background so legend doesn't overlap plot elements
            ctx.fillStyle = 'rgba(255,255,255,0.94)';
            const pad = 10;
            const bgX = legendX - pad / 2;
            const bgY = legendY - 8;
            const bgW = legendWidth + pad;
            const bgH = entriesHeight + pad;
            // simple rectangle with slight border
            ctx.fillRect(bgX, bgY, bgW, bgH);
            ctx.strokeStyle = 'rgba(200,200,200,0.9)';
            ctx.lineWidth = 1;
            ctx.strokeRect(bgX, bgY, bgW, bgH);

            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#000';
            ctx.fillText(titleText, legendX, legendY + 12);
            legendY += 20;

            // find colored entries inside legendNode: small divs with backgroundColor style
            if (colorBoxes.length > 0) {
              // assume each color box is followed by a label element in the DOM structure
              const entries = [];
              colorBoxes.forEach((box) => {
                const col = window.getComputedStyle(box).backgroundColor;
                // label is likely the next sibling
                let label = '';
                const parent = box.parentElement;
                if (parent) {
                  const textNode = Array.from(parent.querySelectorAll('div')).find(el => el !== box && el.textContent && el.textContent.trim().length > 0);
                  if (textNode) label = textNode.textContent.trim();
                }
                entries.push({ label, col });
              });

              const rowH = 20;
              entries.forEach((entry, i) => {
                const y = legendY + i * rowH;
                ctx.fillStyle = entry.col || '#cccccc';
                ctx.fillRect(legendX, y, 14, 14);
                ctx.fillStyle = '#000';
                ctx.font = '12px sans-serif';
                ctx.fillText(entry.label, legendX + 20, y + 12);
              });
            } else if (numericRange) {
              // Fallback numeric gradient if no DOM color boxes found
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
            // If any DOM parsing error happens, ignore and proceed without drawing DOM legend
            console.warn('Legend DOM drawing failed', e);
          }
        } else {
          // previous drawing fallback: draw based on categoricalMap or numericRange
          if (selectedField) {
            const title = (displayNames && displayNames[selectedField]) ? displayNames[selectedField] : selectedField;
            const legendWidth = 220;
            const legendX = Math.max(cw - legendWidth - 20, Math.floor(cw * 0.6));
            let legendY = 30;

            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#000';
            ctx.fillText(title, legendX, legendY);
            legendY += 18;

            if (categoricalMap) {
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
          }
        }

        const composite = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = composite;
        a.download = 'clustergram.png';
        a.click();
      } catch (e) {
        // If canvas compositing fails, fall back to raw Plotly export
        const a = document.createElement("a");
        a.href = img;
        a.download = "clustergram.png";
        a.click();
      }

      // clean up
      try { window.Plotly.purge(off); } catch (e) { /* ignore */ }
      document.body.removeChild(off);
    } catch (err) {
      console.error("Export failed", err);
      alert("Export failed: " + err.message);
    }
  };

  const exportCSV = () => {
    const header = ["sample", ...reorderedSamples].join(",");
    const rows = reorderedMatrix.map((row, i) => [reorderedSamples[i], ...row].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "distance_matrix_reordered.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <button onClick={exportPNG}>Export clustergram (PNG)</button>
        <button onClick={exportCSV}>Export distance matrix (CSV)</button>

        {Array.isArray(metadataFields) && metadataFields.length > 0 && (
          <select
            value={selectedField || ""}
            onChange={(e) => setSelectedField(e.target.value || null)}
            style={{ marginLeft: 12 }}
          >
            <option value="">Color by: (none)</option>
            {metadataFields.map((f) => (
              <option key={f} value={f}>
                {displayNames && displayNames[f] ? displayNames[f] : f}
              </option>
            ))}
          </select>
        )}

        {/* Palette selector for metadata coloring */}
        {selectedField && (
          <select
            value={paletteName}
            onChange={(e) => setPaletteName(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="default">Palette: Default</option>
            <option value="pastel">Palette: Pastel</option>
            <option value="vibrant">Palette: Vibrant</option>
            <option value="set2">Palette: Set2</option>
          </select>
        )}

        {/* Legend DOM (under dropdown area) - give it an id so export can capture it */}
        {selectedField && (
          <div id="distance-clustergram-legend" style={{ marginLeft: 12 }}>
            {legendJSX}

            {/* Per-category color pickers for categorical metadata */}
            {categoricalMap && (
              <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {Object.entries(categoricalMap).map(([k, col]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
      </div>

      <Plot
        ref={plotRef}
        data={traces}
        layout={layoutWithShapes}
        config={{ responsive: true, displaylogo: false }}
        style={{ width: "100%", height: layoutWithShapes.height }}
        useResizeHandler={true}
        
      />
      
    </div>
    
  );
}
