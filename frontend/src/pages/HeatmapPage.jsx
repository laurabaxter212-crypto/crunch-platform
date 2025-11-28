import React, { useState } from "react";
import { postHeatmap, getSamples } from "../api";
import DistanceClustergram from "../components/DistanceClustergram";

export default function HeatmapPage() {
  const [species, setSpecies] = useState("carrot");
  const [blocks, setBlocks] = useState([{ genes: "" }]);
  const [useAll, setUseAll] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState([]); // array of sample IDs
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runHeatmap() {
    setLoading(true);
    setResult(null);

    const payload = {};
    if (useAll) {
      payload.use_all = true;
    } else {
      payload.phenotype_blocks = blocks
        .map((b) => ({
          genes: b.genes
            .split(/[\s,]+/)
            .map((g) => g.trim())
            .filter(Boolean),
        }))
        .filter((b) => (b.genes || []).length > 0);
    }
    if (selectedSamples.length > 0) payload.samples = selectedSamples;

    try {
      const res = await postHeatmap(species, payload);
      setResult(res);
    } catch (err) {
      console.error("Heatmap error:", err);
      alert("Heatmap request failed: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Genetic Distance Heatmap + Clustering</h2>

      <div style={{ marginBottom: 12 }}>
        <label>
          Species:{" "}
          <select
            value={species}
            onChange={(e) => {
              setSpecies(e.target.value);
              setResult(null);
            }}
          >
            <option value="carrot">carrot</option>
            <option value="onion">onion</option>
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <input type="checkbox" checked={useAll} onChange={(e) => setUseAll(e.target.checked)} /> Use all SNPs (downsampled by backend)
        </label>
        {useAll && (
          <div style={{ marginTop: 8, padding: 8, background: "#eef5ff", borderRadius: 6 }}>
            <strong>Note:</strong> "Use all SNPs" uses backend downsampling. The backend will decide the actual number used.
          </div>
        )}
      </div>

      {!useAll && (
        <div style={{ marginBottom: 12 }}>
          <h4>Phenotype gene blocks</h4>
          {blocks.map((b, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <input
                type="text"
                placeholder="Enter gene IDs separated by space or comma"
                value={b.genes}
                onChange={(e) => {
                  const nb = [...blocks];
                  nb[i].genes = e.target.value;
                  setBlocks(nb);
                }}
                style={{ width: 400 }}
              />
              <button
                onClick={() => setBlocks((prev) => prev.filter((_, idx) => idx !== i))}
                style={{ marginLeft: 8 }}
                disabled={blocks.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button onClick={() => setBlocks((prev) => [...prev, { genes: "" }])}>Add block</button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <h4>Optional: sample list (space/comma-separated)</h4>
        <input
          type="text"
          placeholder="SRR123 SRR456"
          onChange={(e) => {
            const arr = e.target.value
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            setSelectedSamples(arr);
          }}
          style={{ width: 500 }}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={runHeatmap} disabled={loading}>
          {loading ? "Computing…" : "Compute heatmap"}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 18 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Variants used:</strong> {result.n_variants?.toLocaleString() ?? "-"} &nbsp;&nbsp;
            <strong>Downsample setting:</strong> {result.max_snps_used?.toLocaleString() ?? "-"}
          </div>

          <DistanceClustergram
            samples={result.samples}
            matrix={result.distance_matrix}
            dendrogram={result.dendrogram}
          />

        </div>
      )}
    </div>
  );
}
