import { useState } from "react";
import { fetchPcaMds } from "../api";
import PcaMdsPlot from "../components/PcaMdsPlot";

export default function VisualisationPage() {
  const [blocks, setBlocks] = useState([{genes: []}]);
  const [combine, setCombine] = useState("union");
  const [result, setResult] = useState(null);

  function updateGene(i, str) {
    const copy = [...blocks];
    copy[i].genes = str.split(/[, ]+/).filter(x=>x);
    setBlocks(copy);
  }

  async function run() {
    const payload = {
      phenotype_blocks: blocks,
      combine
    };
    const res = await fetchPcaMds(payload);
    setResult(res);
  }

  return (
    <div>
      <h2>PCA / MDS Visualisation</h2>

      {blocks.map((b,i)=>(
        <div key={i}>
          <h4>Gene List {i+1}</h4>
          <input onChange={(e)=>updateGene(i,e.target.value)} placeholder="DcUCG1 DcA6 ..." />
        </div>
      ))}

      <button onClick={()=>setBlocks([...blocks,{genes:[]}])}>
        + Add block
      </button>

      <div>
        <label>Combine gene sets:</label>
        <select value={combine} onChange={(e)=>setCombine(e.target.value)}>
          <option value="union">Union (default)</option>
          <option value="intersection">Intersection</option>
        </select>
      </div>

      <button onClick={run}>Compute PCA/MDS</button>

      {result && !result.error && (
        <div>
          <p>{result.n_variants} variants used.</p>
          <PcaMdsPlot data={result} />
        </div>
      )}

      {result && result.error && <p style={{color:"red"}}>{result.error}</p>}
    </div>
  );
}

