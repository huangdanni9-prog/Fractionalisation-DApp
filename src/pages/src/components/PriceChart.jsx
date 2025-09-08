import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  TimeScale,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, TimeScale);

// Mock price history fetcher
async function fetchPriceHistory({ propertyId, range }) {
  // Create deterministic mock data per propertyId+range
  const now = Date.now();
  const ranges = { '1D': 24, '7D': 7 * 24, '30D': 30, '90D': 90, '1Y': 12, All: 60 };
  const points = ranges[range] || 30;
  const data = [];
  let base = 45 + (Number(propertyId) % 5);
  for (let i = points - 1; i >= 0; i--) {
    const t = now - i * (range === '1D' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
    base += (Math.sin(i / 3) + Math.cos(i / 5)) * 0.2;
    data.push({ t, price: Math.max(38, Math.min(52, base)) });
  }
  return data;
}

export default function PriceChart({ propertyId }) {
  const [range, setRange] = useState('30D');
  const { data = [], isLoading } = useQuery({
    queryKey: ['priceHistory', propertyId, range],
    queryFn: () => fetchPriceHistory({ propertyId, range }),
    staleTime: 1000 * 60,
  });

  const chartData = useMemo(() => ({
    labels: data.map((d) => new Date(d.t).toLocaleDateString()),
    datasets: [
      {
        label: 'Price per token',
        data: data.map((d) => d.price),
        fill: true,
        tension: 0.35,
        borderColor: '#6D47FF',
        backgroundColor: 'rgba(109, 71, 255, 0.15)',
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  }), [data]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`,
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 6 } },
      y: { ticks: { callback: (v) => `$${Number(v).toFixed(0)}` } },
    },
  }), []);

  const ranges = ['1D', '7D', '30D', '90D', '1Y', 'All'];

  return (
    <section aria-label="Price per token">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-xl font-semibold">Price per token</h3>
        <nav className="flex gap-2" aria-label="Select time range">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-full text-sm ${range === r ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white/90'}`}
              aria-pressed={range === r}
            >
              {r}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-4 h-60 md:h-72 lg:h-80">
        {isLoading ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-white/5" aria-busy="true" />
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </section>
  );
}

PriceChart.propTypes = {
  propertyId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};
