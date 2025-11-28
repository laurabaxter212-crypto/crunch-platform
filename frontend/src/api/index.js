// frontend/src/api/index.js
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

/** Helper for POST requests */
async function postJson(path, payload) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`HTTP ${r.status}: ${txt}`);
  }
  return r.json();
}

// ---- Utility ----
export async function pingBackend() {
  return fetch(`${API}/api/ping`).then((r) => r.json());
}

// ---- Samples (FIXED endpoint) ----
export async function getSamples(species = "carrot") {
  const url = `${API}/api/${encodeURIComponent(species)}/samples`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch samples: ${r.status}`);
  return r.json(); // returns { samples: [...] }
}

// ---- Similarity ----
export async function runSimilarity(payload, species = "carrot") {
  return postJson(`/api/${encodeURIComponent(species)}/similarity`, payload);
}

// ---- PCA/MDS ----
export async function runPcaMds(payload, species = "carrot") {
  return postJson(`/api/${encodeURIComponent(species)}/pca_mds`, payload);
}

// ---- Heatmap ----
export async function fetchHeatmap(payload, species = "carrot") {
  return postJson(`/api/${encodeURIComponent(species)}/heatmap`, payload);
}

export async function postHeatmap(species, body) {
  const url = `${API}/api/${encodeURIComponent(species)}/heatmap`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Heatmap POST failed (${res.status}): ${txt}`);
  }

  return res.json();
}


// ---- Gene Finder ----
export async function searchKnowledge(species, phenotype) {
  if (!phenotype || phenotype.trim() === "") {
    return { results: [] };  // Avoid empty queries breaking backend
  }



  const url = `${API}/api/${encodeURIComponent(species)}/find_genes?phenotype=${encodeURIComponent(phenotype)}`;

  const r = await fetch(url);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  }
  return r.json();
}
