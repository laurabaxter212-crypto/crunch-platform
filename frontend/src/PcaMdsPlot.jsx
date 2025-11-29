// frontend/src/PcaMdsPlot.jsx
import React, { useMemo, useState } from "react";
import Plot from "react-plotly.js";

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

export default function PcaMdsPlot({
  samples = [],
  pca_coords = [],
  pca_explained = [],
  mds_coords = [],
  metadata = {},
  metadataFields = [],
  displayNames = {}
}) {
  const pcaX = pca_coords.map(r => r[0]);
  const pcaY = pca_coords.map(r => r[1]);
  const mdsX = mds_coords.map(r => r[0]);
  const mdsY = mds_coords.map(r => r[1]);

  const [selectedField, setSelectedField] = useState(null);
  const [paletteName, setPaletteName] = useState("default");
  const [customCategoryColors, setCustomCategoryColors] = useState({});

  // === compute metadata colors for selected field ===
  const { metadataColors, categoricalMap, numericRange } = useMemo(() => {
    if (!selectedField || !metadata || samples.length === 0) {
      return { metadataColors: null, categoricalMap: null, numericRange: null };
    }

    const vals = samples.map((s) => {
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
  }, [selectedField, metadata, samples, paletteName, customCategoryColors]);

  // === legend display ===
  const legendJSX = useMemo(() => {
    if (!selectedField) return null;
    if (numericRange) {
      return (
        <div style={{ marginTop: 6, marginBottom: 12 }}>
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
              <div>{numericRange.min?.toFixed(2)} → {numericRange.max?.toFixed(2)}</div>
            </div>
          </div>
        </div>
      );
    } else if (categoricalMap) {
      return (
        <div style={{ marginTop: 6, marginBottom: 12 }}>
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
          {/* Per-category color pickers */}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
        </div>
      );
    } else {
      return null;
    }
  }, [selectedField, numericRange, categoricalMap, displayNames]);

  // Determine marker colors for PCA plot
  const pcaMarkerColors = metadataColors || "#1f77b4";

  // Determine marker colors for MDS plot
  const mdsMarkerColors = metadataColors || "#ff7f0e";

  return (
    <div>
      {/* Metadata field selector and palette controls */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {Array.isArray(metadataFields) && metadataFields.length > 0 && (
          <select
            value={selectedField || ""}
            onChange={(e) => setSelectedField(e.target.value || null)}
          >
            <option value="">Color by: (none)</option>
            {metadataFields.map((f) => (
              <option key={f} value={f}>
                {displayNames && displayNames[f] ? displayNames[f] : f}
              </option>
            ))}
          </select>
        )}

        {selectedField && (
          <select
            value={paletteName}
            onChange={(e) => setPaletteName(e.target.value)}
          >
            <option value="default">Palette: Default</option>
            <option value="pastel">Palette: Pastel</option>
            <option value="vibrant">Palette: Vibrant</option>
            <option value="set2">Palette: Set2</option>
          </select>
        )}
      </div>

      {legendJSX}

      <h4>PCA (PC1 vs PC2)</h4>
      <Plot
        data={[{
          x: pcaX,
          y: pcaY,
          text: samples,
          mode: "markers",
          type: "scatter",
          marker: {
            size: 7,
            color: pcaMarkerColors,
            line: { width: 0 }
          }
        }]}
        layout={{
          width: 800,
          height: 500,
          title: `PCA (explained: ${pca_explained.slice(0, 2).map(x => x.toFixed(2)).join(", ")})`
        }}
      />

      <h4>MDS</h4>
      <Plot
        data={[{
          x: mdsX,
          y: mdsY,
          text: samples,
          mode: "markers",
          type: "scatter",
          marker: {
            size: 7,
            color: mdsMarkerColors,
            line: { width: 0 }
          }
        }]}
        layout={{ width: 800, height: 500, title: `MDS` }}
      />
    </div>
  );
}

