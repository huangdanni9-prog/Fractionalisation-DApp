import React, { useEffect, useMemo, useRef, useState } from 'react';

// Simple responsive carousel with autoplay and controls
// Props:
// - items: ReactNode[]
// - autoPlay: boolean (default true)
// - interval: number ms (default 3000)
// - breakpoints: array of { width: number, slides: number } sorted asc by width
//   example: [ { width: 0, slides: 1 }, { width: 768, slides: 2 }, { width: 1024, slides: 3 } ]

export default function Carousel({
  items = [],
  autoPlay = true,
  interval = 3000,
  breakpoints = [ { width: 0, slides: 1 }, { width: 768, slides: 2 }, { width: 1024, slides: 3 } ]
}) {
  const [slidesToShow, setSlidesToShow] = useState(3);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resizeRef = useRef(null);

  const maxIndex = useMemo(() => {
    const m = Math.max(0, items.length - slidesToShow);
    return m;
  }, [items.length, slidesToShow]);

  useEffect(() => {
    const compute = () => {
      try {
        const w = window.innerWidth || 0;
        let s = 1;
        for (const bp of breakpoints) {
          if (w >= bp.width) s = bp.slides;
        }
        setSlidesToShow(Math.max(1, Math.min(4, s)));
      } catch { setSlidesToShow(1); }
    };
    compute();
    const handler = () => compute();
    window.addEventListener('resize', handler);
    resizeRef.current = handler;
    return () => { try { window.removeEventListener('resize', handler); } catch {} };
  }, [breakpoints]);

  // Keep index within bounds if slidesToShow or items change
  useEffect(() => {
    if (index > maxIndex) setIndex(0);
  }, [maxIndex]);

  useEffect(() => {
    if (!autoPlay) return;
    if (items.length <= slidesToShow) return;
    if (paused) return;
    const id = setInterval(() => {
      setIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
    }, Math.max(1500, interval));
    return () => clearInterval(id);
  }, [autoPlay, interval, items.length, slidesToShow, paused, maxIndex]);

  const slideWidthPct = 100 / slidesToShow;
  const translatePct = Math.min(index, maxIndex) * slideWidthPct;

  if (!items || items.length === 0) return null;

  const showControls = items.length > slidesToShow;

  return (
    <div className="carousel-root" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="carousel-viewport" style={{ overflow: 'hidden', position: 'relative' }}>
        <div
          className="carousel-track"
          style={{
            display: 'flex',
            gap: 16,
            transform: `translateX(-${translatePct}%)`,
            transition: 'transform 500ms ease',
            willChange: 'transform',
            padding: '4px'
          }}
        >
          {items.map((node, i) => (
            <div key={i} style={{ flex: `0 0 ${slideWidthPct}%` }}>
              {node}
            </div>
          ))}
        </div>
        {showControls && (
          <>
            <button
              aria-label="Previous"
              className="carousel-prev"
              onClick={() => setIndex(prev => (prev <= 0 ? maxIndex : prev - 1))}
              style={btnStyle('left')}
            >
              ‹
            </button>
            <button
              aria-label="Next"
              className="carousel-next"
              onClick={() => setIndex(prev => (prev >= maxIndex ? 0 : prev + 1))}
              style={btnStyle('right')}
            >
              ›
            </button>
          </>
        )}
      </div>
      {showControls && (
        <div className="carousel-dots" style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={`dot-${i}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i === Math.min(index, maxIndex) ? '#4636e3' : '#e5e7eb',
                border: 'none', cursor: 'pointer'
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function btnStyle(side) {
  const base = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    background: 'rgba(70,54,227,0.85)', color: '#fff', border: 'none',
    width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
    display: 'grid', placeItems: 'center'
  };
  return { ...base, [side]: 8 };
}
