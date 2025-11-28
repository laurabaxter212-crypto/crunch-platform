import React, { useState } from "react";
import { fetchHeatmap } from "../api";
import DistanceHeatmap from "../components/DistanceHeatmap";

export default function HeatmapPage() {
  const [species, setSpecies] = useState("carrot");
  const [blocks, setBlocks] = useState([{ genes: [] }]);
  const [geneText, setGeneText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function updateGenes(i, text) {
    const newBlocks = [...blocks];
    newBlocks[i].genes = text
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x);
    setBlocks(newBlocks);
  }

  async function runHeatmap() {
    setError(null);
    try {
      const payload = {
        phenotype_blocks: blocks.map((b) => ({ genes: b.genes })),
        combine: "union",
      };
      const data = await fetchHeatmap(payload, species);
      setResult(data);
    } catch (e) {
      console.error(e);
      setError(e.toString());
    }
  }

  return (
    <div>
      <h2>Genetic Distance Heatmap + Clustering</h2>

      <label>
        Species:{" "}
        <select value={species} onChange={(e) => setSpecies(e.target.value)}>
          <option value="carrot">Carrot</option>
          <option value="onion">Onion</option>
        </select>
      </label>

      <h3>Gene Blocks</h3>

      {blocks.map((b, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <textarea
            rows={4}
            cols={40}
            placeholder="Enter genes (one per line)"
            value={b.genes.join("\n")}
            onChange={(e) => updateGenes(i, e.target.value)}
          />
        </div>
      ))}

      <button
        onClick={() => setBlocks([...blocks, { genes: [] }])}
        style={{ marginRight: 12 }}
      >
        + Add Block
      </button>

      <button onClick={runHeatmap}>Compute Heatmap</button>

      {error && (
        <div style={{ color: "red", marginTop: 20 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 30 }}>
          <DistanceHeatmap data={result} />
        </div>
      )}
    </div>
  );
}
