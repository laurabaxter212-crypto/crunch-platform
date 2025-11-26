// frontend/src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { pingBackend } from "../api";
import myImage from '../images/crunch.png';
export default function Home() {
  const [status, setStatus] = useState("checking...");
  useEffect(() => {
    pingBackend().then(d => setStatus(d.message)).catch(() => setStatus("Cannot reach backend"));
  }, []);
  return (
    <div style={{ padding: 16 }}>
    <img src={myImage} alt="CRUNCH Logo" style={{ maxWidth: '200px' }} /> 

      <h1>Vegetable SNP Explorer</h1>
      <p>Welcome to CRUNCH, the SNP analysis platform.</p>
      <p><strong>Backend status:</strong> {status}</p>
      <p>Use <em>Find genes</em> to locate candidate genes from literature/databases. Use <em>Run analysis</em> to compute accession similarity and PCA/MDS plots.</p>
    </div>
  );
}

