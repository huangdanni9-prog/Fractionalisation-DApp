import React from 'react';
import PropTypes from 'prop-types';

export default function KPIChips({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Key performance indicators">
      {items.map(({ label, value }) => (
        <li key={label} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/90">
          <span className="text-white/60">{label}:</span> <span className="ml-1 font-medium">{value}</span>
        </li>
      ))}
    </ul>
  );
}

KPIChips.propTypes = {
  items: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, value: PropTypes.string })),
};
