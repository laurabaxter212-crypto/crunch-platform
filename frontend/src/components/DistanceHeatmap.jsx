// frontend/src/components/DistanceHeatmap.js
import React, { useMemo } from "react";
import Plot from "react-plotly.js";

/**
 * Build a linkage matrix using average linkage (UPGMA-style) from a symmetric distance matrix.
 * Returns an array of merges like SciPy linkage: [idx1, idx2, dist, new_cluster_size]
 *
 * Complexity: O(n^3) naive algorithm. Fine for n up to a few hundreds.
 */
function buildLinkageFromDistanceMatrix(D) {
  const n = D.length;
  if (n === 0) return [];

  // Initialize clusters: each cluster is { id: i, members: [i] }
  const clusters = [];
  for (let i = 0; i < n; i++) clusters.push({ id: i, members: [i] });

  // Helper: distance between clusters (average of pairwise distances)
  function clusterDistance(c1, c2) {
    let sum = 0;
    let count = 0;
    for (const a of c1.members) {
      for (const b of c2.members) {
        sum += D[a][b];
        count += 1;
      }
    }
    return sum / count;
  }

  const linkage = [];
  // Maintains available clusters in array; new clusters appended with incremental ids >= n
  let nextClusterId = n;

  while (clusters.length > 1) {
    let bestI = 0,
      bestJ = 1;
    let bestDist = clusterDistance(clusters[0], clusters[1]);

    // find pair with minimum average distance
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const dist = clusterDistance(clusters[i], clusters[j]);
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // merge clusters[bestI] and clusters[bestJ]
    const c1 = clusters[bestI];
    const c2 = clusters[bestJ];

    // linkage row: [id1, id2, dist, size]
    const size = c1.members.length + c2.members.length;
    linkage.push([c1.id, c2.id, bestDist, size]);

    // create new cluster
    const newCluster = {
      id: nextClusterId++,
      members: [...c1.members, ...c2.members],
    };

    // remove larger index first to not break indices
    if (bestI > bestJ) {
      clusters.splice(bestI, 1);
      clusters.splice(bestJ, 1);
    } else {
      clusters.splice(bestJ, 1);
      clusters.splice(bestI, 1);
    }
    clusters.push(newCluster);
  }

  return linkage;
}

/**
 * Convert linkage (SciPy-style) into shapes (lines) for a left-oriented dendrogram.
 * - linkage: array of [a, b, dist, size]
 * - leafCount: original n (number of leaves)
 * - leafOrder: array mapping leaf index -> y position (0 .. n-1). Must match heatmap row order.
 *
 * Returns an object { shapes, yRange, xMax } where shapes is an array of Plotly shape objects.
 */
function linkageToDendrogramShapes(linkage, leafCount, leafOrder) {
  // We need to compute the y-position for each cluster id.
  // For original leaves (0..leafCount-1), y = index in leafOrder
  const yPos = {}; // id -> y coordinate
  for (let i = 0; i < leafCount; i++) {
    const leafIdx = i;
    const y = leafOrder.indexOf(leafIdx);
    // If not found (shouldn't happen), fallback to i
    yPos[leafIdx] = y === -1 ? i : y;
  }

  // track cluster members arrays (by id)
  const clusterMembers = {};
  for (let i = 0; i < leafCount; i++) clusterMembers[i] = [i];

  const shapes = [];
  let xMax = 0;

  // For each merge in linkage order, create horizontal line at merge height (distance)
  linkage.forEach((row) => {
    const [a, b, dist, size] = row;
    const membersA = clusterMembers[a];
    const membersB = clusterMembers[b];

    // y positions: min and max of clusters (positions of leaves)
    const yA = median(membersA.map((m) => yPos[m]));
    const yB = median(membersB.map((m) => yPos[m]));

    const yTop = Math.max(yA, yB);
    const yBottom = Math.min(yA, yB);
    const yMid = (yTop + yBottom) / 2;

    // Horizontal line spanning from yBottom to yTop at x = dist
    // But dendrogram is usually drawn with horizontal lines connecting two vertical lines for children:
    // We'll draw:
    //  - vertical line for cluster A from yA to dist
    //  - vertical line for cluster B from yB to dist
    //  - horizontal line connecting the two verticals at x=dist

    // vertical for A
    shapes.push({
      type: "line",
      x0: 0,
      y0: yA,
      x1: dist,
      y1: yA,
      xref: "x",
      yref: "y",
      line: { color: "#444", width: 1 },
    });
    // vertical for B
    shapes.push({
      type: "line",
      x0: 0,
      y0: yB,
      x1: dist,
      y1: yB,
      xref: "x",
      yref: "y",
      line: { color: "#444", width: 1 },
    });
    // horizontal connecting
    shapes.push({
      type: "line",
      x0: dist,
      y0: yA,
      x1: dist,
      y1: yB,
      xref: "x",
      yref: "y",
      line: { color: "#444", width: 1 },
    });

    // Update members and yPos for new cluster id
    // new id will be higher than previous; we just use a generated id index
    const newId = Math.max(...Object.keys(clusterMembers).map(Number)) + 1;
    clusterMembers[newId] = [...membersA, ...membersB];

    // For consistent plotting, set yPos for newId to center
    yPos[newId] = yMid;

    // Remove a and b from clusterMembers? keep for traceability but optional
    delete clusterMembers[a];
    delete clusterMembers[b];

    xMax = Math.max(xMax, dist);
  });

  // yRange is [minY - 0.5, maxY + 0.5]
  const ys = Object.values(yPos);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);

  return { shapes, yRange: [yMin - 0.5, yMax + 0.5], xMax };
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid];
  return (s[mid - 1] + s[mid]) / 2;
}

/**
 * Component: DistanceHeatmap
 * Props:
 *   data: {
 *     samples: [sample1, sample2, ...],
 *     distance_matrix: [[...], ...],
 *     linkage_tree: [[a,b,dist,size], ...] // optional, we compute our own too
 *   }
 */
export default function DistanceHeatmap({ data }) {
  if (!data) return null;

  const { samples, distance_matrix } = data;
  const n = samples.length;

  // Build client-side linkage from distance_matrix to guarantee alignment with samples order
  const linkage = useMemo(() => buildLinkageFromDistanceMatrix(distance_matrix), [
    distance_matrix,
  ]);

  // leafOrder: leaves indices 0..n-1 (distance matrix already in desired order)
  const leafOrder = Array.from({ length: n }, (_, i) => i);

  // Create dendrogram shapes and xMax
  const { shapes: dendroShapes, yRange, xMax } = useMemo(
    () => linkageToDendrogramShapes(linkage, n, leafOrder),
    [linkage, n, leafOrder]
  );

  // Heatmap trace
  const heatTrace = useMemo(
    () => [
      {
        z: distance_matrix,
        x: samples,
        y: samples,
        type: "heatmap",
        colorscale: "Viridis",
        hovertemplate:
          "<b>%{x}</b> vs <b>%{y}</b><br>Distance: %{z}<extra></extra>",
        colorbar: { title: "Distance", len: 0.7 },
      },
    ],
    [distance_matrix, samples]
  );

  const heatLayout = {
    title: `Pairwise genetic distance (n=${n})`,
    width: 650,
    height: Math.max(400, Math.min(900, 40 * n + 200)),
    margin: { l: 100, r: 10, t: 50, b: 150 },
    xaxis: {
      automargin: true,
      tickangle: -45,
      side: "bottom",
    },
    yaxis: {
      automargin: true,
      autorange: "reversed", // keep heatmap y order consistent with tree
    },
  };

  // Dendrogram layout: horizontal axis = distance, vertical axis = sample index (0..n-1)
  const dendroLayout = {
    title: "Clustering dendrogram",
    width: 300,
    height: heatLayout.height,
    margin: { l: 10, r: 10, t: 50, b: 50 },
    xaxis: {
      title: "Distance",
      range: [0, xMax ? xMax * 1.05 : 1],
      showgrid: false,
      zeroline: false,
    },
    yaxis: {
      showticklabels: false,
      range: yRange,
      autorange: false,
    },
    shapes: dendroShapes,
  };

  // Compose two side-by-side plots; ensure same height so rows align visually
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div>
        <Plot
          data={[
            {
              x: linkage.map((r) => r[2]),
              y: linkage.map((_, i) => i),
              mode: "markers",
              marker: { opacity: 0 },
              hoverinfo: "none",
            },
          ]}
          layout={dendroLayout}
          config={{ responsive: true, displaylogo: false }}
        />
      </div>

      <div style={{ flex: 1 }}>
        <Plot
          data={heatTrace}
          layout={heatLayout}
          config={{ responsive: true, displaylogo: false }}
        />
      </div>
    </div>
  );
}
