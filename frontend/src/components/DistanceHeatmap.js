import Plot from "react-plotly.js";

export default function DistanceHeatmap({ data }) {
  if (!data) return null;

  const { samples, distance_matrix, linkage_tree } = data;

  return (
    <div style={{display:"flex", flexDirection:"row", gap:"30px"}}>
      
      {/* Heatmap */}
      <Plot
        data={[
          {
            z: distance_matrix,
            x: samples,
            y: samples,
            type: "heatmap",
            colorscale: "Viridis"
          }
        ]}
        layout={{
          title: "Pairwise Genetic Distance Heatmap",
          width: 600,
          height: 600
        }}
      />

      {/* Dendrogram */}
      <Plot
        data={[
          {
            type: "scatter",
            x: linkage_tree.map(d => d[2]),
            y: linkage_tree.map((_,i)=> i),
            mode: "markers"
          }
        ]}
        layout={{
          title: "Clustering Dendrogram (simplified)",
          width: 350,
          height: 600,
          xaxis: {title: "Distance"}
        }}
      />
    </div>
  );
}

