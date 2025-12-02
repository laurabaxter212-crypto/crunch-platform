import React, { useState } from "react";
import { postHeatmap, getSamples, getVariantCount, API } from "../api";   // <-- API imported here
import DistanceClustergram from "../components/DistanceClustergram";

export default function HeatmapPage() {
    // NEW: metadata state
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

  // Fetch variant count when species changes
  React.useEffect(() => {
    const fetchVariantCount = async () => {
      try {
        const data = await getVariantCount(species);
        setVariantCount(data.n_variants);
      } catch (err) {
        console.warn("Failed to fetch variant count:", err);
        setVariantCount(null);
      }
    };
    fetchVariantCount();
  }, [species]);

  async function runHeatmap() {
    setLoading(true);
    setResult(null);

    const payload = {};
    if (useAll) {
      payload.use_all = true;
      // send aliases accepted by backend visualisation; keep compatibility with similarity endpoint
      payload.max_snps = Number(maxSnps) || 100000;
      payload.sampling = sampling; // alias accepted by visualisation.py
      // also send alternative keys used by similarity endpoint for compatibility
      payload.downsample_n = Number(maxSnps) || 100000;
      payload.downsample_mode = sampling;
      if (sampling === "random") {
        if (seed !== null && seed !== undefined && seed !== "") payload.seed = seed;
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
        .filter((b) => (b.genes || []).length > 0);
    }
    if (selectedSamples.length > 0) payload.samples = selectedSamples;

    // DEBUG: log payload before sending
    console.log("Heatmap payload before sending:", payload);

    try {
      //
      // 1. RUN HEATMAP
      //
      const raw = await postHeatmap(species, payload);

// Normalize backend response fields to what DistanceClustergram expects
const normalized = {
  samples: raw.samples_reordered ?? raw.samples,
  distance_matrix: raw.distance_matrix_reordered ?? raw.distance_matrix,
  dendrogram: {
    icoord: raw.icoord ?? raw.dendrogram?.icoord ?? [],
    dcoord: raw.dcoord ?? raw.dendrogram?.dcoord ?? [],
    order: raw.order ?? raw.dendrogram?.order ?? [],
  },
  n_variants: raw.n_variants,
  max_snps_used: raw.max_snps_used,
};

setResult(normalized);


      //
      // 2. FETCH METADATA CONFIG  (patched URL)
      //
      //const fieldsResp = await fetch(`${API}/api/${species}/metadata/fields`);
      //if (fieldsResp.ok) {
      //  const fieldsJson = await fieldsResp.json();
      //  setMetadataFields(fieldsJson.fields || []);
      //  setDisplayNames(fieldsJson.display_names || {});
      //} else {
      //  console.warn("Failed to fetch metadata fields");
      //}
// ---- DEBUG START ----
console.log("Fetching metadata fields from:", `${API}/api/${species}/metadata/fields`);
// ---- DEBUG END ----

const fieldsResp = await fetch(`${API}/api/${species}/metadata/fields`);
if (fieldsResp.ok) {
  const fieldsJson = await fieldsResp.json();

  // ---- DEBUG START ----
  console.log("FIELDS JSON returned by backend:", fieldsJson);
  console.log("Setting metadataFields:", fieldsJson.fields);
  // ---- DEBUG END ----

  setMetadataFields(fieldsJson.fields || []);
  setDisplayNames(fieldsJson.display_names || {});

  // ---- DEBUG START ----
  setTimeout(() => {
    console.log("React state → metadataFields now:", metadataFields);
    console.log("React state → displayNames now:", displayNames);
  }, 500);
  // ---- DEBUG END ----

} else {
  console.warn("Failed to fetch metadata fields");
}

      //
      // 3. FETCH METADATA TABLE (patched URL)
      //
      //const metaResp = await fetch(`${API}/api/${species}/metadata`);
      //if (metaResp.ok) {
      //  const metaJson = await metaResp.json();
      //  setMetadata(metaJson);
      //} else {
      //  console.warn("Failed to fetch metadata");
      //}
      // ---- DEBUG START ----
console.log("Fetching metadata table from:", `${API}/api/${species}/metadata`);
// ---- DEBUG END ----

const metaResp = await fetch(`${API}/api/${species}/metadata`);
if (metaResp.ok) {
  const metaJson = await metaResp.json();

  // ---- DEBUG START ----
  console.log("METADATA JSON (sample → values) returned:", metaJson);
  // ---- DEBUG END ----

  setMetadata(metaJson);

  // ---- DEBUG START ----
  setTimeout(() => {
    console.log("React state → metadata now:", metadata);
  }, 500);
  // ---- DEBUG END ----

} else {
  console.warn("Failed to fetch metadata");
}

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
          <input type="checkbox" checked={useAll} onChange={(e) => setUseAll(e.target.checked)} />{" "}
          Use all SNPs (downsampled by backend)
        </label>

        {useAll && (
          <div style={{ marginTop: 10, padding: 10, background: "#eef5ff" }}>
            <label>
              Downsample N SNPs:&nbsp;
              <input
                type="number"
                value={maxSnps}
                max={50000}
                onChange={(e) => {
                  let val = Number(e.target.value) || 0;
                  if (val > 50000) val = 50000;
                  setMaxSnps(val);
                }}
                style={{ width: 120 }}
              />
            </label>
            {variantCount !== null && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                <strong>Max available:</strong> 50,000 SNPs (database has {variantCount.toLocaleString()} total)
                {maxSnps > variantCount && (
                  <div style={{ color: "#d9534f", marginTop: 6 }}>
                    ⚠ Requested {maxSnps.toLocaleString()} SNPs, but only {variantCount.toLocaleString()} available. Backend will use all.
                  </div>
                )}
              </div>
            )}

            <br />

            <label>
              Sampling mode:&nbsp;
              <select value={sampling} onChange={(e) => setSampling(e.target.value)}>
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
                onChange={(e) => setSeed(e.target.value === "" ? null : Number(e.target.value))}
                placeholder="leave blank for true randomness"
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
            metadata={metadata}
            metadataFields={metadataFields}
            displayNames={displayNames}
          />
        </div>
      )}
    </div>
  );
}
