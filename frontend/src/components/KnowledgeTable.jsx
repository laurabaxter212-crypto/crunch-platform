// frontend/src/components/KnowledgeTable.jsx
import { useState, useMemo } from "react";

export default function KnowledgeTable({ results }) {
  const [visibleCols, setVisibleCols] = useState({
    symbol: true,
    loc_id: true,
    source: true,
    pmid: true,
    evidence: true,
  });

  const [sortConfig, setSortConfig] = useState({
    key: "symbol",
    direction: "asc",
  });

  function toggleColumn(col) {
    setVisibleCols((prev) => ({ ...prev, [col]: !prev[col] }));
  }

  function sortBy(key) {
    setSortConfig((prev) => {
      const direction =
        prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  }

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    sorted.sort((a, b) => {
      let x = a[sortConfig.key];
      let y = b[sortConfig.key];
      if (x === null) x = "";
      if (y === null) y = "";
      if (typeof x === "string") x = x.toLowerCase();
      if (typeof y === "string") y = y.toLowerCase();
      if (x < y) return sortConfig.direction === "asc" ? -1 : 1;
      if (x > y) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [results, sortConfig]);

  const columns = [
    { key: "symbol", label: "Gene Symbol" },
    { key: "loc_id", label: "LOC ID" },
    { key: "source", label: "Source" },
    { key: "pmid", label: "PMID" },
    { key: "evidence", label: "Evidence" },
  ];

  return (
    <div className="space-y-4">

      {/* --- Column toggles --- */}
      <div className="flex flex-wrap gap-3 p-3 border rounded-lg bg-gray-50">
        {columns.map((col) => (
          <label key={col.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={visibleCols[col.key]}
              onChange={() => toggleColumn(col.key)}
            />
            <span className="text-sm">{col.label}</span>
          </label>
        ))}
      </div>

      {/* --- Table --- */}
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              {columns.map(
                (col) =>
                  visibleCols[col.key] && (
                    <th
                      key={col.key}
                      onClick={() => sortBy(col.key)}
                      className="px-4 py-2 text-left text-sm font-semibold cursor-pointer hover:bg-gray-200"
                    >
                      {col.label}
                      {sortConfig.key === col.key &&
                        (sortConfig.direction === "asc" ? " ▲" : " ▼")}
                    </th>
                  )
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {sortedResults.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {visibleCols.symbol && (
                  <td className="px-4 py-2 font-medium">{row.symbol}</td>
                )}
                {visibleCols.loc_id && (
                  <td className="px-4 py-2">
                    {row.loc_id || <span className="text-gray-400">—</span>}
                  </td>
                )}
                {visibleCols.source && (
                  <td className="px-4 py-2 capitalize">{row.source}</td>
                )}
                {visibleCols.pmid && (
                  <td className="px-4 py-2">
                    {row.pmid ? (
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${row.pmid}`}
                        target="_blank"
                        className="text-blue-600 underline"
                      >
                        {row.pmid}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                )}
                {visibleCols.evidence && (
                  <td className="px-4 py-2 text-sm text-gray-700">
                    {row.evidence}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

