import React, { useEffect } from 'react';

export default function PropertyModal({ open, onClose, property }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open || !property) return null;
  return (
    <div aria-modal="true" role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[min(680px,92vw)] overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="h-56 bg-gray-100">
          <img src={property.image || ''} alt={property.title || `Property #${property.id}`} className="w-full h-full object-cover" />
        </div>
        <div className="p-5 space-y-2">
          <h2 className="text-xl font-semibold">{property.title || `Property #${property.id}`}</h2>
          <p className="text-gray-600">{property.address || ''}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Rental Yield</span><div className="font-semibold">{property.rentalYield ?? ''}{property.rentalYield !== undefined ? '%' : ''}</div></div>
            <div><span className="text-gray-500">Annual Return</span><div className="font-semibold">{property.annualReturn ?? ''}{property.annualReturn !== undefined ? '%' : ''}</div></div>
            <div><span className="text-gray-500">Available Shares</span><div className="font-semibold">{property.availableShares ?? property.totalShares ?? 0}</div></div>
            <div><span className="text-gray-500">Share Price</span><div className="font-semibold">{property.sharePrice ?? 0} ETH</div></div>
          </div>
        </div>
        <div className="px-5 pb-5 flex justify-end gap-3">
          <button className="px-4 py-2 rounded-lg border" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
