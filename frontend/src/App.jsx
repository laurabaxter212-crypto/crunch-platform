// frontend/src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import Home from "./pages/Home";
import GeneFinder from "./pages/GeneFinder";
import Analysis from "./pages/Analysis.jsx";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: 12 }}>
        <nav style={{ marginBottom: 12 }}>
          <Link to="/">Home</Link> {" | "}
          <Link to="/genes">Find genes</Link> {" | "}
          <Link to="/analysis">Run analysis</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/genes" element={<GeneFinder />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

