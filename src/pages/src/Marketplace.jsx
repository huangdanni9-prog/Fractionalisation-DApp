import React, { useEffect, useState } from 'react';
import { savePropertiesSafe, getPropertiesSafe } from './utils/safeLocalStorage';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { web3Client } from './web3/client';
import AppHeader from './components/AppHeader';
import FiltersBar from './components/FiltersBar';
import ListingGrid from './components/ListingGrid';
// PropertyModal kept for potential future use, but we route to full detail now
// import PropertyModal from './components/PropertyModal';

function TradingPlatform({ properties, user, onBuy, onSell, tradeMsg }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [tradeShares, setTradeShares] = useState(1);
  const [sellPriceEth, setSellPriceEth] = useState('');
  const p = properties[selectedIdx] || {};
  const hasNumber = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !Number.isNaN(Number(v));
  const ry = hasNumber(p.rentalYield) ? `${Number(p.rentalYield)}` : '—';
  const ar = hasNumber(p.annualReturn) ? `${Number(p.annualReturn)}` : '—';
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-4 sticky top-24">
      <h3 className="text-violet-700 font-semibold mb-3">Trading Platform</h3>
      <label htmlFor="tradeProperty">Select Property:</label>
      <select
        id="tradeProperty"
        value={selectedIdx}
        onChange={e => setSelectedIdx(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 mb-3"
        disabled={!properties?.length}
      >
        {properties.map((p, i) => (
          <option value={i} key={i}>{p.title}</option>
        ))}
      </select>
      <div id="tradeDetails" className="mb-3 text-sm">
        <div><b>{p.title}</b></div>
        <div>{p.address}</div>
  <div>Rental Yield: <b>{ry}{ry !== '—' ? '%' : ''}</b></div>
  <div>Annual Return: <b>{ar}{ar !== '—' ? '%' : ''}</b></div>
        <div>Available Shares: <b>{p.availableShares}</b></div>
  <div>Share Price: <b>{p.sharePrice} ETH</b></div>
      </div>
      <input
        id="tradeShares"
        type="number"
        min="1"
        max={p?.availableShares || undefined}
        value={tradeShares}
        onChange={e => setTradeShares(Number(e.target.value))}
        placeholder="Number of shares"
        className="w-full px-3 py-2 rounded-lg border border-gray-200 mb-3"
      />
      <div className="mb-3">
        <label htmlFor="sellPrice" className="block text-sm mb-1">Sell price (ETH per share)</label>
        <input
          id="sellPrice"
          type="number"
          min="0"
          step="0.0001"
          value={sellPriceEth}
          onChange={e => setSellPriceEth(e.target.value)}
          placeholder={String(p?.sharePrice ?? '')}
          className="w-full px-3 py-2 rounded-lg border border-gray-200"
        />
        <p className="text-xs text-gray-500 mt-1">Leave empty to default to current share price.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button className="flex-1 px-4 py-2 rounded-lg bg-gray-100" onClick={() => onSell(selectedIdx, tradeShares, sellPriceEth)}>Sell Shares</button>
        <button className="flex-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white" onClick={() => onBuy(selectedIdx, tradeShares)}>Buy Shares</button>
      </div>
      <div id="tradeMsg" className="mt-3 text-brand-600 font-medium">{tradeMsg}</div>
    </div>
  );
}

export default function Marketplace() {
  const [user, setUser] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  // We no longer use the in-page modal; we route to /property/:id instead
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('all');
  const [sort, setSort] = useState('recent');
  const [price, setPrice] = useState('any');
  const [tradeMsg, setTradeMsg] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    setUser(userStr ? JSON.parse(userStr) : null);
    // Load properties from localStorage as UI metadata source
    const localProps = getPropertiesSafe();
    // Attach persisted gallery if missing
    let propImgMap = {};
    try { propImgMap = JSON.parse(localStorage.getItem('propertyImages') || '{}'); } catch {}
    const withImages = (localProps || []).map(lp => {
      if ((!lp.images || lp.images.length === 0) && propImgMap[String(lp.id)]) {
        const gallery = propImgMap[String(lp.id)];
        return { ...lp, image: gallery[0] || lp.image, images: gallery };
      }
      return lp;
    });
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  // Hide locally if archived OR explicitly inactive
  setProperties((withImages || []).filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && p?.active !== false));
    // Load from chain and merge
    (async () => {
      try {
        await web3Client.connect();
        const onchainAll = await web3Client.getProperties(0, 50);
        const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
        const isZero = (a) => !a || /^0x0{40}$/i.test(a);
        const onchain = (onchainAll || []).filter(cp => cp.active && !archivedIds.includes(cp.id) && !isZero(cp.tokenAddress || cp.token) && Number(cp.totalShares || 0) > 0);
        if (onchain && onchain.length) {
          // Load persistent gallery fallback map
          let propertyImages = {};
          try { propertyImages = JSON.parse(localStorage.getItem('propertyImages') || '{}'); } catch {}
          const merged = onchain.map(cp => {
            const lp = localProps.find(x => x.id === cp.id);
            const gallery = cp.images || lp?.images || propertyImages[String(cp.id)] || undefined;
            return {
              id: cp.id,
              tokenAddress: cp.tokenAddress || cp.token,
              onchainId: cp.id,
              totalShares: cp.totalShares,
              availableShares: cp.availableShares ?? lp?.availableShares ?? cp.totalShares,
        sharePrice: cp.sharePrice,
              active: cp.active,
              metadataURI: cp.metadataURI,
              archivedLocal: lp?.archivedLocal || false,
              title: cp.title || lp?.title || `Property #${cp.id}`,
              address: cp.address || lp?.address || '',
              image: (gallery && gallery[0]) || cp.image || lp?.image || '',
              images: gallery,
              rentalYield: (cp.rentalYield ?? undefined) !== undefined ? cp.rentalYield : (lp?.rentalYield ?? ''),
              annualReturn: (cp.annualReturn ?? undefined) !== undefined ? cp.annualReturn : (lp?.annualReturn ?? '')
            };
          }).filter(p => !p.archivedLocal);
          setProperties(merged);
          savePropertiesSafe(merged);
        }
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = properties.filter(p => {
    const q = query.trim().toLowerCase();
    const inQ = !q || (p.title||'').toLowerCase().includes(q) || (p.address||'').toLowerCase().includes(q);
    const priceNum = Number(p.sharePrice || 0);
    let inPrice = true;
    if (price !== 'any') {
      const [min, max] = price.split('-').map(Number);
      inPrice = priceNum >= min && priceNum <= max;
    }
    return inQ && inPrice;
  }).sort((a,b)=>{
    if (sort==='yield') return Number(b.rentalYield||0)-Number(a.rentalYield||0);
    if (sort==='return') return Number(b.annualReturn||0)-Number(a.annualReturn||0);
    if (sort==='price') return Number(a.sharePrice||0)-Number(b.sharePrice||0);
    return Number(b.id)-Number(a.id);
  });

  const navigate = useNavigate();
  const openDetail = (p)=>{ navigate(`/property/${p.id}`); };
  const showTradeMsg = msg => setTradeMsg(msg);

  const refreshFromChain = async () => {
    try {
      await web3Client.connect();
      const onchainAll = await web3Client.getProperties(0, 50);
      const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
      const isZero = (a) => !a || /^0x0{40}$/i.test(a);
      const onchain = (onchainAll || []).filter(cp => cp.active && !archivedIds.includes(cp.id) && !isZero(cp.tokenAddress || cp.token) && Number(cp.totalShares || 0) > 0);
      const localProps = getPropertiesSafe();
  let propertyImages = {};
      try { propertyImages = JSON.parse(localStorage.getItem('propertyImages') || '{}'); } catch {}
      const merged = onchain.map(cp => {
        const lp = localProps.find(x => x.id === cp.id);
        const gallery = cp.images || lp?.images || propertyImages[String(cp.id)] || undefined;
        return {
          id: cp.id,
          tokenAddress: cp.tokenAddress || cp.token,
          onchainId: cp.id,
          totalShares: cp.totalShares,
          availableShares: cp.availableShares ?? lp?.availableShares ?? cp.totalShares,
      sharePrice: cp.sharePrice,
          active: cp.active,
          metadataURI: cp.metadataURI,
          archivedLocal: lp?.archivedLocal || false,
          title: cp.title || lp?.title || `Property #${cp.id}`,
          address: cp.address || lp?.address || '',
          image: (gallery && gallery[0]) || cp.image || lp?.image || '',
          images: gallery,
          rentalYield: (cp.rentalYield ?? undefined) !== undefined ? cp.rentalYield : (lp?.rentalYield ?? ''),
          annualReturn: (cp.annualReturn ?? undefined) !== undefined ? cp.annualReturn : (lp?.annualReturn ?? '')
        };
      }).filter(p => !p.archivedLocal);
      setProperties(merged);
      savePropertiesSafe(merged);
      setTradeMsg('');
    } catch (e) {
      setTradeMsg(e?.reason || e?.message || 'Chain refresh failed.');
    }
  };

  const clearLocalCache = () => {
    localStorage.removeItem('properties');
    localStorage.removeItem('archivedPropertyIds');
    setTradeMsg('Local cache cleared. Click Refresh to pull from chain.');
  };

  const handleBuy = async (idx, shares) => {
    if (!shares || shares < 1) return showTradeMsg('Enter valid number of shares.');
    const p = filtered[idx];
    try {
      await web3Client.connect();
      await web3Client.buyShares({ propertyId: p.id || 0, token: p.tokenAddress || p.token, amount: shares, pricePerShareWei: ethers.parseEther(String(p.sharePrice || 0.001)) });
      showTradeMsg(`On-chain: Purchased ${shares} shares of ${p.title || `Property #${p.id}`}.`);
      await refreshFromChain();
    } catch (e) {
      console.error(e);
      showTradeMsg(e?.reason || e?.message || 'On-chain buy failed. Check wallet and config.');
    }
  };

  const handleSell = async (idx, shares, priceEth) => {
    if (!shares || shares < 1) return showTradeMsg('Enter valid number of shares.');
    const p = filtered[idx];
    try {
      await web3Client.connect();
      const price = Number(priceEth);
      const useEth = Number.isFinite(price) && price > 0 ? price : Number(p.sharePrice || 0.001);
      await web3Client.createListing({ token: p.tokenAddress || p.token, propertyId: p.id || 0, amount: shares, pricePerShareWei: ethers.parseEther(String(useEth)) });
      showTradeMsg(`Listed ${shares} shares of ${p.title || `Property #${p.id}`}.`);
      await refreshFromChain();
    } catch (e) {
      console.error(e);
      showTradeMsg(e?.reason || e?.message || 'On-chain sell failed.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <AppHeader user={user} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <FiltersBar
          query={query} setQuery={setQuery}
          location={location} setLocation={setLocation}
          sort={sort} setSort={setSort}
          price={price} setPrice={setPrice}
        />
        <div className="flex items-center justify-end gap-2 mb-3">
          <button className="px-3 py-2 rounded-lg border" onClick={clearLocalCache}>Clear local cache</button>
          <button className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white" onClick={refreshFromChain}>Refresh (on-chain)</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ListingGrid properties={filtered} loading={loading} onOpen={openDetail} />
          </div>
          <div className="lg:col-span-1">
            <TradingPlatform
              properties={filtered}
              user={user}
              onBuy={handleBuy}
              onSell={handleSell}
              tradeMsg={tradeMsg}
            />
          </div>
        </div>
      </main>
  {/* Modal removed in favor of dedicated route */}
    </div>
  );
}
