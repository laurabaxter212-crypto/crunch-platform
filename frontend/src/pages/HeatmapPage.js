import { useState } from "react";
import { fetchHeatmap } from "../api";
import DistanceHeatmap from "../components/DistanceHeatmap";

export default function HeatmapPage() {
  const [blocks, setBlocks] = useState([{genes: []}]);
  const [combine, setCombine] = useState("union");
  const [metric, setMetric] = useState("numeric");
  const [linkage, setLinkage] = useState("ward");
  const [result, setResult] = useState(null);

  function updateGene(i, str) {
    const copy = [...blocks];
    copy[i].genes = str.split(/[, ]+/).filter(x=>x);
    setBlocks(copy);
  }

  async function run() {
    const payload = {
      phenotype_blocks: blocks,
      combine,
      distance_metric: metric,
      linkage
    };

    const res = await fetchHeatmap(payload);
    setResult(res);
  }

  return (
    <div>
      <h2>Genetic Distance Heatmap + Clustering</h2>

      {blocks.map((b,i)=>(
        <div key={i}>
          <h4>Gene List {i+1}</h4>
          <input onChange={(e)=>updateGene(i,e.target.value)} />
        </div>
      ))}

      <button onClick={()=>setBlocks([...blocks,{genes:[]}])}>
        + Add block
      </button>

      <div>
        <label>Combine:</label>
        <select value={combine} onChange={(e)=>setCombine(e.target.value)}>
          <option value="union">Union</option>
          <option value="intersection">Intersection</option>
        </select>
      </div>

      <div>
        <label>Distance Metric:</label>
        <select value={metric} onChange={(e)=>setMetric(e.target.value)}>
          <option value="numeric">Numeric (default)</option>
          <option value="euclidean">Euclidean</option>
        </select>
      </div>

      <div>
        <label>Linkage Method:</label>
        <select value={linkage} onChange={(e)=>setLinkage(e.target.value)}>
          <option value="ward">Ward (default)</option>
          <option value="average">Average</option>
        </select>
      </div>

      <button onClick={run}>Compute Heatmap</button>

      {result && !result.error && (
        <div>
          <p>{result.n_variants} variants used.</p>
          <DistanceHeatmap data={result} />
        </div>
      )}

      {result && result.error && <p style={{color:"red"}}>{result.error}</p>}
    </div>
  );
}

