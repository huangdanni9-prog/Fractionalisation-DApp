import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Admin.css';
import { web3Client } from './web3/client';
import AppHeader from './components/AppHeader';
import { ethers } from 'ethers';

const Admin = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [properties, setProperties] = useState([]);
  const [trades, setTrades] = useState([]);
  const [users, setUsers] = useState([]);
  const [web3Info, setWeb3Info] = useState({ account: null, chainId: null, error: null });
  const [form, setForm] = useState({
    title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', image: ''
  });
  const [propMsg, setPropMsg] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');
  const [previewImg, setPreviewImg] = useState('');
  const [divForm, setDivForm] = useState({ propertyId: '', amountEth: '' });
  const [divMsg, setDivMsg] = useState('');
  
  const handleClearLocalDrafts = () => {
    if (!window.confirm('Clear local drafts (entries without on-chain tokens)? This cannot be undone.')) return;
    const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
    const keep = (localProps || []).filter(p => (p.tokenAddress || p.onchainId));
    const keepIds = new Set(keep.map(p => p.id));
    const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    const cleanedArchivedIds = (archivedIds || []).filter(id => keepIds.has(id));
    localStorage.setItem('archivedPropertyIds', JSON.stringify(cleanedArchivedIds));
    localStorage.setItem('properties', JSON.stringify(keep));
    setProperties(keep.filter(p => !p.archivedLocal));
    setDeleteMsg('Cleared local drafts.');
    setTimeout(() => setDeleteMsg(''), 2500);
  };

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      alert('Admin access required');
      navigate('/');
      return;
    }
    const u = JSON.parse(userStr);
    if (!u.isAdmin) {
      alert('Admin access required');
      navigate('/');
      return;
    }
    setUser(u);
  const localProps = JSON.parse(localStorage.getItem('properties') || '[]');
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  // Only show on-chain backed items on initial paint; hide local-only drafts
  setProperties(
    localProps.filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.tokenAddress || p.onchainId))
  );
    setTrades(JSON.parse(localStorage.getItem('trades') || '[]'));
    setUsers(JSON.parse(localStorage.getItem('users') || '[]'));

    // Initialize wallet connection (non-blocking)
    (async () => {
      try {
        const info = await web3Client.connect();
        setWeb3Info({ account: info.account, chainId: info.chainId, error: null });
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
              rentalYield: lp?.rentalYield ?? '',
              annualReturn: lp?.annualReturn ?? ''
            };
          }).filter(p => !p.archivedLocal);
          // Exclude local-only drafts by default to avoid phantom items unless explicitly needed
          const allActive = [...merged];
          setProperties(allActive);
          localStorage.setItem('properties', JSON.stringify([...allActive, ...archived]));
        } catch {}
      } catch (e) {
        setWeb3Info({ account: null, chainId: null, error: e?.message || String(e) });
      }
    })();
  }, [navigate]);

  // Property creation
  const handleImageUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      setForm(f => ({ ...f, image: evt.target.result }));
      setPreviewImg(evt.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProperty = async () => {
    const { title, address, rentalYield, annualReturn, totalShares, sharePrice, image } = form;
    if (!title || !address || !rentalYield || !annualReturn || !totalShares || !sharePrice || !image) {
      setPropMsg('Complete all fields and upload image.');
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
      setPropMsg('Creating property on-chain...');
      const { receipt, propertyId, token } = await web3Client.createProperty({
        name: `${title} Shares`,
        symbol: title.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'PROP',
        metadataURI: 'ipfs://placeholder',
        totalShares: Number(totalShares),
        sharePriceWei: ethers.parseEther(String(sharePrice)),
        owner: (await web3Client.signer.getAddress())
      });
      console.log('createProperty', { receipt, propertyId, token });
      if (propertyId !== undefined && token) {
        setPropMsg(`Created on-chain: #${propertyId} token ${token.slice(0,6)}...${token.slice(-4)}`);
        // Reload from chain and merge with UI metadata for the created property
        const chainProps = await web3Client.getProperties(0, 200);
        const merged = chainProps.map(cp => {
          const isNew = Number(cp.id) === Number(propertyId);
          const lp = isNew ? { title, address, image, rentalYield: Number(rentalYield), annualReturn: Number(annualReturn) } : (properties.find(x => x.id === cp.id) || {});
          return {
            id: cp.id,
            tokenAddress: cp.tokenAddress || cp.token,
            onchainId: cp.id,
            totalShares: cp.totalShares,
            availableShares: cp.availableShares ?? lp?.availableShares ?? cp.totalShares,
            sharePrice: cp.sharePrice,
            active: cp.active,
            metadataURI: cp.metadataURI,
            title: lp?.title || `Property #${cp.id}`,
            address: lp?.address || '',
            image: lp?.image || '',
            rentalYield: lp?.rentalYield ?? '',
            annualReturn: lp?.annualReturn ?? ''
          };
        });
        setProperties(merged);
        localStorage.setItem('properties', JSON.stringify(merged));
      } else {
        setPropMsg('On-chain create confirmed, but event not parsed.');
      }
    } catch (e) {
      console.error(e);
      setPropMsg('On-chain create failed. See console.');
      return;
    }
    setForm({ title: '', address: '', rentalYield: '', annualReturn: '', totalShares: '', sharePrice: '', image: '' });
    setPreviewImg('');
  // Small delay to let the node index the event, then go marketplace
  setTimeout(() => navigate('/marketplace'), 600);
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
          rentalYield: lp?.rentalYield ?? '',
          annualReturn: lp?.annualReturn ?? ''
        };
        return out;
      }).filter(p => !p.archivedLocal);
      localStorage.setItem('properties', JSON.stringify([...merged, ...archived]));
      setProperties(merged);
    } catch {
      localStorage.setItem('properties', JSON.stringify(updated));
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
    localStorage.setItem('properties', JSON.stringify(localProps));
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
          rentalYield: lp?.rentalYield ?? '',
          annualReturn: lp?.annualReturn ?? ''
        };
      }).filter(p => !p.archivedLocal);
      localStorage.setItem('properties', JSON.stringify([...merged, ...archived]));
      setProperties(merged);
      setDeleteMsg(`Property "${propTitle}" restored.`);
    } catch {}
  };

  // Deposit dividends on-chain
  const handleDepositDividends = async () => {
    if (!divForm.propertyId || !divForm.amountEth) {
      setDivMsg('Select property and amount.');
      return;
    }
    try {
      await web3Client.connect();
      const amountWei = ethers.parseEther(String(divForm.amountEth));
      await web3Client.depositDividends({ propertyId: Number(divForm.propertyId), amountWei });
      setDivMsg('Dividends deposited.');
    } catch (e) {
      console.error(e);
      setDivMsg('Deposit failed.');
    }
    setTimeout(() => setDivMsg(''), 2500);
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
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Property name (e.g. Damansara Villa)" />
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Address (e.g. No. 12, Jalan Damansara, 47800 Petaling Jaya, Selangor)" />
              <input value={form.rentalYield} type="number" step="0.01" onChange={e => setForm(f => ({ ...f, rentalYield: e.target.value }))} placeholder="Rental Yield (%)" />
              <input value={form.annualReturn} type="number" step="0.01" onChange={e => setForm(f => ({ ...f, annualReturn: e.target.value }))} placeholder="Projected Annual Return (%)" />
              <input value={form.totalShares} type="number" onChange={e => setForm(f => ({ ...f, totalShares: e.target.value }))} placeholder="Total shares (e.g. 10000)" />
              <input value={form.sharePrice} type="number" step="0.0001" onChange={e => setForm(f => ({ ...f, sharePrice: e.target.value }))} placeholder="Price per share (ETH)" />
              <label htmlFor="imageUpload">House image:</label>
              <input id="imageUpload" type="file" accept="image/*" onChange={handleImageUpload} />
              {previewImg && <img src={previewImg} alt="Preview" style={{ width: '100%', maxWidth: 320, margin: '12px 0', borderRadius: 12 }} />}
              <button onClick={handleCreateProperty}>Create property</button>
              <div className="small">{propMsg}</div>
            </div>
            <div className="card">
              <h3>Delete Property</h3>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button className="btn" style={{ background: '#6b7280' }} onClick={handleClearLocalDrafts}>Clear local drafts</button>
              </div>
              <div>
                {properties.length === 0 ? (
                  <div>No properties available.</div>
                ) : (
                  properties.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, background: '#fff', padding: 10, borderRadius: 8, boxShadow: '0 1px 6px rgba(70,54,227,0.07)' }}>
                      <img src={p.image} alt={p.title} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#4636e3' }}>{p.title}</div>
                        <div style={{ fontSize: '0.98rem', color: '#444' }}>{p.address}</div>
                      </div>
                      <button className="btn" style={{ background: '#e34c4c' }} onClick={() => handleDeleteProperty(p.id)}>Delete</button>
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
                      <img src={p.image} alt={p.title} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#4636e3' }}>{p.title || `Property #${p.id}`}</div>
                        <div style={{ fontSize: '0.98rem', color: '#444' }}>{p.address || ''}</div>
                      </div>
                      <button className="btn" style={{ background: '#10b981' }} onClick={() => handleRestoreProperty(p.id)}>Restore</button>
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
              <button onClick={handleDepositDividends}>Deposit Dividends</button>
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
