import React, { useState } from 'react';

export default function ListingCard({ p, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  const hasNumber = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !Number.isNaN(Number(v));
  const ry = hasNumber(p.rentalYield) ? `${Number(p.rentalYield)}` : '—';
  const ar = hasNumber(p.annualReturn) ? `${Number(p.annualReturn)}` : '—';
  return (
    <article
      tabIndex={0}
      role="button"
      aria-label={`Open details for ${p.title || `Property #${p.id}`}`}
      onClick={() => onOpen(p)}
      onKeyDown={(e)=>{ if(e.key==='Enter'||e.key===' ') { e.preventDefault(); onOpen(p);} }}
      className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-600 cursor-pointer"
    >
      <div className="relative h-44 w-full bg-gray-100">
        {!loaded && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
        <img
          src={p.image || ''}
          alt={p.title || `Property #${p.id}`}
          loading="lazy"
          onLoad={()=>setLoaded(true)}
          className="h-full w-full object-cover"
        />
        <div className="absolute top-3 left-3 bg-brand-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
          RECENT LISTING
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold text-gray-900">{p.title || `Property #${p.id}`}</h3>
        <p className="text-sm text-gray-600">{p.address || ''}</p>
        <div className="mt-2 text-sm">
          <div className="text-violet-700 font-semibold">{ry}{ry !== '—' ? '%' : ''} Rental Yield</div>
          <div className="text-brand-600">{ar}{ar !== '—' ? '%' : ''} Projected Annual Return</div>
        </div>
      </div>
      <div className="bg-violet-300/70 text-violet-900 text-sm font-medium px-4 py-2">
        Available: {p.availableShares ?? p.totalShares ?? 0} shares at {p.sharePrice ?? 0} ETH
      </div>
    </article>
  );
}
