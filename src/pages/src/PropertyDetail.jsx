import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import HeroGallery from './components/HeroGallery';
import PriceChart from './components/PriceChart';
import KPIChips from './components/KPIChips';
import OwnershipPie from './components/OwnershipPie';
import PriceCard from './components/PriceCard';
import OrderBookDepthChart from './components/OrderBookDepthChart';
import AppHeader from './components/AppHeader';
import { web3Client } from './web3/client';
import { ethers } from 'ethers';

const BG = '#050721';

function resolveIpfs(url) {
  if (!url) return url;
  if (typeof url !== 'string') return url;
  if (url.startsWith('ipfs://')) {
    const path = url.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${path}`;
  }
  return url;
}

async function fetchJson(uri) {
  try {
    const res = await fetch(resolveIpfs(uri));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

function attr(obj, key) {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const attrs = Array.isArray(obj.attributes) ? obj.attributes : [];
  const hit = attrs.find(a => (a.trait_type || a.type || a.key) === key || (a.trait_type || '').toLowerCase() === key.toLowerCase());
  return hit ? (hit.value ?? hit.val ?? hit.content) : undefined;
}

function useProperty(propertyId) {
  return useQuery({
    queryKey: ['property', propertyId],
    queryFn: async () => {
      try {
        await web3Client.connect();
        const arr = await web3Client.getProperties(0, 200);
        const hit = arr.find((p) => String(p.id) === String(propertyId));
        if (!hit) throw new Error('NOT_FOUND_ONCHAIN');
        // Fetch metadata JSON from metadataURI (supports ipfs://)
        const meta = hit.metadataURI ? await fetchJson(hit.metadataURI) : null;
        // Local cache fallback (for images/title/address) when metadata is minimal (non-IPFS path)
        const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
        const lp = localProps.find((p) => String(p.id) === String(hit.id));
        const title = (meta?.name || meta?.title || attr(meta, 'title') || lp?.title || `Property #${hit.id}`);
        const address = (meta?.address || attr(meta, 'address') || lp?.address || '');
        const imageMeta = resolveIpfs(meta?.image || attr(meta, 'image'));
        const images = Array.isArray(meta?.images)
          ? meta.images.map(resolveIpfs)
          : (lp?.images && lp.images.length ? lp.images : (imageMeta ? [imageMeta] : []));
        const image = images.length ? images[0] : (lp?.image || imageMeta || undefined);
        const rentalYield = Number(attr(meta, 'rentalYield') ?? meta?.rentalYield ?? '') || '';
        const annualReturn = Number(attr(meta, 'annualReturn') ?? meta?.annualReturn ?? '') || '';
        return {
          _source: 'onchain',
          ...hit,
          title,
          address,
          image,
          images,
          rentalYield,
          annualReturn,
        };
      } catch (_e) {
        // Fallback to local cache if chain not available or not found, but respect inactive/archived flags
        const local = JSON.parse(localStorage.getItem('properties') || '[]');
        const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
        const lp = local.find((p) => String(p.id) === String(propertyId) && p?.active !== false && !archivedIds.includes(p.id));
        return lp ? { _source: 'local', ...lp } : undefined;
      }
    },
    staleTime: 60_000,
  });
}

export default function PropertyDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { data: prop, isLoading, refetch } = useProperty(id);
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [asks, setAsks] = useState([]);
  const [quickQty, setQuickQty] = useState(1);
  const [tab, setTab] = useState('price'); // price | depth

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    setUser(userStr ? JSON.parse(userStr) : null);
  }, []);

  // Load best 5 asks for this property
  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const top = await web3Client.getOrderBookAsks(id, 5);
        setAsks(top);
      } catch { setAsks([]); }
    })();
  }, [id]);

  const images = useMemo(() => {
    if (Array.isArray(prop?.images) && prop.images.length > 0) return prop.images;
    const img = prop?.image;
    if (img) return [img];
    // Fallback if metadata has no image
    const seed = Number(prop?.id || 1) % 10;
    return [
      `https://picsum.photos/seed/${seed + 1}/1200/800`,
      `https://picsum.photos/seed/${seed + 2}/1200/800`,
      `https://picsum.photos/seed/${seed + 3}/1200/800`,
    ];
  }, [prop?.images, prop?.image, prop?.id]);

  // Documents replaced by ownership chart

  const kpis = [
    { label: 'Rental Yield', value: prop?.rentalYield ? `${prop.rentalYield}%` : '—' },
    { label: 'Projected Return', value: prop?.annualReturn ? `${prop.annualReturn}%` : '—' },
  ];

  const doRefresh = async () => {
    setMsg('Refreshing from chain...');
    try {
      await queryClient.invalidateQueries({ queryKey: ['property', id] });
      await refetch();
      setMsg('');
    } catch (e) {
      setMsg(e?.reason || e?.message || 'Refresh failed');
    }
  };

  const clearCacheAndRefresh = async () => {
    localStorage.removeItem('properties');
    await doRefresh();
  };

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <AppHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 pb-10">
        <div className="pt-4">
          <HeroGallery images={images} alt={`${prop?.title || 'Property'} gallery`} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <header className="mb-4">
              <div className="inline-flex items-center rounded-full border border-white/20 px-3 py-1 text-sm text-white/80">
                {prop?.active ? 'Active' : 'Coming Soon'}
              </div>
              {prop?._source && (
                <span className="ml-2 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
                  Source: {prop._source === 'onchain' ? 'on-chain' : 'local cache'}
                </span>
              )}
              <h1 className="mt-3 text-4xl font-bold text-white">{prop?.title || `Property #${id}`}</h1>
              <p className="text-white/70">{prop?.address || '—'}</p>
              <a href="#reviews" className="mt-2 inline-block text-sm text-white underline underline-offset-4">Co-Owner Reviews</a>
              <KPIChips items={kpis} />
            </header>

            <div className="rounded-2xl bg-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-white/80 text-sm">Chart</div>
                <div className="space-x-2">
                  <button className={`px-2 py-1 rounded ${tab==='price'?'bg-white/10 text-white':'text-white/70'}`} onClick={() => setTab('price')}>Price</button>
                  <button className={`px-2 py-1 rounded ${tab==='depth'?'bg-white/10 text-white':'text-white/70'}`} onClick={() => setTab('depth')}>Depth</button>
                </div>
              </div>
              {tab === 'price' ? (
                <PriceChart propertyId={id} />
              ) : (
                <OrderBookDepthChart propertyId={id} />
              )}
            </div>

            <OwnershipPie property={prop} />
          </div>
          <div className="lg:col-span-1">
            <aside className="lg:sticky lg:top-24 space-y-4">
              {!isLoading && prop && (
                <PriceCard property={prop} onSuccess={() => { refetch(); }} />
              )}
              {/* Quick Buy card */}
              <div className="rounded-2xl bg-white/5 p-3 text-white/90">
              <div className="mb-2 font-medium">Quick Buy (Best Ask)</div>
              {!asks.length ? (
                <div className="text-sm text-white/60">No active listings.</div>
              ) : (
                (() => {
                  const best = asks[0];
                  const max = Number(best.amount || 0);
                  const qty = Math.max(1, Math.min(max, Number(quickQty) || 1));
                  const costEth = (Number(best.priceEth || 0) * qty).toFixed(6);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Best price</span>
                        <span className="font-medium">{best.priceEth} ETH</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Available</span>
                        <span>{best.amount}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Quantity</span>
                        <input
                          type="number"
                          min={1}
                          max={max}
                          step={1}
                          value={quickQty}
                          onChange={(e) => setQuickQty(e.target.value)}
                          className="w-20 rounded bg-white/10 text-white/90 px-2 py-1 text-right"
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Total</span>
                        <span className="font-medium">{costEth} ETH</span>
                      </div>
          <button
                        className="w-full mt-1 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={async () => {
                          try {
                            await web3Client.connect();
                            await web3Client.fillListing({ token: prop.token || prop.tokenAddress, listingId: best.listingId, amount: qty, pricePerShareWei: ethers.parseEther(String(best.priceEth)) });
                            setMsg(`Bought ${qty} at ${best.priceEth} ETH`);
                            const top = await web3Client.getOrderBookAsks(id, 5);
                            setAsks(top);
                            await refetch();
                          } catch (e) {
                            setMsg(e?.reason || e?.message || 'Quick buy failed');
                          }
                        }}
                      >Buy from best ask</button>
                    </div>
                  );
                })()
              )}
        </div>
        {/* Order book: best 5 asks */}
        <div className="rounded-2xl bg-white/5 p-3 text-white/90">
              <div className="mb-2 font-medium">Best 5 Asks</div>
              {!asks.length ? (
                <div className="text-sm text-white/60">No active listings.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-white/60">
                    <tr>
                      <th className="text-left py-1">Price (ETH)</th>
                      <th className="text-right py-1">Amount</th>
                      <th className="text-right py-1">Qty</th>
                      <th className="text-right py-1">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asks.map((a) => (
                      <OrderBookRow key={a.listingId} ask={a} prop={prop} onFilled={async () => {
                        const top = await web3Client.getOrderBookAsks(id, 5);
                        setAsks(top);
                        await refetch();
                      }} setMsg={setMsg} />
                    ))}
                  </tbody>
                </table>
              )}
              </div>
              {/* Sidebar controls */}
              <div className="rounded-2xl bg-white/5 p-3 text-white/90">
                <div className="grid grid-cols-2 gap-2">
                  <button className="px-3 py-2 rounded-lg border border-white/20 text-white/80" onClick={clearCacheAndRefresh}>Clear cache</button>
                  <button className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white" onClick={doRefresh}>Refresh</button>
                </div>
                {msg && <div className="mt-2 text-sm text-white/80">{msg}</div>}
              </div>
            </aside>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link to="/marketplace" className="text-white/70 underline">Back to Marketplace</Link>
        </div>
      </main>
    </div>
  );
}

function OrderBookRow({ ask, prop, onFilled, setMsg }) {
  const [qty, setQty] = useState(1);
  const max = Number(ask.amount || 0);
  const clampedQty = Math.max(1, Math.min(max, Number(qty) || 1));
  return (
    <tr className="border-t border-white/10">
      <td className="py-1">{ask.priceEth}</td>
      <td className="py-1 text-right">{ask.amount}</td>
      <td className="py-1 text-right">
        <input
          type="number"
          min={1}
          max={max}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-16 rounded bg-white/10 text-white/90 px-1 py-0.5 text-right"
        />
      </td>
      <td className="py-1 text-right">
        <button
          className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white"
          onClick={async () => {
            try {
              await web3Client.connect();
              await web3Client.fillListing({ token: prop.token || prop.tokenAddress, listingId: ask.listingId, amount: clampedQty, pricePerShareWei: ethers.parseEther(String(ask.priceEth)) });
              setMsg(`Filled ${clampedQty} @ ${ask.priceEth} ETH`);
              await onFilled?.();
            } catch (e) {
              setMsg(e?.reason || e?.message || 'Fill failed');
            }
          }}
        >Buy</button>
      </td>
    </tr>
  );
}
