import React, { useState } from 'react';
import PropTypes from 'prop-types';

export default function DocumentsAccordion({ docs }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-6" aria-label="Documents">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-md bg-white/5 px-4 py-3 text-left text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">Documents</span>
          <span aria-hidden>{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && (
        <ul className="divide-y divide-white/10 rounded-b-md bg-white/5" role="list">
          {docs.map((d, i) => (
            <li key={i} className="flex items-center justify-between px-4 py-3">
              <div className="text-white/90">
                <p className="font-medium">{d.title}</p>
                <p className="text-sm text-white/60">PDF • {d.size || '120KB'}</p>
              </div>
              <a href={d.href} className="rounded-md bg-white px-3 py-1.5 text-sm text-[#050721] hover:bg-white/90" target="_blank" rel="noreferrer">
                View
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

DocumentsAccordion.propTypes = {
  docs: PropTypes.arrayOf(PropTypes.shape({ title: PropTypes.string, href: PropTypes.string, size: PropTypes.string })).isRequired,
};
