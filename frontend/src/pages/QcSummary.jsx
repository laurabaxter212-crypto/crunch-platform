// frontend/src/pages/QcSummary.jsx
import React, { useEffect, useState } from "react";
import { fetchQcSummary } from "../api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";

export default function QcSummary() {
  const species = "carrot";

  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchQcSummary(species)
      .then((data) => {
        console.log("QC SUMMARY:", data);
        setSummary(data);
      })
      .catch((err) => setError(err.toString()));
  }, []);

  if (error)
    return <div style={{ padding: 20, color: "red" }}>Error: {error}</div>;
  if (!summary) return <div style={{ padding: 20 }}>Loading QC summary…</div>;

  // ---------------------------
  // Build per-sample table
  // ---------------------------
  const samples = summary.samples || [];
  const missing = summary.sample_missing || [];
  const het = summary.sample_het || [];

  const perSampleData = samples.map((s, i) => ({
    sample: s,
    missing: missing[i] ?? 0,
    het: het[i] ?? 0,
  }));

  // ---------------------------
  // Histogram conversion
  // ---------------------------
  function binsToChart(bins, counts) {
    if (!bins || !counts || bins.length !== counts.length + 1) return [];
    return counts.map((c, i) => ({
      bin: `${bins[i].toFixed(2)} – ${bins[i + 1].toFixed(2)}`,
      count: c,
    }));
  }

  const histComponents = Object.entries(summary.histograms || {}).map(
    ([name, h]) => ({
      name,
      data: binsToChart(h.bins, h.counts),
    })
  );

  return (
    <div style={{ padding: 20 }}>
      <h1>QC Summary</h1>
      {/* ---- Help / Info Panel ---- */}
<details style={{
  background: "#f8f9fa",
  padding: "15px 20px",
  borderRadius: "8px",
  marginBottom: "20px",
  border: "1px solid #ddd",
}}>
  <summary style={{ cursor: "pointer", fontSize: "1.1em", fontWeight: 600 }}>
    What do these QC metrics mean?
  </summary>

  <div style={{ marginTop: 15, lineHeight: 1.5 }}>
    <p><b>AF — Allele Frequency</b><br />
      Shows how common a variant is across all samples.  
      AF = 0 → nobody has the variant.  
      AF = 1 → everyone has it.</p>

    <p><b>DP — Read Depth</b><br />
      Number of sequencing reads covering each position.  
      Higher depth = more confident genotype calls.</p>

    <p><b>MQ — Mapping Quality</b><br />
      How confidently sequencing reads were aligned to the genome  
      (typically ranges from 0–60). Higher is better.</p>

    <p><b>QUAL — Variant Quality Score</b><br />
      Confidence that the variant is real and not a sequencing error.  
      Higher = more reliable.</p>

    <p><b>Missing Rate (per variant)</b><br />
      The fraction of samples missing a genotype call at that variant.  
      0.0 = no missing calls, 1.0 = missing in all samples.</p>

    <p><b>Per-Sample Missingness</b><br />
      Measures how many genotypes are missing for each individual sample.  
      High missingness often means low sequencing depth or poor data quality.</p>

    <p><b>Per-Sample Heterozygosity</b><br />
      Count of heterozygous sites (one ref allele + one alt allele).  
      Extremely low values may suggest inbreeding;  
      very high values can indicate contamination or mixed samples.</p>
  </div>
</details>


      <h2>Overview</h2>
      <p><b>Total variants:</b> {summary.n_variants}</p>
      <p><b>Total samples:</b> {summary.n_samples}</p>

      {/* --------------------------- */}
      {/* Missingness per sample       */}
      {/* --------------------------- */}
      <h2>Per-Sample Missingness</h2>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={perSampleData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="sample"
              angle={-45}
              textAnchor="end"
              interval={0}
              height={90}
            />
            <YAxis>
              <Label angle={-90} position="insideLeft" value="Missing Count" />
            </YAxis>
            <Tooltip />
            <Bar dataKey="missing" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* --------------------------- */}
      {/* Heterozygosity per sample   */}
      {/* --------------------------- */}
      <h2>Per-Sample Heterozygosity</h2>
      <div style={{ height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={perSampleData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="sample"
              angle={-45}
              textAnchor="end"
              interval={0}
              height={90}
            />
            <YAxis>
              <Label angle={-90} position="insideLeft" value="Het Count" />
            </YAxis>
            <Tooltip />
            <Bar dataKey="het" fill="#82ca9d" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* --------------------------- */}
      {/* Histograms                  */}
      {/* --------------------------- */}
      <h2>Histograms</h2>
      {histComponents.map((h) => (
        <div key={h.name} style={{ marginBottom: 40 }}>
          <h3>{h.name.toUpperCase()}</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={h.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                dataKey="bin"
                angle={-90}
                textAnchor="end"
                interval="preserveStartEnd"
                height={70}
                fontSize={10}
/>

                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}
