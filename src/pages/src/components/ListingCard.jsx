import React, { useEffect, useMemo, useState } from 'react';
import { resolveIpfsUrlToHttp } from '../web3/ipfs';

export default function ListingCard({ p, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  let imgsRaw = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
  // Last-resort: pull from persisted map if missing
  if (!imgsRaw || imgsRaw.length === 0) {
    try {
      const map = JSON.parse(localStorage.getItem('propertyImages') || '{}');
      const fallback = map?.[String(p.id)];
      if (Array.isArray(fallback) && fallback.length) imgsRaw = fallback;
    } catch {}
  }
  // Normalize image URLs: resolve ipfs:// and keep data: as-is
  const imgs = useMemo(() => (imgsRaw || []).map(u => resolveIpfsUrlToHttp(u)), [imgsRaw]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setLoaded(false); }, [idx]);
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
      <div className="relative h-44 w-full bg-gray-100 select-none">
        {!loaded && <div className="absolute inset-0 animate-pulse bg-gray-200" />}
        {imgs.length > 0 && (
          <img
            src={imgs[idx]}
            alt={p.title || `Property #${p.id}`}
            loading="lazy"
            onLoad={()=>setLoaded(true)}
            onError={(e)=>{
              // Fallback: if IPFS gateway has issues, try a secondary public gateway
              try {
                const el = e.currentTarget;
                const src = String(el?.src || '');
                if (src.includes('/ipfs/')) {
                  const alt = src.replace('https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/');
                  if (alt !== src) el.src = alt;
                }
              } catch {}
            }}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute top-3 left-3 bg-brand-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
          RECENT LISTING
        </div>
        {imgs.length > 1 && (
          <>
            <div className="absolute inset-y-0 left-0 flex items-center">
              <button
                aria-label="Previous image"
                onClick={(e)=>{ e.stopPropagation(); setIdx(i => (i - 1 + imgs.length) % imgs.length); }}
                className="m-2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white"
              >
                ‹
              </button>
            </div>
            <div className="absolute inset-y-0 right-0 flex items-center">
              <button
                aria-label="Next image"
                onClick={(e)=>{ e.stopPropagation(); setIdx(i => (i + 1) % imgs.length); }}
                className="m-2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white"
              >
                ›
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden>
              {imgs.map((_, i) => (
                <button
                  key={i}
                  onClick={(e)=>{ e.stopPropagation(); setIdx(i); }}
                  className={`h-1.5 w-1.5 rounded-full ${i === idx ? 'bg-white' : 'bg-white/50'}`}
                  tabIndex={-1}
                />
              ))}
            </div>
          </>
        )}
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
