import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { ethers } from 'ethers';
import { web3Client } from '../web3/client';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function OwnershipPie({ property }) {
  const [data, setData] = useState({ you: 0, owner: 0, listed: 0, others: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [holdersOpen, setHoldersOpen] = useState(false);
  const [holders, setHolders] = useState([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [holdersError, setHoldersError] = useState('');

  useEffect(() => {
    (async () => {
      if (!property) return;
      setLoading(true);
      setError('');
      try {
        await web3Client.connect();
        const provider = web3Client.provider;
        const marketplace = web3Client.marketplace;
        const token = property.token || property.tokenAddress;
        const ownerAddr = property.propertyOwner;
        const account = await web3Client.getAccount();

        const erc20Abi = [
          { inputs: [{ internalType: 'address', name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
          { inputs: [], name: 'totalSupply', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
        ];
        const c = new ethers.Contract(token, erc20Abi, provider);
        const [totalSupplyBn, ownerBalBn, userBalBn] = await Promise.all([
          c.totalSupply(),
          ownerAddr ? c.balanceOf(ownerAddr) : Promise.resolve(0n),
          account ? c.balanceOf(account) : Promise.resolve(0n),
        ]);
        // activeListedSupply from marketplace (lite read)
        let listedBn = 0n;
        try {
          const liteAbi = [
            { inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], name: 'activeListedSupply', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
          ];
          const mkt = new ethers.Contract(await marketplace.getAddress(), liteAbi, provider);
          listedBn = await mkt.activeListedSupply(Number(property.id));
        } catch {}

        const total = Number(totalSupplyBn);
        let you = Number(userBalBn);
        let owner = Number(ownerBalBn);
        const listed = Number(listedBn);

        // Avoid double counting if user is owner
        if (account && ownerAddr && account.toLowerCase() === ownerAddr.toLowerCase()) {
          owner = Math.max(0, owner - you);
        }
        let others = total - you - owner - listed;
        if (!Number.isFinite(others)) others = 0;
        others = Math.max(0, others);

        setData({ you, owner, listed, others, total });
      } catch (e) {
        setError(e?.message || 'Failed to load ownership');
        setData({ you: 0, owner: 0, listed: 0, others: 0, total: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [property?.id, property?.token, property?.tokenAddress, property?.propertyOwner]);

  const chart = useMemo(() => {
    const slices = [];
    const labels = [];
    const colors = [];
    const push = (label, value, color) => { if (value > 0) { labels.push(label); slices.push(value); colors.push(color); } };
    push('You', data.you, '#6D47FF');
    push('Owner', data.owner, '#A78BFA');
    push('Listed (escrow)', data.listed, '#F59E0B');
    push('Others', data.others, '#10B981');
    return {
      data: { labels, datasets: [{ data: slices, backgroundColor: colors, borderWidth: 0 }] },
      empty: slices.length === 0,
    };
  }, [data]);

  return (
    <section aria-label="Ownership distribution" className="rounded-2xl bg-white/5 p-4 text-white/90">
      <h3 className="text-white text-lg font-semibold mb-2">Ownership distribution</h3>
      {loading ? (
        <div className="h-40 w-full animate-pulse rounded-lg bg-white/5" />
      ) : error ? (
        <div className="text-sm text-red-400">{error}</div>
      ) : chart.empty ? (
        <div className="text-sm text-white/60">No ownership data.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <Doughnut data={chart.data} options={{ plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)' } } } }} />
          <div className="space-y-2 text-sm">
            <div>Total shares: <span className="font-semibold">{data.total}</span></div>
            {data.you > 0 && (
              <div>
                You: <span className="font-semibold">{data.you}</span>
                <span className="ml-2 text-white/60">({pct(data.you, data.total)}%)</span>
              </div>
            )}
            {data.owner > 0 && (
              <div>
                Owner: <span className="font-semibold">{data.owner}</span>
                <span className="ml-2 text-white/60">({pct(data.owner, data.total)}%)</span>
              </div>
            )}
            {data.listed > 0 && (
              <div>
                Listed (escrow): <span className="font-semibold">{data.listed}</span>
                <span className="ml-2 text-white/60">({pct(data.listed, data.total)}%)</span>
              </div>
            )}
            {data.others > 0 && (
              <div>
                Others: <span className="font-semibold">{data.others}</span>
                <span className="ml-2 text-white/60">({pct(data.others, data.total)}%)</span>
              </div>
            )}
            <div className="pt-1">
              <button
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={async () => {
                  setHoldersOpen(true);
                  setHoldersError('');
                  setHoldersLoading(true);
                  try {
                    const list = await loadTopHolders(property, 10);
                    setHolders(list);
                  } catch (e) {
                    setHoldersError(e?.message || 'Failed to load holders');
                    setHolders([]);
                  } finally {
                    setHoldersLoading(false);
                  }
                }}
              >View holders</button>
            </div>
          </div>
        </div>
      )}

      {holdersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setHoldersOpen(false)} />
          <div className="relative z-10 w-[min(640px,95vw)] rounded-2xl bg-[#0B0E1A] text-white p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold">Top holders</h4>
              <button className="px-2 py-1 rounded bg-white/10 hover:bg-white/20" onClick={() => setHoldersOpen(false)}>Close</button>
            </div>
            {holdersLoading ? (
              <div className="h-32 w-full animate-pulse rounded-lg bg-white/5" />
            ) : holdersError ? (
              <div className="text-sm text-red-400">{holdersError}</div>
            ) : holders.length === 0 ? (
              <div className="text-sm text-white/70">No holder data.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-white/60">
                    <tr>
                      <th className="text-left py-1">Address</th>
                      <th className="text-right py-1">Shares</th>
                      <th className="text-right py-1">% of supply</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map((h, i) => (
                      <tr key={i} className="border-t border-white/10">
                        <td className="py-1">{shortAddr(h.address)}</td>
                        <td className="py-1 text-right">{h.amount}</td>
                        <td className="py-1 text-right">{h.percent.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

OwnershipPie.propTypes = {
  property: PropTypes.object,
};

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function shortAddr(a) {
  if (!a) return '-';
  return a.slice(0, 6) + '...' + a.slice(-4);
}

async function loadTopHolders(property, limit = 10) {
  await web3Client.connect();
  const provider = web3Client.provider;
  const token = property.token || property.tokenAddress;
  const erc20Abi = [
    { anonymous: false, inputs: [
      { indexed: true, internalType: 'address', name: 'from', type: 'address' },
      { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' }], name: 'Transfer', type: 'event' },
  ];
  const c = new ethers.Contract(token, erc20Abi, provider);
  const latest = Number(await provider.getBlockNumber());
  const fromBlock = 0;
  const toBlock = latest;
  const events = await c.queryFilter(c.filters.Transfer(), fromBlock, toBlock);
  const map = new Map();
  const add = (addr, delta) => {
    if (!addr) return;
    const key = addr.toLowerCase();
    const prev = map.get(key) || 0n;
    map.set(key, prev + delta);
  };
  const ZERO = '0x0000000000000000000000000000000000000000';
  for (const e of events) {
    const from = e.args[0];
    const to = e.args[1];
    const val = BigInt(e.args[2].toString());
    if (from && from !== ZERO) add(from, -val);
    if (to && to !== ZERO) add(to, val);
  }
  // Convert, filter >0, sort by amount desc
  const total = Array.from(map.values()).reduce((a, b) => a + (b > 0n ? b : 0n), 0n);
  const list = Array.from(map.entries())
    .map(([addr, bi]) => ({ address: addr, amountBi: bi }))
    .filter(x => x.amountBi > 0n)
    .sort((a, b) => (b.amountBi > a.amountBi ? 1 : -1))
    .slice(0, limit)
    .map(x => ({
      address: x.address,
      amount: x.amountBi.toString(),
      percent: total > 0n ? Number((x.amountBi * 10000n) / total) / 100 : 0,
    }));
  return list;
}
