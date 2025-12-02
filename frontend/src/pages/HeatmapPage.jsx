import React, { useState } from "react";
import { postHeatmap, getVariantCount, getConfig, API } from "../api";
import DistanceClustergram from "../components/DistanceClustergram";

export default function HeatmapPage() {
  const [metadata, setMetadata] = useState({});
  const [metadataFields, setMetadataFields] = useState([]);
  const [displayNames, setDisplayNames] = useState({});

  const [species, setSpecies] = useState("carrot");
  const [blocks, setBlocks] = useState([{ genes: "" }]);
  const [useAll, setUseAll] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [maxSnps, setMaxSnps] = useState(50000);
  const [sampling, setSampling] = useState("deterministic");
  const [seed, setSeed] = useState(42);
  const [variantCount, setVariantCount] = useState(null);
  const [maxSnpsLimit, setMaxSnpsLimit] = useState(50000);

  // Fetch config + variant count when species changes
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [configData, variantData] = await Promise.all([
          getConfig(species),
          getVariantCount(species),
        ]);
        setMaxSnpsLimit(configData.max_snps_limit);
        setVariantCount(variantData.n_variants);
        setMaxSnps(configData.max_snps_limit);
      } catch (err) {
        setVariantCount(null);
      }
    };
    fetchData();
  }, [species]);

  async function runHeatmap() {
    setLoading(true);
    setResult(null);

    // ---- Build payload ----
    const payload = {};
    if (useAll) {
      payload.use_all = true;
      payload.max_snps = Number(maxSnps) || 100000;
      payload.sampling = sampling;
      payload.downsample_n = payload.max_snps;
      payload.downsample_mode = sampling;
      if (sampling === "random") {
        payload.seed = seed;
        payload.random_seed = seed;
      }
    } else {
      payload.phenotype_blocks = blocks
        .map((b) => ({
          genes: b.genes
            .split(/[\s,]+/)
            .map((g) => g.trim())
            .filter(Boolean),
        }))
        .filter((b) => b.genes.length > 0);
    }
    if (selectedSamples.length > 0) payload.samples = selectedSamples;

    try {
      // ---- 1. Run heatmap ----
      const raw = await postHeatmap(species, payload);
      console.log("RAW BACKEND RESPONSE:", JSON.parse(JSON.stringify(raw)));

      // Backend is now fixed — use values directly
      const normalized = {
        samples: raw.samples_reordered ?? raw.samples ?? [],
        distance_matrix:
          raw.distance_matrix_reordered ?? raw.distance_matrix ?? [],
        dendrogram: {
          icoord: raw.icoord ?? raw.dendrogram?.icoord ?? [],
          dcoord: raw.dcoord ?? raw.dendrogram?.dcoord ?? [],
          order: raw.order ?? raw.dendrogram?.order ?? [],
        },
        n_variants: raw.n_variants,           // REAL variants used
        n_samples: raw.n_samples,             // REAL samples used
        max_snps_used: raw.max_snps_used,     // REAL downsample N
      };


setResult(normalized);


      // ---- 2. Fetch metadata fields ----
      const fieldsResp = await fetch(`${API}/api/${species}/metadata/fields`);
      if (fieldsResp.ok) {
        const fieldsJson = await fieldsResp.json();
        setMetadataFields(fieldsJson.fields || []);
        setDisplayNames(fieldsJson.display_names || {});
      }

      // ---- 3. Fetch metadata table ----
      const metaResp = await fetch(`${API}/api/${species}/metadata`);
      if (metaResp.ok) {
        setMetadata(await metaResp.json());
      }
    } catch (err) {
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
          <input
            type="checkbox"
            checked={useAll}
            onChange={(e) => setUseAll(e.target.checked)}
          />{" "}
          Use all SNPs (downsampled by backend)
        </label>

        {useAll && (
          <div style={{ marginTop: 10, padding: 10, background: "#eef5ff" }}>
            <label>
              Downsample N SNPs:&nbsp;
              <input
                type="number"
                value={maxSnps}
                max={maxSnpsLimit}
                onChange={(e) => {
                  let val = Number(e.target.value) || 0;
                  if (val > maxSnpsLimit) val = maxSnpsLimit;
                  setMaxSnps(val);
                }}
                style={{ width: 120 }}
              />
            </label>

            {variantCount !== null && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                <strong>Max available:</strong>{" "}
                {maxSnpsLimit.toLocaleString()} SNPs (database has{" "}
                {variantCount.toLocaleString()} total)
                {maxSnps > variantCount && (
                  <div style={{ color: "#d9534f", marginTop: 6 }}>
                    ⚠ Requested {maxSnps.toLocaleString()} SNPs, but only{" "}
                    {variantCount.toLocaleString()} available. Backend will use all.
                  </div>
                )}
              </div>
            )}

            <br />

            <label>
              Sampling mode:&nbsp;
              <select
                value={sampling}
                onChange={(e) => setSampling(e.target.value)}
              >
                <option value="deterministic">Deterministic</option>
                <option value="random">Random</option>
              </select>
            </label>

            <br />

            <label>
              Random seed (optional):&nbsp;
              <input
                type="number"
                value={seed}
                onChange={(e) =>
                  setSeed(e.target.value === "" ? null : Number(e.target.value))
                }
                style={{ width: 160 }}
              />
            </label>
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
                placeholder="Enter gene IDs"
                value={b.genes}
                onChange={(e) => {
                  const nb = [...blocks];
                  nb[i].genes = e.target.value;
                  setBlocks(nb);
                }}
                style={{ width: 400 }}
              />
              <button
                onClick={() =>
                  setBlocks((prev) => prev.filter((_, idx) => idx !== i))
                }
                style={{ marginLeft: 8 }}
                disabled={blocks.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button onClick={() => setBlocks((prev) => [...prev, { genes: "" }])}>
            Add block
          </button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <h4>Optional: sample list</h4>
        <input
          type="text"
          placeholder="SRR123 SRR456"
          onChange={(e) => {
            const arr = e.target.value
              .split(/[,\s]+/)
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
        <div style={{ marginBottom: 8 }}>
          <strong>Samples used:</strong> {result.n_samples ?? "-"} &nbsp;&nbsp;
          <strong>Variants used:</strong>{" "}
          {result.n_variants?.toLocaleString() ?? "-"} &nbsp;&nbsp;
          <strong>Downsample setting:</strong>{" "}
          {result.max_snps_used?.toLocaleString() ?? "-"}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 18 }}>
          <DistanceClustergram
            samples={result.samples}
            matrix={result.distance_matrix}
            dendrogram={result.dendrogram}
            metadata={metadata}
            metadataFields={metadataFields}
            displayNames={displayNames}
          />
        </div>
      )}
    </div>
  );
}
