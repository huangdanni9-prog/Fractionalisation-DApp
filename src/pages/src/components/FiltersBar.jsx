import React, { useMemo } from 'react';

export default function FiltersBar({
  query, setQuery,
  location, setLocation,
  sort, setSort,
  price, setPrice
}) {
  const onKey = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  const ranges = useMemo(() => ([
    { label: 'Any', value: 'any' },
    { label: '≤ 0.01 ETH', value: '0-0.01' },
    { label: '0.01–0.05 ETH', value: '0.01-0.05' },
    { label: '≥ 0.05 ETH', value: '0.05-999' },
  ]), []);
  return (
    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white/70 backdrop-blur rounded-xl p-3 mb-5">
      <div className="relative flex-1">
        <input
          aria-label="Search address or city"
          placeholder="Search address or city"
          className="w-full rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-600"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
      <select aria-label="Filter by location" className="rounded-lg border border-gray-200 px-3 py-2" value={location} onChange={(e)=>setLocation(e.target.value)}>
        <option value="all">All Markets</option>
        <option value="my">My Holdings</option>
      </select>
      <select aria-label="Sort" className="rounded-lg border border-gray-200 px-3 py-2" value={sort} onChange={(e)=>setSort(e.target.value)}>
        <option value="recent">Recent</option>
        <option value="yield">Rental Yield</option>
        <option value="return">Annual Return</option>
        <option value="price">Share Price</option>
      </select>
      <select aria-label="Price range" className="rounded-lg border border-gray-200 px-3 py-2" value={price} onChange={(e)=>setPrice(e.target.value)}>
        {ranges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </div>
  );
}
