import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Admin.css';
import { web3Client } from './web3/client';
import { hasIPFSConfig, uploadImageDataURLToIPFS, uploadJSONToIPFS, resolveIpfsUrlToHttp, getWeb3StorageToken, getNftStorageToken } from './web3/ipfs';
import AppHeader from './components/AppHeader';
import { ethers } from 'ethers';
import { savePropertiesSafe } from './utils/safeLocalStorage';

const Admin = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [properties, setProperties] = useState([]);
  const [trades, setTrades] = useState([]);
  const [users, setUsers] = useState([]);
  const [web3Info, setWeb3Info] = useState({ account: null, chainId: null, error: null });
  const [ownership, setOwnership] = useState({ regOwner: null, mktOwner: null, mktAddr: null, regAddr: null, loading: false, fixMsg: '' });
  const [form, setForm] = useState({
    title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', images: [] // up to 5 data URLs
  });
  const [propMsg, setPropMsg] = useState('');
  const [ipfsProgress, setIpfsProgress] = useState({ current: 0, total: 0 });
  const [deleteMsg, setDeleteMsg] = useState('');
  const [previewImgs, setPreviewImgs] = useState([]); // array of data URLs
  const [divForm, setDivForm] = useState({ propertyId: '', amountEth: '' });
  const [divMsg, setDivMsg] = useState('');
  const [editForm, setEditForm] = useState({ propertyId: '', title: '', address: '', sharePriceEth: '' });
  const [editMsg, setEditMsg] = useState('');
  const [ipfsTokenVal, setIpfsTokenVal] = useState('');
  const [ipfsProvider, setIpfsProvider] = useState('nft'); // 'nft' | 'web3'
  
  const handleClearLocalDrafts = () => {
    if (!window.confirm('Clear local drafts (entries without on-chain tokens)? This cannot be undone.')) return;
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
  };

  useEffect(() => {
  // Owner-only access is enforced by the OwnerGate route guard now.
  // We no longer gate Admin via localStorage/currentUser.
  // Optionally keep a lightweight user object from wallet after connect (below).
  const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  // Only show on-chain backed items on initial paint; hide local-only drafts
  setProperties(
    localProps.filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.tokenAddress || p.onchainId))
  );
    setTrades(JSON.parse(localStorage.getItem('trades') || '[]'));
  setUsers(JSON.parse(localStorage.getItem('users') || '[]'));
    try {
      const nft = getNftStorageToken();
      const web3 = getWeb3StorageToken();
      if (nft) { setIpfsProvider('nft'); setIpfsTokenVal(nft); }
      else if (web3) { setIpfsProvider('web3'); setIpfsTokenVal(web3); }
    } catch {}

  // Initialize wallet connection (non-blocking)
    (async () => {
      try {
        const info = await web3Client.connect();
        setWeb3Info({ account: info.account, chainId: info.chainId, error: null });
    // Reflect connected wallet as session user (for header displays, etc.)
    setUser({ address: info.account });
        // Ownership diagnostics
        try {
          const [regOwner, mktOwner, mktAddr, regAddr] = await Promise.all([
            web3Client.getRegistryOwner(),
            web3Client.getMarketplaceOwner(),
            web3Client.getMarketplaceAddress(),
            web3Client.getRegistryAddress(),
          ]);
          setOwnership(prev => ({ ...prev, regOwner, mktOwner, mktAddr, regAddr }));
        } catch {}
        // After connecting, try loading properties from the chain and merge with local metadata
        try {
          const chainPropsRaw = await web3Client.getProperties(0, 200);
          const isZero = (a) => !a || /^0x0{40}$/i.test(a);
          const chainProps = chainPropsRaw.filter(cp => cp.active && !isZero(cp.tokenAddress || cp.token) && Number(cp.totalShares || 0) > 0);
          const archived = localProps.filter(lp => lp.archivedLocal);
          // Merge: prefer local UI metadata (title/address/image) if present
          const merged = chainProps.map(cp => {
            const lp = localProps.find(x => x.id === cp.id);
            return {
              id: cp.id,
              tokenAddress: cp.tokenAddress || cp.token,
              onchainId: cp.id,
              totalShares: cp.totalShares,
              availableShares: cp.availableShares ?? lp?.availableShares ?? cp.totalShares,
              sharePrice: cp.sharePrice, // already in ETH from client
              active: cp.active,
              metadataURI: cp.metadataURI,
              archivedLocal: lp?.archivedLocal || false,
              // UI fields from local if available
              title: lp?.title || `Property #${cp.id}`,
              address: lp?.address || '',
              image: lp?.image || '',
              images: lp?.images || undefined,
              rentalYield: lp?.rentalYield ?? '',
              annualReturn: lp?.annualReturn ?? ''
            };
          }).filter(p => !p.archivedLocal);
          // Exclude local-only drafts by default to avoid phantom items unless explicitly needed
          const allActive = [...merged];
          setProperties(allActive);
          savePropertiesSafe([...allActive, ...archived]);
        } catch {}
      } catch (e) {
        setWeb3Info({ account: null, chainId: null, error: e?.message || String(e) });
      }
    })();
  }, [navigate]);

  // Property creation
  const handleImagesUpload = e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const limited = files.slice(0, 5);
    const readers = limited.map(file => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = evt => resolve(evt.target.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    }));
    Promise.all(readers).then(urls => {
      const clean = urls.filter(Boolean);
      setForm(f => ({ ...f, images: clean.slice(0, 5) }));
      setPreviewImgs(clean.slice(0, 5));
    });
  };

  const handleCreateProperty = async () => {
  const { title, address, rentalYield, annualReturn, totalShares, sharePrice, images } = form;
    if (!title || !address || rentalYield === '' || annualReturn === '' || totalShares === '' || sharePrice === '' || !Array.isArray(images) || images.length === 0) {
      setPropMsg('Complete all fields and upload at least 1 image (up to 5).');
      return;
    }
    // Numeric validation to avoid contract reverts
    const nShares = Number(totalShares);
    const nPrice = Number(sharePrice);
    const nRY = Number(rentalYield);
    const nAR = Number(annualReturn);
    if (!Number.isFinite(nShares) || nShares <= 0) {
      setPropMsg('Total shares must be a number greater than 0.');
      return;
    }
    if (!Number.isFinite(nPrice) || nPrice <= 0) {
      setPropMsg('Share price must be a number greater than 0.');
      return;
    }
    if (!Number.isFinite(nRY) || nRY < 0 || !Number.isFinite(nAR) || nAR < 0) {
      setPropMsg('Yields must be valid numbers (>= 0).');
      return;
    }
  // Defer adding to local list until on-chain create confirms; still keep a local draft id if needed
    // On-chain create fractional token + registry entry
    try {
      await web3Client.connect();
      // Only the Marketplace owner can create properties
      const acct = await web3Client.getAccount();
      const owner = await web3Client.getMarketplaceOwner();
      if (!owner || owner.toLowerCase() !== acct.toLowerCase()) {
        setPropMsg(`Only owner can create properties. Switch wallet to ${owner || 'owner'} or transfer ownership.`);
        return;
      }
      // Ensure Registry is owned by Marketplace (prereq for createProperty)
      const [regOwner, mktAddr] = await Promise.all([
        web3Client.getRegistryOwner(),
        web3Client.getMarketplaceAddress(),
      ]);
      if (!regOwner || regOwner.toLowerCase() !== mktAddr.toLowerCase()) {
        setPropMsg('Registry is not owned by Marketplace. Click "Fix Ownership" below, then retry.');
        return;
      }
      setPropMsg('Creating property on-chain...');
      // Build metadata JSON. Prefer IPFS if configured; else embed minimal to keep calldata small.
      const meta = {
        name: title,
        title,
        address,
        image: images[0], // thumbnail; may be replaced by IPFS URIs below
        images: images.slice(0, 5), // will be stripped if IPFS is not configured
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
          // Upload up to 5 images; first becomes thumbnail
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
          // Inline path: avoid embedding images to keep calldata tiny (data URIs are huge and will revert on gas)
          const minimal = {
            name: meta.name,
            title: meta.title,
            address: meta.address,
            image: '',
            rentalYield: meta.rentalYield,
            annualReturn: meta.annualReturn,
            description: meta.description,
            attributes: meta.attributes,
          };
          const metaStr = JSON.stringify(minimal);
          if (typeof btoa === 'function') {
            const metaB64 = btoa(unescape(encodeURIComponent(metaStr)));
            metadataURI = `data:application/json;base64,${metaB64}`;
          } else {
            metadataURI = `data:application/json,${encodeURIComponent(metaStr)}`;
          }
        }
  } catch (err) {
        // Fallback: DO NOT embed images; use a minimal metadata to avoid huge calldata and OOG reverts
        const minimal = {
          name: meta.name,
          title: meta.title,
          address: meta.address,
          image: '',
          rentalYield: meta.rentalYield,
          annualReturn: meta.annualReturn,
          description: meta.description,
          attributes: meta.attributes,
        };
        try {
          const metaStr = JSON.stringify(minimal);
          if (typeof btoa === 'function') {
            const metaB64 = btoa(unescape(encodeURIComponent(metaStr)));
            metadataURI = `data:application/json;base64,${metaB64}`;
          } else {
            metadataURI = `data:application/json,${encodeURIComponent(metaStr)}`;
          }
        } catch {
          metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(minimal))}`;
        }
  setPropMsg('IPFS upload failed; created with minimal metadata (no images). You can upload gallery to IPFS later.');
  setIpfsProgress({ current: 0, total: 0 });
      }
      // Guard: prevent oversized data URIs from being sent (can cause out-of-gas)
      if ((metadataURI || '').startsWith('data:') && metadataURI.length > 8192) {
        setPropMsg('Metadata too large. Enable IPFS in Admin and retry, or remove images.');
        return;
      }
      const { receipt, propertyId, token } = await web3Client.createProperty({
        name: `${title} Shares`,
        symbol: title.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'PROP',
        metadataURI,
        totalShares: String(nShares),
        sharePriceWei: String(ethers.parseEther(String(nPrice))),
        owner: (await web3Client.signer.getAddress())
      });
      console.log('createProperty', { receipt, propertyId, token });
      if (propertyId !== undefined && token) {
        setPropMsg(`Created on-chain: #${propertyId} token ${token.slice(0,6)}...${token.slice(-4)}`);
        // Reload from chain and merge with UI metadata for the created property
        const chainProps = await web3Client.getProperties(0, 200);
        // attempt to enrich from metadataURI so UI titles are correct immediately
  const merged = await Promise.all(chainProps.map(async (cp) => {
          const isNew = Number(cp.id) === Number(propertyId);
    const lp = isNew ? { title, address, images, image: images?.[0], rentalYield: Number(rentalYield), annualReturn: Number(annualReturn) } : (properties.find(x => x.id === cp.id) || {});
          let enriched = {};
          try {
            const url = cp.metadataURI;
            if (url) {
              const res = await fetch(url.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${url.replace('ipfs://','')}` : url);
              if (res.ok) {
                const meta = await res.json();
                enriched = {
                  title: meta?.name || meta?.title || lp?.title || `Property #${cp.id}`,
                  address: meta?.address || lp?.address || '',
      image: meta?.image || lp?.image || '',
      images: Array.isArray(meta?.images) ? meta.images.map(resolveIpfsUrlToHttp) : (lp?.images || undefined),
                  rentalYield: Number(meta?.rentalYield ?? lp?.rentalYield ?? '') || '',
                  annualReturn: Number(meta?.annualReturn ?? lp?.annualReturn ?? '') || ''
                };
              }
            }
          } catch {}
          return {
            id: cp.id,
            tokenAddress: cp.tokenAddress || cp.token,
            onchainId: cp.id,
            totalShares: cp.totalShares,
            availableShares: cp.availableShares ?? lp?.availableShares ?? cp.totalShares,
            sharePrice: cp.sharePrice,
            active: cp.active,
            metadataURI: cp.metadataURI,
  title: enriched.title ?? lp?.title ?? `Property #${cp.id}`,
  address: enriched.address ?? lp?.address ?? '',
  image: enriched.image ?? (enriched.images?.[0]) ?? lp?.image ?? '',
  images: enriched.images ?? lp?.images ?? undefined,
            rentalYield: enriched.rentalYield ?? lp?.rentalYield ?? '',
            annualReturn: enriched.annualReturn ?? lp?.annualReturn ?? ''
          };
        }));
        setProperties(merged);
  savePropertiesSafe(merged);
      } else {
        setPropMsg('On-chain create confirmed, but event not parsed.');
      }
    } catch (e) {
  console.error(e);
  setPropMsg(e?.reason || e?.shortMessage || e?.message || 'On-chain create failed.');
      return;
    }
  setForm({ title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', images: [] });
  setPreviewImgs([]);
  setIpfsProgress({ current: 0, total: 0 });
  // Small delay to let the node index the event, then go marketplace
  setTimeout(() => navigate('/marketplace'), 600);
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

  // Property deletion
  const handleDeleteProperty = async (id) => {
    const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    const idxLocal = localProps.findIndex(p => p.id === id);
    const propTitle = idxLocal !== -1 ? (localProps[idxLocal].title || `Property #${id}`) : `Property #${id}`;

    // Optimistic UI: remove from current state
    setProperties(prev => prev.filter(p => p.id !== id));

    // Try on-chain deactivate
    let onchainDeactivated = false;
    try {
      await web3Client.connect();
      await web3Client.setPropertyActive(id, false);
      onchainDeactivated = true;
    } catch (e) {
      console.warn('On-chain deactivate failed; archiving locally instead.', e?.reason || e?.message || e);
    }

    // Update localStorage: mark archivedLocal if on-chain deactivate not possible; otherwise keep removed
    let updated = [...localProps];
    if (idxLocal !== -1) {
      if (onchainDeactivated) {
        // keep record but mark not archived; it will be excluded by chain active filter on next merge
        updated[idxLocal] = { ...updated[idxLocal], archivedLocal: false };
      } else {
        updated[idxLocal] = { ...updated[idxLocal], archivedLocal: true };
      }
    }

    // Persist archived id (so other pages also hide it)
    const newArchivedIds = Array.from(new Set([ ...archivedIds, id ]));
    localStorage.setItem('archivedPropertyIds', JSON.stringify(newArchivedIds));

    // Refresh from chain (active only) and merge UI metadata; then append archived entries to storage
    try {
      const chainPropsRaw = await web3Client.getProperties(0, 200);
      const chainProps = chainPropsRaw.filter(cp => cp.active && !newArchivedIds.includes(cp.id));
      const archived = updated.filter(lp => lp.archivedLocal);
      const merged = chainProps.map(cp => {
        const lp = updated.find(x => x.id === cp.id);
        const out = {
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
        return out;
      }).filter(p => !p.archivedLocal);
  savePropertiesSafe([...merged, ...archived]);
      setProperties(merged);
    } catch {
  savePropertiesSafe(updated);
    }

    setDeleteMsg(`Property "${propTitle}" deleted.`);
  };

  const handleRestoreProperty = async (id) => {
    const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    const idx = localProps.findIndex(p => p.id === id);
    if (idx === -1) return;
    const propTitle = localProps[idx].title || `Property #${id}`;
    // Un-archive locally first
    localProps[idx] = { ...localProps[idx], archivedLocal: false };
  savePropertiesSafe(localProps);
  // Remove from archived ids set
  localStorage.setItem('archivedPropertyIds', JSON.stringify((archivedIds || []).filter(x => x !== id)));
    // Try to re-activate on-chain
    try {
      await web3Client.connect();
      await web3Client.setPropertyActive(id, true);
    } catch (e) {
      console.warn('On-chain restore failed (showing locally).', e?.reason || e?.message || e);
    }
    // Refresh properties view
    try {
  const chainPropsRaw = await web3Client.getProperties(0, 200);
  const archivedIds2 = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  const chainProps = chainPropsRaw.filter(cp => cp.active && !archivedIds2.includes(cp.id));
      const updated = JSON.parse(localStorage.getItem('properties') || '[]');
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
      setDeleteMsg(`Property "${propTitle}" restored.`);
    } catch {}
  };

  // Deposit dividends on-chain
  const handleDepositDividends = async () => {
    // Basic input validation
    if (divForm.propertyId === '' || divForm.propertyId === null || divForm.propertyId === undefined) {
      setDivMsg('Select property.');
      setTimeout(() => setDivMsg(''), 2500);
      return;
    }
    if (!divForm.amountEth || Number(divForm.amountEth) <= 0) {
      setDivMsg('Enter a positive amount in ETH.');
      setTimeout(() => setDivMsg(''), 2500);
      return;
    }
    try {
      await web3Client.connect();
      // Only the Marketplace owner can deposit (contract has onlyOwner on depositDividends)
      const [acct, mktOwner] = await Promise.all([
        web3Client.getAccount(),
        web3Client.getMarketplaceOwner()
      ]);
      if (!mktOwner || mktOwner.toLowerCase() !== (acct || '').toLowerCase()) {
        setDivMsg(`Only marketplace owner can deposit. Switch wallet to ${mktOwner || 'owner'}.`);
        setTimeout(() => setDivMsg(''), 3500);
        return;
      }
      const amountWei = ethers.parseEther(String(divForm.amountEth));
      await web3Client.depositDividends({ propertyId: Number(divForm.propertyId), amountWei });
      setDivMsg('Dividends deposited.');
    } catch (e) {
      console.error(e);
      const msg = e?.shortMessage || e?.reason || e?.message || '';
      if (msg.toLowerCase().includes('unauthorized') || msg.includes('0x118cdaa7')) {
        setDivMsg('Deposit failed: only marketplace owner can deposit.');
      } else if (msg.toUpperCase().includes('NO_SUPPLY')) {
        setDivMsg('Deposit failed: no shares minted for this property.');
      } else if (msg.toUpperCase().includes('NO_VALUE')) {
        setDivMsg('Deposit failed: amount must be > 0.');
      } else {
        setDivMsg('Deposit failed.');
      }
      setTimeout(() => setDivMsg(''), 3500);
    }
  };

  // Trading history
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
              <input
                placeholder="Title"
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              />
              <input
                placeholder="Address"
                value={editForm.address}
                onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
              />
              <input
                type="number"
                step="0.0001"
                placeholder="Share Price (ETH)"
                value={editForm.sharePriceEth}
                onChange={e => setEditForm(f => ({ ...f, sharePriceEth: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-primary" onClick={async () => {
                  if (!editForm.propertyId) { setEditMsg('Select a property.'); setTimeout(() => setEditMsg(''), 2500); return; }
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
                  // Build/keep gallery
                  const existingImgs = Array.isArray(p.images) && p.images.length ? p.images.slice(0, 5) : (p.image ? [p.image] : []);
                  let outImgs = [];
                  // Build metadata safely (avoid embedding large images when IPFS is off)
                  try {
                    if (hasIPFSConfig()) {
                      // Upload data URLs to IPFS; keep existing ipfs/http links
                      for (const u of existingImgs) {
                        if (typeof u === 'string' && u.startsWith('data:')) {
                          try { outImgs.push(await uploadImageDataURLToIPFS(u)); } catch { /* skip failed */ }
                        } else if (typeof u === 'string') {
                          outImgs.push(u);
                        }
                      }
                      const ipfsMeta = { ...baseMeta, image: outImgs[0] || '', images: outImgs.length ? outImgs : undefined };
                      metadataURI = await uploadJSONToIPFS(ipfsMeta);
                    } else {
                      // Keep only safe (non-data) URLs when IPFS is off
                      outImgs = existingImgs.filter(u => typeof u === 'string' && !u.startsWith('data:'));
                      const minimal = { ...baseMeta, image: outImgs[0] || '', images: outImgs.length ? outImgs : undefined };
                      const metaStr = JSON.stringify(minimal);
                      const metaB64 = btoa(unescape(encodeURIComponent(metaStr)));
                      metadataURI = `data:application/json;base64,${metaB64}`;
                    }
                  } catch (e) {
                    try {
                      const minimal = { ...baseMeta, image: outImgs[0] || '', images: outImgs.length ? outImgs : undefined };
                      metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(minimal))}`;
                    } catch {}
                  }
                  // If inline data is too large, skip metadata update but allow price update
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
                  // Update share price even if metadata failed
                  let didPrice = false; let priceErr = '';
                  try {
                    if (editForm.sharePriceEth !== '' && Number(editForm.sharePriceEth) >= 0) {
                      await web3Client.updatePropertySharePrice(Number(editForm.propertyId), ethers.parseEther(String(editForm.sharePriceEth)));
                      didPrice = true;
                    }
                  } catch (e) {
                    priceErr = e?.shortMessage || e?.reason || e?.message || 'Share price update failed';
                  }
                  // Update local UI if any part succeeded
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
                  if (didMeta && didPrice) {
                    setEditMsg('Property updated.');
                  } else if (didPrice && !didMeta) {
                    setEditMsg(`Share price updated; metadata not changed (${metaUpdateErr || 'skipped'}).`);
                  } else if (didMeta && !didPrice) {
                    setEditMsg(`Metadata updated; share price not changed (${priceErr || 'skipped'}).`);
                  } else {
                    setEditMsg('Update failed.');
                  }
                  setTimeout(() => setEditMsg(''), 3000);
                }}>Save Changes</button>
                <button className="btn btn-secondary" disabled={!hasIPFSConfig()} onClick={async () => {
                  try {
                    if (!editForm.propertyId) { setEditMsg('Select a property.'); setTimeout(() => setEditMsg(''), 2500); return; }
                    if (!hasIPFSConfig()) { setEditMsg('Enable IPFS first.'); setTimeout(() => setEditMsg(''), 2500); return; }
                    await web3Client.connect();
                    const p = properties.find(pp => String(pp.id) === String(editForm.propertyId)) || {};
                    const imgs = Array.isArray(p.images) && p.images.length ? p.images.slice(0,5) : (p.image ? [p.image] : []);
                    if (!imgs.length) { setEditMsg('No gallery found in local cache.'); setTimeout(() => setEditMsg(''), 2500); return; }
                    // Upload images that are data URLs; keep existing ipfs/http links
                    const outImgs = [];
                    for (const u of imgs) {
                      if (typeof u === 'string' && u.startsWith('data:')) {
                        try { outImgs.push(await uploadImageDataURLToIPFS(u)); } catch { /* skip failed */ }
                      } else {
                        outImgs.push(u);
                      }
                    }
                    if (!outImgs.length) { setEditMsg('Failed to upload gallery.'); setTimeout(() => setEditMsg(''), 2500); return; }
                    const meta = {
                      name: p.title || `Property #${p.id}`,
                      title: p.title || `Property #${p.id}`,
                      address: p.address || '',
                      image: outImgs[0],
                      images: outImgs,
                      rentalYield: Number(p.rentalYield ?? 0),
                      annualReturn: Number(p.annualReturn ?? 0),
                      description: `${p.title || `Property #${p.id}`} fractional property`,
                      attributes: [
                        { trait_type: 'rentalYield', value: Number(p.rentalYield ?? 0) },
                        { trait_type: 'annualReturn', value: Number(p.annualReturn ?? 0) },
                        { trait_type: 'address', value: p.address || '' }
                      ]
                    };
                    const metadataURI = await uploadJSONToIPFS(meta);
                    await web3Client.updatePropertyMetadataURI(Number(p.id), metadataURI);
                    // Update local state
                    const next = properties.map(pp => (
                      pp.id === Number(p.id)
                        ? { ...pp, image: resolveIpfsUrlToHttp(outImgs[0]), images: outImgs.map(resolveIpfsUrlToHttp), metadataURI }
                        : pp
                    ));
                    setProperties(next);
                    try { savePropertiesSafe(next); } catch {}
                    setEditMsg('Gallery uploaded to IPFS and metadata updated.');
                    setTimeout(() => setEditMsg(''), 3000);
                  } catch (e) {
                    console.error(e);
                    setEditMsg('Gallery upload failed.');
                    setTimeout(() => setEditMsg(''), 2500);
                  }
                }}>Upload gallery to IPFS</button>
                <span className="small">{editMsg}</span>
              </div>
            </div>
            <div className="card">
              <h3>Delete Property</h3>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button className="btn btn-secondary" onClick={handleClearLocalDrafts}>Clear local drafts</button>
              </div>
              <div>
                {properties.length === 0 ? (
                  <div>No properties available.</div>
                ) : (
                  properties.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, background: '#fff', padding: 10, borderRadius: 8, boxShadow: '0 1px 6px rgba(70,54,227,0.07)' }}>
                      <img
                        src={p.image || 'https://placehold.co/120x120?text=Img'}
                        alt={p.title || 'Property'}
                        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/120x120?text=Img'; }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#4636e3' }}>{p.title}</div>
                        <div style={{ fontSize: '0.98rem', color: '#444' }}>{p.address}</div>
                      </div>
                      <button className="btn btn-danger" onClick={() => handleDeleteProperty(p.id)}>Delete</button>
                    </div>
                  ))
                )}
              </div>
              <div className="small">{deleteMsg}</div>
            </div>
            {/* Archived section */}
            <div className="card">
              <h3>Archived Properties</h3>
              <div>
                {(() => {
                  const archived = (JSON.parse(localStorage.getItem('properties') || '[]') || []).filter(p => p.archivedLocal);
                  if (archived.length === 0) return <div>No archived properties.</div>;
                  return archived.map(p => (
                    <div key={`arch-${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, background: '#fff', padding: 10, borderRadius: 8, boxShadow: '0 1px 6px rgba(70,54,227,0.07)' }}>
                      <img
                        src={p.image || 'https://placehold.co/120x120?text=Img'}
                        alt={p.title || 'Property'}
                        style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.src = 'https://placehold.co/120x120?text=Img'; }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#4636e3' }}>{p.title || `Property #${p.id}`}</div>
                        <div style={{ fontSize: '0.98rem', color: '#444' }}>{p.address || ''}</div>
                      </div>
                      <button className="btn btn-success" onClick={() => handleRestoreProperty(p.id)}>Restore</button>
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div className="card">
              <h3>Trading History</h3>
              <div>{renderTradeHistory()}</div>
            </div>
            <div className="card">
              <h3>Dividends</h3>
              <select value={divForm.propertyId} onChange={e => setDivForm(f => ({ ...f, propertyId: e.target.value }))}>
                <option value="">Select property</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.title} (#{p.id})</option>
                ))}
              </select>
              <input type="number" step="0.0001" placeholder="Amount (ETH)" value={divForm.amountEth} onChange={e => setDivForm(f => ({ ...f, amountEth: e.target.value }))} />
              <button className="btn btn-primary" onClick={handleDepositDividends}>Deposit Dividends</button>
              <div className="small">{divMsg}</div>
            </div>
          </div>
        </div>
      </main>
      <footer className="admin-footer">
        <div>&copy; 2025 RealEstate dApp. All rights reserved.</div>
      </footer>
    </div>
  );
};

export default Admin;
