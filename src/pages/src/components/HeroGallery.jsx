import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

// A simple, accessible hero gallery/carousel
export default function HeroGallery({ images, alt, className = '' }) {
  const [idx, setIdx] = useState(0);
  const total = images?.length || 0;
  const containerRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (!containerRef.current) return;
      const el = containerRef.current;
      if (!el.contains(document.activeElement)) return;
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + total) % total);
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  if (!images || images.length === 0) return null;

  return (
    <section
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-xl ${className}`}
      aria-roledescription="carousel"
      aria-label="Property photo gallery"
    >
      <img
        src={images[idx]}
        alt={alt || `Property image ${idx + 1} of ${total}`}
        className="w-full h-64 md:h-80 lg:h-96 object-cover"
      />
      {total > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2" aria-hidden>
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`h-2 w-2 rounded-full ${i === idx ? 'bg-white' : 'bg-white/50'}`}
              tabIndex={-1}
            />
          ))}
        </div>
      )}
      <div className="absolute inset-y-0 left-0 flex items-center">
        <button
          aria-label="Previous photo"
          onClick={() => setIdx((i) => (i - 1 + total) % total)}
          className="m-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white"
        >
          ‹
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex items-center">
        <button
          aria-label="Next photo"
          onClick={() => setIdx((i) => (i + 1) % total)}
          className="m-2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white"
        >
          ›
        </button>
      </div>
    </section>
  );
}

HeroGallery.propTypes = {
  images: PropTypes.arrayOf(PropTypes.string),
  alt: PropTypes.string,
  className: PropTypes.string,
};
