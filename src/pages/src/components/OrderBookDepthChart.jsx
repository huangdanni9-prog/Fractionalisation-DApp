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
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { web3Client } from '../web3/client';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

export default function OrderBookDepthChart({ propertyId }) {
  const [asks, setAsks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await web3Client.connect();
        // Fetch up to 50 best asks for smoother curve
        const top = await web3Client.getOrderBookAsks(propertyId, 50);
        setAsks(top || []);
      } catch {
        setAsks([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [propertyId]);

  const { labels, data } = useMemo(() => {
    if (!asks?.length) return { labels: [], data: [] };
    const sorted = [...asks].sort((a, b) => a.priceEth - b.priceEth);
    let cum = 0;
    const labs = [];
    const vals = [];
    for (const a of sorted) {
      cum += Number(a.amount || 0);
      const price = Number(a.priceEth);
      labs.push(price.toFixed(6));
      vals.push(cum);
    }
    // If only one level, add a synthetic second point so the line is visible
    if (labs.length === 1) {
      const p = Number(labs[0]);
      labs.push((p + 0.000001).toFixed(6));
      vals.push(vals[0]);
    }
    return { labels: labs, data: vals };
  }, [asks]);

  const chart = useMemo(() => ({
    labels,
    datasets: [
      {
        label: 'Cumulative Ask Depth (shares)',
        data,
        stepped: 'before',
        type: 'line',
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(109,71,255,0.0)',
        fill: false,
        pointRadius: data.length <= 2 ? 3 : 0,
        pointHoverRadius: data.length <= 2 ? 4 : 2,
        tension: 0,
        borderWidth: 3,
      },
    ],
  }), [labels, data]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items?.[0]?.label ? `${items[0].label} ETH` : '',
          label: (ctx) => `Cumulative: ${Math.round(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Price (ETH)', color: '#fff' }, ticks: { maxTicksLimit: 6 } },
      y: { title: { display: true, text: 'Shares', color: '#fff' }, beginAtZero: true },
    },
  }), []);

  return (
    <div className="mt-4 h-60 md:h-72 lg:h-80">
      {loading ? (
        <div className="h-full w-full animate-pulse rounded-lg bg-white/5" aria-busy="true" />
      ) : labels.length ? (
        <Line data={chart} options={options} />
      ) : (
        <div className="text-white/70 text-sm">No active asks.</div>
      )}
    </div>
  );
}

OrderBookDepthChart.propTypes = {
  propertyId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};
