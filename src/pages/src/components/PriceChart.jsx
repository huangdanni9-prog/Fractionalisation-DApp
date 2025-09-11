import React, { useEffect, useMemo, useState } from 'react';
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
  BarElement,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { web3Client } from '../web3/client';
import { ethers } from 'ethers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, TimeScale, BarElement);

// On-chain price history fetcher (ETH per token)
async function fetchPriceHistory({ propertyId, range }) {
  await web3Client.connect();
  const provider = web3Client.provider;
  const marketplace = web3Client.marketplace;
  // Prepare lite reader for listings(propertyId, price)
  let mktLite = null;
  try {
    const mktAddr = await marketplace.getAddress();
    const liteAbi = [
      {
        inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        name: 'listings',
        outputs: [
          { internalType: 'uint256', name: 'propertyId', type: 'uint256' },
          { internalType: 'address', name: 'seller', type: 'address' },
          { internalType: 'uint256', name: 'amount', type: 'uint256' },
          { internalType: 'uint256', name: 'pricePerShareWei', type: 'uint256' },
          { internalType: 'bool', name: 'active', type: 'bool' }
        ],
        stateMutability: 'view',
        type: 'function'
      }
    ];
  mktLite = new ethers.Contract(mktAddr, liteAbi, provider);
  } catch {}
  const latestNum = await provider.getBlockNumber();
  const latest = Number(latestNum);
  // Approximate block window per range (safe for local dev; adjust for live nets as needed)
  const blockWindows = { '1D': 6000, '7D': 42000, '30D': 180000, '90D': 540000, '1Y': 2000000, 'All': latest };
  const delta = blockWindows[range] ?? 180000;
  const fromBlock = Math.max(0, latest - delta);
  const toBlock = latest;
  const pid = Number(propertyId);

  const points = [];
  // Primary purchases (price directly on event)
  try {
    const f = marketplace.filters.SharesPurchased(pid, null);
    const events = await marketplace.queryFilter(f, fromBlock, toBlock);
    for (const e of events) {
      const priceEth = Number(ethers.formatEther(e.args[3]?.toString() || '0'));
      const blk = await provider.getBlock(e.blockNumber);
      const t = blk?.timestamp ? Number(blk.timestamp) * 1000 : Date.now();
  const amount = Number(e.args[2]?.toString?.() || '0');
  points.push({ t, priceEth, amount });
    }
  } catch {}
  // Secondary fills (need to fetch listing price)
  try {
    const f = marketplace.filters.ListingFilled(null, null);
    const events = await marketplace.queryFilter(f, fromBlock, toBlock);
    for (const e of events) {
      const listingId = e.args[0];
      let lpid = undefined;
      let priceWei = '0';
      try {
        if (mktLite) {
          const listing = await mktLite.listings(listingId);
          lpid = listing?.propertyId?.toString?.() || listing?.[0]?.toString?.();
          priceWei = listing?.pricePerShareWei?.toString?.() || listing?.[3]?.toString?.() || '0';
        }
      } catch {}
      if (String(lpid) !== String(pid)) continue;
      const priceEth = Number(ethers.formatEther(priceWei));
      const blk = await provider.getBlock(e.blockNumber);
      const t = blk?.timestamp ? Number(blk.timestamp) * 1000 : Date.now();
  const amount = Number(e.args[2]?.toString?.() || '0');
  points.push({ t, priceEth, amount });
    }
  } catch {}

  // Sort by time and collapse multiple trades in same hour/day depending on range (simple average)
  points.sort((a, b) => a.t - b.t);
  if (!points.length) return [];

  // Simple grouping bucket: hour for 1D; day otherwise
  const bucketMs = range === '1D' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (const p of points) {
    const key = Math.floor(p.t / bucketMs) * bucketMs;
    const prev = buckets.get(key) || { t: key, sum: 0, vol: 0 };
    const vol = Number(p.amount || 1);
    prev.sum += (p.priceEth * vol);
    prev.vol += vol;
    buckets.set(key, prev);
  }
  return Array.from(buckets.values()).map(b => ({ t: b.t, priceEth: (b.vol > 0 ? (b.sum / b.vol) : 0), volume: b.vol }));
}

export default function PriceChart({ propertyId }) {
  const [range, setRange] = useState('1D');
  // Initialize range from URL (?range=1D|7D|...) and keep in sync
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('range');
      if (r && ['1D','7D','30D','90D','1Y','All'].includes(r)) setRange(r);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('range', range);
      const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    } catch {}
  }, [range]);
  const { data = [], isLoading } = useQuery({
    queryKey: ['priceHistory', propertyId, range],
    queryFn: () => fetchPriceHistory({ propertyId, range }),
    staleTime: 1000 * 60,
  });

  const chartData = useMemo(() => {
    const labelFormatter = (ts) => {
      const d = new Date(ts);
      return range === '1D' ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
    };
    // Base arrays
    const labels = data.map((d) => labelFormatter(d.t));
    const prices = data.map((d) => d.priceEth);
    const volumes = data.map((d) => d.volume || 0);
    // If only one point, add a synthetic next bucket to make a visible segment
    if (data.length === 1) {
      const stepMs = range === '1D' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const t2 = data[0].t + stepMs;
      labels.push(labelFormatter(t2));
      prices.push(data[0].priceEth);
      volumes.push(0);
    }
    return {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Volume (shares)',
          data: volumes,
          yAxisID: 'y1',
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 0,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
          order: 1,
        },
        {
          label: 'Price per token (ETH)',
          data: prices,
          type: 'line',
          yAxisID: 'y',
          fill: false,
          tension: 0.35,
          borderColor: '#FFFFFF',
          backgroundColor: 'rgba(109, 71, 255, 0.0)',
          pointRadius: prices.length <= 2 ? 3 : 0,
          pointHoverRadius: prices.length <= 2 ? 4 : 2,
          borderWidth: 3,
          order: 3,
        },
      ],
    };
  }, [data, range]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y;
            if (ctx.dataset.type === 'bar' || ctx.dataset.yAxisID === 'y1') {
              // volume
              return `Volume: ${Math.round(val)}`;
            }
            return `${Number(val).toFixed(6)} ETH`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 6 } },
      y: {
        type: 'linear',
        position: 'left',
        ticks: { callback: (v) => `${Number(v).toFixed(4)} ETH` },
        grid: { drawOnChartArea: true },
      },
      y1: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        grid: { drawOnChartArea: false },
        ticks: {
          callback: (v) => {
            const n = Number(v);
            if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
            if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
            return `${Math.round(n)}`;
          },
        },
      },
    },
  }), []);

  const ranges = ['1D', '7D', '30D', '90D', '1Y', 'All'];

  const lastPrice = data.length ? data[data.length - 1].priceEth : null;
  // Approximate 24h change by comparing against bucket ~24h ago if available
  let change24h = null;
  if (data.length > 1) {
    const lastT = data[data.length - 1].t;
    const target = lastT - 24*60*60*1000;
    let base = data[0].priceEth;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].t <= target) { base = data[i].priceEth; break; }
    }
    if (lastPrice != null && base != null && base !== 0) {
      change24h = ((lastPrice - base) / base) * 100;
    }
  }

  return (
    <section aria-label="Price per token">
      <div className="flex items-center justify-between">
  <div>
    <h3 className="text-white text-xl font-semibold">Price per token (ETH)</h3>
    <div className="text-white/80 text-sm">
      {lastPrice != null ? (
        <>
          <span>Last: {Number(lastPrice).toFixed(6)} ETH</span>
          {change24h != null && (
            <span className={`ml-3 ${change24h >= 0 ? 'text-green-300' : 'text-red-300'}`}>24h: {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%</span>
          )}
        </>
      ) : '—'}
    </div>
  </div>
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
