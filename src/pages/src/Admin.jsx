import React, { useEffect, useState } from 'react';
import './Admin.css';
import AppHeader from './components/AppHeader';
import { web3Client } from './web3/client';
import { hasIPFSConfig, uploadImageDataURLToIPFS, uploadJSONToIPFS, resolveIpfsUrlToHttp, getWeb3StorageToken, getNftStorageToken } from './web3/ipfs';
import { compressMany } from './utils/image';
import { ethers } from 'ethers';
import { savePropertiesSafe } from './utils/safeLocalStorage';

const Admin = () => {
  const [user, setUser] = useState(null);
  const [properties, setProperties] = useState([]);
  const [trades, setTrades] = useState([]);
  const [users, setUsers] = useState([]);
  const [ownership, setOwnership] = useState({ regOwner: null, mktOwner: null, mktAddr: null, regAddr: null, loading: false, fixMsg: '' });
  const [form, setForm] = useState({ title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', images: [] });
  const [propMsg, setPropMsg] = useState('');
  const [ipfsProgress, setIpfsProgress] = useState({ current: 0, total: 0 });
  const [previewImgs, setPreviewImgs] = useState([]);
  const [divForm, setDivForm] = useState({ propertyId: '', amountEth: '' });
  const [divMsg, setDivMsg] = useState('');
  const [editForm, setEditForm] = useState({ propertyId: '', title: '', address: '', sharePriceEth: '' });
  const [editMsg, setEditMsg] = useState('');
  const [ipfsTokenVal, setIpfsTokenVal] = useState('');
  const [ipfsProvider, setIpfsProvider] = useState('nft');
  const [deleteMsg, setDeleteMsg] = useState('');
  // Factory
  const [apps, setApps] = useState([]);
  const [appsMsg, setAppsMsg] = useState('');
  const [factoryAddr, setFactoryAddr] = useState('');

  useEffect(() => {
    const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
    const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    setProperties(localProps.filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.tokenAddress || p.onchainId)));
    setTrades(JSON.parse(localStorage.getItem('trades') || '[]'));
    setUsers(JSON.parse(localStorage.getItem('users') || '[]'));

    try {
      const nft = getNftStorageToken();
      const web3 = getWeb3StorageToken();
      if (nft) { setIpfsProvider('nft'); setIpfsTokenVal(nft); }
      else if (web3) { setIpfsProvider('web3'); setIpfsTokenVal(web3); }
    } catch {}

    (async () => {
      try {
        const info = await web3Client.connect();
        setUser({ address: info.account });
        const [regOwner, mktOwner, mktAddr, regAddr] = await Promise.all([
          web3Client.getRegistryOwner(),
          web3Client.getMarketplaceOwner(),
          web3Client.getMarketplaceAddress(),
          web3Client.getRegistryAddress(),
        ]);
        setOwnership(prev => ({ ...prev, regOwner, mktOwner, mktAddr, regAddr }));
        const chainPropsRaw = await web3Client.getProperties(0, 200);
        const isZero = (a) => !a || /^0x0{40}$/i.test(a);
        const chainProps = chainPropsRaw.filter(cp => cp.active && !isZero(cp.tokenAddress || cp.token) && Number(cp.totalShares || 0) > 0);
        const archived = localProps.filter(lp => lp.archivedLocal);
        let propImgMap = {};
        try { propImgMap = JSON.parse(localStorage.getItem('propertyImages') || '{}'); } catch {}
        const merged = chainProps.map(cp => {
          const lp = localProps.find(x => x.id === cp.id);
          const gallery = cp.images || lp?.images || propImgMap[String(cp.id)] || undefined;
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
        savePropertiesSafe([...merged, ...archived]);
        // Factory
        const faddr = await web3Client.getFactoryAddress();
        if (faddr) setFactoryAddr(faddr);
        const [acctAddr, owner] = await Promise.all([
          web3Client.getAccount(),
          web3Client.getMarketplaceOwner()
        ]);
        if (faddr && owner && acctAddr && owner.toLowerCase() === acctAddr.toLowerCase()) {
          const { items } = await web3Client.adminGetApplications(1, 200);
          setApps(items);
        }
      } catch {}
    })();
  }, []);

  const handleImagesUpload = e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const limited = files.slice(0, 5);
    Promise.all(limited.map(file => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = evt => resolve(evt.target.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    }))).then(urls => {
      const clean = urls.filter(Boolean);
      setForm(f => ({ ...f, images: clean.slice(0, 5) }));
      setPreviewImgs(clean.slice(0, 5));
    });
  };

  const handleFixOwnership = async () => {
    setOwnership(o => ({ ...o, loading: true, fixMsg: '' }));
    try {
      await web3Client.connect();
      const acct = await web3Client.getAccount();
      const regOwner = await web3Client.getRegistryOwner();
      if (!regOwner || regOwner.toLowerCase() !== acct.toLowerCase()) {
        setOwnership(o => ({ ...o, loading: false, fixMsg: `Switch to registry owner wallet: ${regOwner || 'unknown'}` }));
        return;
      }
      await web3Client.transferRegistryOwnershipToMarketplace();
      const [regOwner2, mktAddr2] = await Promise.all([
        web3Client.getRegistryOwner(),
        web3Client.getMarketplaceAddress(),
      ]);
      const ok = regOwner2 && mktAddr2 && regOwner2.toLowerCase() === mktAddr2.toLowerCase();
      setOwnership(o => ({ ...o, loading: false, regOwner: regOwner2, mktAddr: mktAddr2, fixMsg: ok ? 'Ownership fixed: Registry owned by Marketplace.' : 'Ownership not updated.' }));
    } catch (e) {
      setOwnership(o => ({ ...o, loading: false, fixMsg: e?.reason || e?.message || 'Failed to transfer ownership.' }));
    }
  };

  const handleCreateProperty = async () => {
    const { title, address, rentalYield, annualReturn, totalShares, sharePrice, images } = form;
    if (!title || !address || rentalYield === '' || annualReturn === '' || totalShares === '' || sharePrice === '' || !Array.isArray(images) || images.length === 0) {
      setPropMsg('Complete all fields and upload at least 1 image (up to 5).');
      return;
    }
    const nShares = Number(totalShares);
    const nPrice = Number(sharePrice);
    const nRY = Number(rentalYield);
    const nAR = Number(annualReturn);
    if (!Number.isFinite(nShares) || nShares <= 0) { setPropMsg('Total shares must be > 0.'); return; }
    if (!Number.isFinite(nPrice) || nPrice <= 0) { setPropMsg('Share price must be > 0.'); return; }
    if (!Number.isFinite(nRY) || nRY < 0 || !Number.isFinite(nAR) || nAR < 0) { setPropMsg('Yields must be >= 0.'); return; }

    try {
      await web3Client.connect();
      const acct = await web3Client.getAccount();
      const owner = await web3Client.getMarketplaceOwner();
      if (!owner || owner.toLowerCase() !== acct.toLowerCase()) { setPropMsg(`Only owner can create. Use ${owner || 'owner'}.`); return; }
      const [regOwner, mktAddr] = await Promise.all([ web3Client.getRegistryOwner(), web3Client.getMarketplaceAddress() ]);
      if (!regOwner || regOwner.toLowerCase() !== mktAddr.toLowerCase()) { setPropMsg('Registry not owned by Marketplace. Fix below.'); return; }

      setPropMsg('Uploading metadata...');
      const meta = {
        name: title,
        title,
        address,
        image: images[0],
        images: images.slice(0, 5),
        rentalYield: Number(rentalYield),
        annualReturn: Number(annualReturn),
        description: `${title} fractional property`,
        attributes: [
          { trait_type: 'rentalYield', value: Number(rentalYield) },
          { trait_type: 'annualReturn', value: Number(annualReturn) },
          { trait_type: 'address', value: address }
        ]
      };
      let metadataURI = '';
      try {
        if (hasIPFSConfig()) {
          const imgUris = [];
          const batch = (images || []).slice(0, 5);
          setIpfsProgress({ current: 0, total: batch.length });
          for (const dataUrl of batch) {
            if (dataUrl && String(dataUrl).startsWith('data:')) {
              imgUris.push(await uploadImageDataURLToIPFS(dataUrl));
              setIpfsProgress((p) => ({ current: Math.min(p.current + 1, p.total), total: p.total }));
            }
          }
          const ipfsMeta = { ...meta, image: imgUris[0] || meta.image, images: imgUris.length ? imgUris : meta.images };
          metadataURI = await uploadJSONToIPFS(ipfsMeta);
          setIpfsProgress({ current: batch.length, total: batch.length });
        } else {
          const minimal = { name: meta.name, title: meta.title, address: meta.address, image: '', rentalYield: meta.rentalYield, annualReturn: meta.annualReturn, description: meta.description, attributes: meta.attributes };
          const metaStr = JSON.stringify(minimal);
          metadataURI = `data:application/json,${encodeURIComponent(metaStr)}`;
        }
      } catch (err) {
        const minimal = { name: meta.name, title: meta.title, address: meta.address, image: '', rentalYield: meta.rentalYield, annualReturn: meta.annualReturn, description: meta.description, attributes: meta.attributes };
        metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(minimal))}`;
      }
      if ((metadataURI || '').startsWith('data:') && metadataURI.length > 8192) { setPropMsg('Metadata too large; enable IPFS.'); return; }

      const { propertyId, token } = await web3Client.createProperty({
        name: `${title} Shares`,
        symbol: title.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'PROP',
        metadataURI,
        totalShares: String(nShares),
        sharePriceWei: String(ethers.parseEther(String(nPrice))),
        owner: (await web3Client.signer.getAddress())
      });
      setPropMsg(`Created on-chain: #${propertyId} token ${token.slice(0,6)}...${token.slice(-4)}`);

      // Persist admin-uploaded gallery for this new property so UI has photos immediately
      try {
        const key = 'propertyImages';
        const raw = localStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        const galleryRaw = (previewImgs && previewImgs.length ? previewImgs.slice(0,5) : (form.images || []).slice(0,5));
        const thumbs = await compressMany(galleryRaw, { maxWidth: 800, quality: 0.7 });
        if (thumbs && thumbs.length) {
          map[String(propertyId)] = thumbs;
          localStorage.setItem(key, JSON.stringify(map));
        }
      } catch {}

      const chainProps = await web3Client.getProperties(0, 200);
      const merged = chainProps.map(cp => ({
        id: cp.id,
        tokenAddress: cp.tokenAddress || cp.token,
        onchainId: cp.id,
        totalShares: cp.totalShares,
        availableShares: cp.availableShares ?? cp.totalShares,
        sharePrice: cp.sharePrice,
        active: cp.active,
        metadataURI: cp.metadataURI,
        title: cp.title || `Property #${cp.id}`,
        address: cp.address || '',
        image: cp.image || '',
        images: cp.images || undefined,
        rentalYield: cp.rentalYield ?? '',
        annualReturn: cp.annualReturn ?? ''
      }));
      // Inject our just-uploaded gallery into the created property entry
  try {
        const key = 'propertyImages';
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        const gallery = map[String(propertyId)];
        if (Array.isArray(gallery) && gallery.length) {
          const idx = merged.findIndex(p => Number(p.id) === Number(propertyId));
          if (idx >= 0) {
            const base = merged[idx];
            merged[idx] = { ...base, image: gallery[0] || base.image, images: gallery };
          }
        }
      } catch {}
      setProperties(merged);
      savePropertiesSafe(merged);
      setForm({ title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', images: [] });
      setPreviewImgs([]);
      setIpfsProgress({ current: 0, total: 0 });
    } catch (e) {
      setPropMsg(e?.reason || e?.shortMessage || e?.message || 'Create failed.');
    }
  };

  const handleDeleteProperty = async (id) => {
    const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
    const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    const idxLocal = localProps.findIndex(p => p.id === id);
    const propTitle = idxLocal !== -1 ? (localProps[idxLocal].title || `Property #${id}`) : `Property #${id}`;
    setProperties(prev => prev.filter(p => p.id !== id));
    let onchainDeactivated = false;
    try {
      await web3Client.connect();
      await web3Client.setPropertyActive(id, false);
  // Best-effort: also mark the linked application as Removed in the factory (if caller is factory owner)
  try { await web3Client.markApplicationRemovedByProperty(id, 'Removed by admin'); } catch {}
      onchainDeactivated = true;
    } catch {}
    let updated = [...localProps];
    if (idxLocal !== -1) {
      if (onchainDeactivated) updated[idxLocal] = { ...updated[idxLocal], archivedLocal: false };
      else updated[idxLocal] = { ...updated[idxLocal], archivedLocal: true };
    }
    const newArchivedIds = Array.from(new Set([ ...archivedIds, id ]));
    localStorage.setItem('archivedPropertyIds', JSON.stringify(newArchivedIds));
    try {
      const chainPropsRaw = await web3Client.getProperties(0, 200);
      const chainProps = chainPropsRaw.filter(cp => cp.active && !newArchivedIds.includes(cp.id));
      const archived = updated.filter(lp => lp.archivedLocal);
      const merged = chainProps.map(cp => {
        const lp = updated.find(x => x.id === cp.id);
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
          title: lp?.title || `Property #${cp.id}`,
          address: lp?.address || '',
          image: lp?.image || '',
          images: lp?.images || undefined,
          rentalYield: lp?.rentalYield ?? '',
          annualReturn: lp?.annualReturn ?? ''
        };
      }).filter(p => !p.archivedLocal);
      savePropertiesSafe([...merged, ...archived]);
      setProperties(merged);
    } catch {
      savePropertiesSafe(updated);
    }
    setDeleteMsg(`Property "${propTitle}" deleted.`);
  };

  const handleDepositDividends = async () => {
    if (!divForm.propertyId) { setDivMsg('Select property.'); return; }
    if (!divForm.amountEth || Number(divForm.amountEth) <= 0) { setDivMsg('Enter a positive amount.'); return; }
    try {
      await web3Client.connect();
      const [acct, mktOwner] = await Promise.all([ web3Client.getAccount(), web3Client.getMarketplaceOwner() ]);
      if (!mktOwner || mktOwner.toLowerCase() !== (acct || '').toLowerCase()) { setDivMsg(`Only owner can deposit. Use ${mktOwner || 'owner'}.`); return; }
      const amountWei = ethers.parseEther(String(divForm.amountEth));
      await web3Client.depositDividends({ propertyId: Number(divForm.propertyId), amountWei });
      setDivMsg('Dividends deposited.');
    } catch (e) {
      setDivMsg(e?.shortMessage || e?.reason || e?.message || 'Deposit failed.');
    }
  };

  const renderTradeHistory = () => {
    if (trades.length === 0) return <div>No trading history yet.</div>;
    return (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>User</th>
            <th>Property Name</th>
            <th>Property ID</th>
            <th>Quantity</th>
            <th>Price (ETH)</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(tr => {
            const user = users.find(u => u.id === tr.userId);
            const prop = properties.find(p => p.id === tr.propertyId);
            return (
              <tr key={tr.id}>
                <td>{tr.type}</td>
                <td>{user ? user.name || user.email : tr.userId}</td>
                <td>{prop ? prop.title : 'Unknown'}</td>
                <td>{tr.propertyId}</td>
                <td>{tr.quantity}</td>
                <td>{tr.price}</td>
                <td>{new Date(tr.timestamp).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="admin-root">
      <AppHeader user={user} />
      <main>
        <div className="container">
          <div className="admin-container">
            <div className="admin-title">Admin Panel</div>
            <div className="admin-desc">
              Welcome, Admin! Here you can list new properties for fractional ownership and manage dividends.<br />
              <b>Note:</b> All property trading is powered by Ethereum blockchain smart contracts for secure, transparent transactions.
            </div>

            {/* List New Property */}
            <div className="card">
              <h3>List New Property</h3>
              {/* IPFS configuration: enable cross-browser persistence using nft.storage (free) or web3.storage */}
              <div className="small" style={{ marginBottom: 10, background: '#F3F4F6', padding: 8, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>IPFS Storage (nft.storage preferred)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={ipfsProvider} onChange={e => setIpfsProvider(e.target.value)}>
                    <option value="nft">nft.storage (free)</option>
                    <option value="web3">web3.storage</option>
                  </select>
                  <input
                    placeholder={ipfsProvider === 'nft' ? 'nft.storage API token' : 'web3.storage API token'}
                    value={ipfsTokenVal}
                    onChange={e => setIpfsTokenVal(e.target.value)}
                    style={{ flex: 1, minWidth: 260 }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      try {
                        const t = (ipfsTokenVal || '').trim();
                        if (ipfsProvider === 'nft') {
                          if (t) localStorage.setItem('NFT_STORAGE_TOKEN', t); else localStorage.removeItem('NFT_STORAGE_TOKEN');
                          // also clear the other to avoid confusion
                          localStorage.removeItem('WEB3_STORAGE_TOKEN');
                        } else {
                          if (t) localStorage.setItem('WEB3_STORAGE_TOKEN', t); else localStorage.removeItem('WEB3_STORAGE_TOKEN');
                          localStorage.removeItem('NFT_STORAGE_TOKEN');
                        }
                        alert(t ? 'IPFS token saved. New properties will upload to IPFS.' : 'IPFS token cleared.');
                      } catch {}
                    }}
                  >Save</button>
                  <span className="small" style={{ color: hasIPFSConfig() ? '#065f46' : '#6b7280' }}>
                    {hasIPFSConfig() ? 'IPFS enabled (images persist across browsers)' : 'IPFS disabled (only local thumbnail; enable to persist gallery)'}
                  </span>
                </div>
              </div>
              {/* Web3 ownership status */}
              <div className="small" style={{ marginBottom: 8 }}>
                <div>Registry: {ownership.regAddr || '...'}</div>
                <div>Marketplace: {ownership.mktAddr || '...'}</div>
                <div>Registry Owner: {ownership.regOwner || '...'}</div>
                <div>Marketplace Owner: {ownership.mktOwner || '...'}</div>
                {(() => {
                  const ok = ownership.regOwner && ownership.mktAddr && ownership.regOwner.toLowerCase() === ownership.mktAddr.toLowerCase();
                  return (
                    <>
                      {ok ? (
                        <div style={{ color: '#065f46', marginTop: 4 }}>Ownership OK: Registry is owned by the Marketplace. You can create properties.</div>
                      ) : (
                        <div style={{ color: '#b91c1c', marginTop: 4 }}>Registry is not owned by Marketplace. Create will revert. Fix it below.</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                        <button
                          className={`btn ${ok ? 'btn-secondary' : 'btn-secondary'}`}
                          onClick={handleFixOwnership}
                          disabled={ok || ownership.loading}
                        >
                          {ownership.loading ? 'Fixing…' : (ok ? 'Ownership OK' : 'Fix Ownership (Registry → Marketplace)')}
                        </button>
                        <span className="small">{ownership.fixMsg}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Property name (e.g. Damansara Villa)" />
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Address (e.g. No. 12, Jalan Damansara, 47800 Petaling Jaya, Selangor)" />
              <input value={form.rentalYield} type="number" step="0.01" onChange={e => setForm(f => ({ ...f, rentalYield: e.target.value }))} placeholder="Rental Yield (%)" />
              <input value={form.annualReturn} type="number" step="0.01" onChange={e => setForm(f => ({ ...f, annualReturn: e.target.value }))} placeholder="Projected Annual Return (%)" />
              <input value={form.totalShares} type="number" min="1" onChange={e => setForm(f => ({ ...f, totalShares: e.target.value }))} placeholder="Total shares (e.g. 10000)" />
              <input value={form.sharePrice} type="number" min="0.0001" step="0.0001" onChange={e => setForm(f => ({ ...f, sharePrice: e.target.value }))} placeholder="Price per share (ETH)" />
              <label htmlFor="imageUpload">Property Images (1–5). First image will be the thumbnail. {hasIPFSConfig() ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>IPFS enabled</span>
              ) : (
                <span className="small" style={{ color: '#6b7280' }}>inline metadata (only thumbnail saved). Set VITE_WEB3_STORAGE_TOKEN to enable full gallery via IPFS.</span>
              )}</label>
              <input id="imageUpload" type="file" accept="image/*" multiple onChange={handleImagesUpload} />
              {previewImgs?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {previewImgs.map((src, idx) => (
                    <div key={`pv-${idx}`} style={{ position: 'relative' }}>
                      <img
                        src={src || 'https://placehold.co/120x120?text=Img'}
                        alt={`Preview ${idx+1}`}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/120x120?text=Img'; }}
                      />
                      {idx === 0 && (
                        <span style={{ position: 'absolute', top: 2, left: 2, background: '#4636e3', color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 4 }}>Thumbnail</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {ipfsProgress.total > 0 && (
                <div className="small" style={{ marginTop: 6 }}>
                  Uploading to IPFS: {ipfsProgress.current}/{ipfsProgress.total}
                </div>
              )}
              <button className="btn btn-primary" onClick={handleCreateProperty}>Create property</button>
              <div className="small">{propMsg}</div>
            </div>

            {/* User Applications (review) */}
            <div className="card">
              <h3>User Applications</h3>
              {!factoryAddr ? (
                <div className="small">Factory not configured. Deploy and set addresses.json.</div>
              ) : (
                <div className="small" style={{ marginBottom: 8 }}>Factory: {factoryAddr}</div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button className="btn btn-secondary" onClick={async () => {
                  try {
                    await web3Client.connect();
                    if (!factoryAddr) { setAppsMsg('Factory not configured'); return; }
                    const mktOwner = await web3Client.getMarketplaceOwner();
                    const acctAddr = await web3Client.getAccount();
                    if (!mktOwner || mktOwner.toLowerCase() !== acctAddr.toLowerCase()) { setAppsMsg(`Switch to marketplace owner ${mktOwner}`); return; }
                    await web3Client.setAuthorizedCreator(factoryAddr, true);
                    setAppsMsg('Factory authorized as registry creator.');
                  } catch (e) {
                    setAppsMsg(e?.message || 'Authorize failed');
                  }
                }}>Authorize Factory in Registry</button>
                <button className="btn btn-secondary" onClick={async () => {
                  try { const { items } = await web3Client.adminGetApplications(1, 200); setApps(items); } catch (e) { setAppsMsg(e?.message || 'Refresh failed'); }
                }}>Refresh</button>
                <span className="small">{appsMsg}</span>
              </div>
              {apps.length === 0 ? (
                <div>No applications.</div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th><th>Applicant</th><th>Title</th><th>Shares</th><th>Price (ETH)</th><th>Status</th><th>Note</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apps.map((a) => (
                        <tr key={`app-${a.id}`}>
                          <td>{a.id}</td>
                          <td>{a.applicant}</td>
                          <td>{(a.name || '').replace(/ Shares$/,'')}</td>
                          <td>{a.totalShares}</td>
                          <td>{a.sharePrice}</td>
                          <td>{(['Pending','Approved','Rejected','Finalized','Removed'])[Number(a.status)||0]}</td>
                          <td>{a.reviewNote}</td>
                          <td>
                            {Number(a.status) === 0 && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-success" onClick={async () => {
                                  try { await web3Client.reviewApplication(a.id, true, 'Approved'); const { items } = await web3Client.adminGetApplications(1, 200); setApps(items); setAppsMsg('Approved.'); } catch (e) { setAppsMsg(e?.message || 'Approve failed'); }
                                }}>Approve</button>
                                <button className="btn btn-danger" onClick={async () => {
                                  const reason = prompt('Reason for rejection?') || 'Rejected';
                                  try { await web3Client.reviewApplication(a.id, false, reason); const { items } = await web3Client.adminGetApplications(1, 200); setApps(items); setAppsMsg('Rejected.'); } catch (e) { setAppsMsg(e?.message || 'Reject failed'); }
                                }}>Reject</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Edit Property */}
            <div className="card">
              <h3>Edit Property</h3>
              <select
                value={editForm.propertyId}
                onChange={e => {
                  const id = e.target.value;
                  const p = properties.find(pp => String(pp.id) === String(id)) || {};
                  setEditForm(f => ({
                    ...f,
                    propertyId: id,
                    title: p.title || '',
                    address: p.address || '',
                    sharePriceEth: (p.sharePrice !== undefined && p.sharePrice !== null) ? String(p.sharePrice) : ''
                  }));
                }}
              >
                <option value="">Select property</option>
                {properties.map(p => (
                  <option key={`ep-${p.id}`} value={p.id}>{p.title} (#{p.id})</option>
                ))}
              </select>
              <input placeholder="Title" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
              <input placeholder="Address" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
              <input type="number" step="0.0001" placeholder="Share Price (ETH)" value={editForm.sharePriceEth} onChange={e => setEditForm(f => ({ ...f, sharePriceEth: e.target.value }))} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={async () => {
                  if (!editForm.propertyId) { setEditMsg('Select a property.'); return; }
                  await web3Client.connect();
                  const p = properties.find(pp => String(pp.id) === String(editForm.propertyId)) || {};
                  const baseMeta = {
                    name: editForm.title || p.title || `Property #${p.id}`,
                    title: editForm.title || p.title || `Property #${p.id}`,
                    address: editForm.address || p.address || '',
                    rentalYield: p.rentalYield ?? 0,
                    annualReturn: p.annualReturn ?? 0,
                    description: `${editForm.title || p.title || `Property #${p.id}`} fractional property`,
                    attributes: [
                      { trait_type: 'rentalYield', value: Number(p.rentalYield ?? 0) },
                      { trait_type: 'annualReturn', value: Number(p.annualReturn ?? 0) },
                      { trait_type: 'address', value: editForm.address || p.address || '' }
                    ]
                  };
                  let metadataURI = '';
                  let metaUpdateErr = '';
                  const existingImgs = Array.isArray(p.images) && p.images.length ? p.images.slice(0, 5) : (p.image ? [p.image] : []);
                  let outImgs = [];
                  try {
                    if (hasIPFSConfig()) {
                      for (const u of existingImgs) {
                        if (typeof u === 'string' && u.startsWith('data:')) {
                          try { outImgs.push(await uploadImageDataURLToIPFS(u)); } catch {}
                        } else if (typeof u === 'string') {
                          outImgs.push(u);
                        }
                      }
                      const ipfsMeta = { ...baseMeta, image: outImgs[0] || '', images: outImgs.length ? outImgs : undefined };
                      metadataURI = await uploadJSONToIPFS(ipfsMeta);
                    } else {
                      outImgs = existingImgs.filter(u => typeof u === 'string' && !u.startsWith('data:'));
                      const minimal = { ...baseMeta, image: outImgs[0] || '', images: outImgs.length ? outImgs : undefined };
                      const metaStr = JSON.stringify(minimal);
                      metadataURI = `data:application/json,${encodeURIComponent(metaStr)}`;
                    }
                  } catch (e) {
                    try {
                      const minimal = { ...baseMeta, image: outImgs[0] || '', images: outImgs.length ? outImgs : undefined };
                      metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(minimal))}`;
                    } catch {}
                  }
                  const tooLarge = (metadataURI || '').startsWith('data:') && (metadataURI.length > 8192);
                  let didMeta = false;
                  try {
                    if (!tooLarge && metadataURI) {
                      await web3Client.updatePropertyMetadataURI(Number(editForm.propertyId), metadataURI);
                      didMeta = true;
                    } else if (tooLarge) {
                      metaUpdateErr = 'Metadata too large; enable IPFS for images.';
                    }
                  } catch (e) {
                    metaUpdateErr = e?.shortMessage || e?.reason || e?.message || 'Metadata update failed';
                  }
                  let didPrice = false; let priceErr = '';
                  try {
                    if (editForm.sharePriceEth !== '' && Number(editForm.sharePriceEth) >= 0) {
                      await web3Client.updatePropertySharePrice(Number(editForm.propertyId), ethers.parseEther(String(editForm.sharePriceEth)));
                      didPrice = true;
                    }
                  } catch (e) {
                    priceErr = e?.shortMessage || e?.reason || e?.message || 'Share price update failed';
                  }
                  if (didMeta || didPrice) {
                    const next = properties.map(pp => (
                      pp.id === Number(editForm.propertyId)
                        ? {
                            ...pp,
                            title: editForm.title || pp.title,
                            address: editForm.address || pp.address,
                            sharePrice: (didPrice ? editForm.sharePriceEth : pp.sharePrice),
                            metadataURI: (didMeta ? metadataURI : pp.metadataURI),
                            image: (didMeta && outImgs[0]) ? resolveIpfsUrlToHttp(outImgs[0]) : pp.image,
                            images: (didMeta && outImgs.length) ? outImgs.map(resolveIpfsUrlToHttp) : pp.images,
                          }
                        : pp
                    ));
                    setProperties(next);
                    try { savePropertiesSafe(next); } catch {}
                  }
                  if (didMeta && didPrice) setEditMsg('Property updated.');
                  else if (didPrice && !didMeta) setEditMsg(`Share price updated; metadata not changed (${metaUpdateErr || 'skipped'}).`);
                  else if (didMeta && !didPrice) setEditMsg(`Metadata updated; share price not changed (${priceErr || 'skipped'}).`);
                  else setEditMsg('Update failed.');
                  setTimeout(() => setEditMsg(''), 3000);
                }}>Save Changes</button>
                <span className="small">{editMsg}</span>
              </div>
            </div>

            {/* Deposit Dividends */}
            <div className="card">
              <h3>Deposit Dividends</h3>
              <select value={divForm.propertyId} onChange={e => setDivForm(f => ({ ...f, propertyId: e.target.value }))}>
                <option value="">Select property</option>
                {properties.map(p => (<option key={`dp-${p.id}`} value={p.id}>{p.title} (#{p.id})</option>))}
              </select>
              <input type="number" step="0.0001" placeholder="Amount (ETH)" value={divForm.amountEth} onChange={e => setDivForm(f => ({ ...f, amountEth: e.target.value }))} />
              <button className="btn btn-primary" onClick={handleDepositDividends}>Deposit</button>
              <div className="small">{divMsg}</div>
            </div>

            {/* Listed Properties */}
            <div className="card">
              <h3>Listed Properties</h3>
              {properties.length === 0 ? (
                <div>No properties yet.</div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Share Price (ETH)</th>
                        <th>Total Shares</th>
                        <th>Available Shares</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map(p => (
                        <tr key={`prop-${p.id}`}>
                          <td>{p.id}</td>
                          <td>{p.title}</td>
                          <td>{p.sharePrice}</td>
                          <td>{p.totalShares}</td>
                          <td>{p.availableShares ?? '-'}</td>
                          <td>
                            <button className="btn btn-danger" onClick={() => handleDeleteProperty(p.id)}>Deactivate</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => {
                  if (!window.confirm('Clear local drafts (entries without on-chain tokens)?')) return;
                  const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
                  const keep = (localProps || []).filter(p => (p.tokenAddress || p.onchainId));
                  const keepIds = new Set(keep.map(p => p.id));
                  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
                  const cleanedArchivedIds = (archivedIds || []).filter(id => keepIds.has(id));
                  localStorage.setItem('archivedPropertyIds', JSON.stringify(cleanedArchivedIds));
                  savePropertiesSafe(keep);
                  setProperties(keep.filter(p => !p.archivedLocal));
                  setDeleteMsg('Cleared local drafts.');
                  setTimeout(() => setDeleteMsg(''), 2500);
                }}>Clear Local Drafts</button>
                <span className="small">{deleteMsg}</span>
              </div>
            </div>

            {/* Trading History */}
            <div className="card">
              <h3>Trading History</h3>
              {renderTradeHistory()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Admin;
