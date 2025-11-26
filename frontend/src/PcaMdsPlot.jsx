// frontend/src/PcaMdsPlot.jsx
import React from "react";
import Plot from "react-plotly.js";

export default function PcaMdsPlot({ samples = [], pca_coords = [], pca_explained = [], mds_coords = [] }) {
  const pcaX = pca_coords.map(r => r[0]);
  const pcaY = pca_coords.map(r => r[1]);
  const mdsX = mds_coords.map(r => r[0]);
  const mdsY = mds_coords.map(r => r[1]);

  return (
    <div>
      <h4>PCA (PC1 vs PC2)</h4>
      <Plot
        data={[{
          x: pcaX, y: pcaY, text: samples, mode: "markers", type: "scatter",
          marker: { size: 7 }
        }]}
        layout={{ width: 800, height: 500, title: `PCA (explained: ${pca_explained.slice(0,2).map(x=>x.toFixed(2)).join(", ")})` }}
      />
      <h4>MDS</h4>
      <Plot
        data={[{
          x: mdsX, y: mdsY, text: samples, mode: "markers", type: "scatter",
          marker: { size: 7 }
        }]}
        layout={{ width: 800, height: 500, title: `MDS` }}
      />
    </div>
  );
}

