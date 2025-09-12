import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';
import { web3Client } from './web3/client';
import { getPropertiesSafe } from './utils/safeLocalStorage';
import { ethers } from 'ethers';
import AppHeader from './components/AppHeader';

function resolveIpfs(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('ipfs://')) {
    const path = url.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${path}`;
  }
  return url;
}

async function fetchJsonMaybe(uri) {
  try {
    const res = await fetch(resolveIpfs(uri));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function attr(obj, key) {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const attrs = Array.isArray(obj.attributes) ? obj.attributes : [];
  const hit = attrs.find(a => (a.trait_type || a.type || a.key) === key || (a.trait_type || '').toLowerCase() === key.toLowerCase());
  return hit ? (hit.value ?? hit.val ?? hit.content) : undefined;
}

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [ownership, setOwnership] = useState([]);
  const [properties, setProperties] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dividendPools, setDividendPools] = useState([]);
  const [pendingMap, setPendingMap] = useState({}); // propertyId -> wei
  const [dividendMsg, setDividendMsg] = useState('');
  const [onchainHoldings, setOnchainHoldings] = useState([]);
  const [onchainTx, setOnchainTx] = useState([]);
  const [divHistory, setDivHistory] = useState([]);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [expandedTx, setExpandedTx] = useState({}); // txHash -> boolean

  const loadOnchainData = async (filteredProps) => {
    try {
      const { account } = await web3Client.connect();
      const chainPropsAll = await web3Client.getProperties(0, 50);
      const archivedIds2 = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
      const chainProps = (chainPropsAll || []).filter(cp => cp.active && !archivedIds2.includes(cp.id));
      // Enrich with metadata so we show a human-friendly title instead of data: URI
      if (chainProps && chainProps.length) {
  const enriched = await Promise.all(chainProps.map(async (cp) => {
          const meta = cp.metadataURI ? await fetchJsonMaybe(cp.metadataURI) : null;
          const title = (meta?.name || meta?.title || attr(meta, 'title') || `Property #${cp.id}`);
          const address = (meta?.address || attr(meta, 'address') || '');
          const image = resolveIpfs(meta?.image || attr(meta, 'image'));
          const rentalYield = Number(attr(meta, 'rentalYield') ?? meta?.rentalYield ?? '') || '';
          const annualReturn = Number(attr(meta, 'annualReturn') ?? meta?.annualReturn ?? '') || '';
          return { ...cp, title, address, image, rentalYield, annualReturn };
        }));
        setProperties(enriched);
      }
  const holdings = await web3Client.getHoldings(account, chainProps.length ? chainProps : filteredProps);
      setOnchainHoldings(holdings);
      // Dividend history
      try {
        const hist = await web3Client.getDividendHistory(account, chainProps.length ? chainProps : filteredProps);
        setDivHistory(hist);
      } catch {}
      // Load pending dividends per property for this account
      try {
        const pendEntries = await Promise.all((chainProps.length ? chainProps : filteredProps).map(async (cp) => {
          if (!cp || (!cp.token && !cp.tokenAddress)) return [cp?.id, '0'];
          const weiStr = await web3Client.getPendingDividends({ token: cp.token || cp.tokenAddress, propertyId: cp.id, account });
          return [cp.id, (weiStr ?? '0')];
        }));
        const map = Object.fromEntries(pendEntries.filter(e => Array.isArray(e) && e[0] !== undefined));
        setPendingMap(map);
      } catch {}
      const tx = await web3Client.getUserTransactions(account);
      setOnchainTx(tx);
      // Persist a wallet-scoped cache to avoid cross-wallet mixing
      try {
        const key = `tx:${(account || '').toLowerCase()}`;
        localStorage.setItem(key, JSON.stringify(tx));
      } catch {}
    } catch (e) {
      console.log('on-chain profile data not available', e);
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    // If no stored user, allow wallet-only sessions to land here without redirect.
    // We'll render a connect prompt via header and keep the page visible.
    const parsed = userStr ? JSON.parse(userStr) : {};
    // If wallet-based user, hydrate fields from profiles[address]
    let name = parsed?.name || '';
    let email = parsed?.email || '';
    let avatar = parsed?.avatar || '';
    try {
      if (parsed?.address) {
        const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
        const prof = profiles[(parsed.address || '').toLowerCase()] || {};
        name = prof.name || name;
        email = prof.email || email;
        avatar = prof.avatar || avatar;
        parsed.name = name; parsed.email = email; parsed.avatar = avatar;
        localStorage.setItem('currentUser', JSON.stringify(parsed));
      }
    } catch {}
  setUser(parsed);
    setEditName(name);
    setEditEmail(email);
    setEditAvatar(avatar);
  const props = getPropertiesSafe();
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  const filteredProps = (props || []).filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.active === undefined || p.active));
  setOwnership(JSON.parse(localStorage.getItem('ownership') || '[]'));
  setProperties(filteredProps);
    // Load wallet-scoped cached tx if present; else fallback to legacy global tx for non-wallet users
    try {
      if (parsed?.address) {
        const key = `tx:${(parsed.address || '').toLowerCase()}`;
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(cached) && cached.length) setOnchainTx(cached);
      }
    } catch {}
    setTransactions(JSON.parse(localStorage.getItem('transactions') || '[]'));
    loadOnchainData(filteredProps);
    setDividendPools(JSON.parse(localStorage.getItem('dividendPools') || '[]'));
  }, [navigate]);

  // React to transaction cache updates (emitted by PriceCard after successful tx)
  useEffect(() => {
    const handler = async (e) => {
      try {
        const addr = e?.detail?.address;
        if (!addr) return;
        const key = `tx:${addr.toLowerCase()}`;
        const cached = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(cached)) setOnchainTx(cached);
      } catch {}
    };
    window.addEventListener('tx-cache-updated', handler);
    return () => window.removeEventListener('tx-cache-updated', handler);
  }, []);

  const refreshTransactions = async () => {
  const props = getPropertiesSafe();
    const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
    const filteredProps = (props || []).filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.active === undefined || p.active));
    await loadOnchainData(filteredProps);
  };

  const handleClaimAll = async () => {
    try {
      await web3Client.connect();
      const propsToClaim = (properties || []).filter(p => Number(pendingMap[p.id] || 0) > 0 && (p.token || p.tokenAddress));
      for (const p of propsToClaim) {
        await web3Client.claimDividends({ token: p.token || p.tokenAddress, propertyId: p.id });
      }
      setDividendMsg('Claimed all pending dividends.');
      setTimeout(() => setDividendMsg(''), 2500);
      await refreshTransactions();
    } catch (e) {
      console.error(e);
      setDividendMsg('Claim all failed.');
      setTimeout(() => setDividendMsg(''), 2500);
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result;
      if (typeof dataUrl === 'string') setEditAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = () => {
    if (!user) return;
    const updated = { ...user, name: editName?.trim() || '', email: editEmail?.trim() || '', avatar: editAvatar || '' };
    localStorage.setItem('currentUser', JSON.stringify(updated));
    // Persist per-address profile for wallet users
    try {
      if (updated.address) {
        const key = (updated.address || '').toLowerCase();
        const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
        profiles[key] = { name: updated.name, email: updated.email, avatar: updated.avatar };
        localStorage.setItem('profiles', JSON.stringify(profiles));
      }
    } catch {}
    // Also update in users[] if present (match by id or email)
    try {
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      let changed = false;
      const next = users.map(u => {
        if ((user.id && u.id === user.id) || (user.email && u.email === user.email)) {
          changed = true;
          return { ...u, name: updated.name, email: updated.email, avatar: updated.avatar };
        }
        return u;
      });
      if (!changed && !user.isAdmin && (updated.email || updated.name)) {
        // For MetaMask logins that had no entry, append a minimal record
        next.push({ id: users.length ? Math.max(...users.map(x => x.id || 0)) + 1 : 1, email: updated.email || '', name: updated.name || '', avatar: updated.avatar || '' });
      }
      localStorage.setItem('users', JSON.stringify(next));
    } catch {}
    setUser(updated);
    setSaveMsg('Profile saved');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const handleClaimDividends = async () => {
    try {
      await web3Client.connect();
      // For demo, claim for first property if exists
      const first = properties[0];
      if (!first) {
        setDividendMsg('No properties.');
        return;
      }
      await web3Client.claimDividends({ token: first.token || first.tokenAddress, propertyId: first.id || 0 });
      setDividendMsg('Dividends claimed on-chain.');
      setTimeout(() => setDividendMsg(''), 2500);
    } catch (e) {
      console.error(e);
      setDividendMsg('Claim failed.');
      setTimeout(() => setDividendMsg(''), 2500);
    }
  };

  // Don't short-circuit render when user is not yet loaded; render a lightweight UI instead.
  // Guard all user.* reads below with optional chaining.

  // Properties owned (off-chain fallback). For wallet sessions, prefer on-chain and hide global ownership to prevent cross-wallet mixing.
  const userProps = user?.address ? [] : (user?.id ? ownership.filter(o => o.userId === user.id && o.shares > 0) : []);
  // On-chain holdings: show only properties with a non-zero balance
  const nonZeroHoldings = (onchainHoldings || []).filter(h => Number(h?.balance || 0) > 0);

  // Transactions: prefer on-chain if available, even if not in a wallet session
  const userTx = (onchainTx && onchainTx.length)
    ? onchainTx
    : (user?.address ? [] : (user?.id ? transactions.filter(t => t.userId === user.id) : []));

  // Group related events by transaction (txHash) and select a primary event per tx
  const groupedTx = useMemo(() => {
    if (!Array.isArray(userTx) || !userTx.length) return [];
    const map = new Map();
    for (const e of userTx) {
      const key = e.txHash || `blk:${e.blockNumber}:${e.logIndex}:${e.type}`;
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    const priority = { buy: 4, sell: 4, list: 3, claim: 3, mint: 2, receive: 2, send: 2 };
    const groups = [];
    for (const [txHash, evs] of map.entries()) {
      const sorted = [...evs].sort((a, b) =>
        (Number(a.blockNumber || 0) - Number(b.blockNumber || 0)) ||
        (Number(a.transactionIndex || 0) - Number(b.transactionIndex || 0)) ||
        (Number(a.logIndex || 0) - Number(b.logIndex || 0))
      );
      // choose primary with highest priority; fallback to first
      let primary = sorted[0];
      for (const e of sorted) {
        if ((priority[e.type] || 0) > (priority[primary.type] || 0)) primary = e;
      }
      const timestamp = primary.timestamp || sorted[0]?.timestamp || Date.now();
      const propertyId = primary.propertyId ?? (sorted.find(e => e.propertyId !== undefined)?.propertyId);
      // aggregate shares/eth for marketplace-like events; else for transfers
      const sumAmt = (types) => sorted
        .filter(e => types.includes(e.type))
        .reduce((acc, e) => acc + Number(e.amount || e.shares || 0), 0);
      const shares = sumAmt(['buy', 'sell', 'list']) || sumAmt(['mint', 'receive', 'send']) || '-';
      let totalWei = 0n;
      for (const e of sorted) {
        try {
          if ((e.type === 'buy' || e.type === 'sell' || e.type === 'list') && e.price !== undefined && e.amount !== undefined) {
            totalWei += (BigInt(e.price) * BigInt(e.amount));
          }
        } catch {}
      }
      const amountEth = totalWei > 0n ? ethers.formatEther(totalWei) : '-';
      groups.push({ txHash, primary, events: sorted, timestamp, propertyId, shares, amountEth });
    }
    groups.sort((a, b) =>
      (Number(b.primary.blockNumber || 0) - Number(a.primary.blockNumber || 0)) ||
      (Number(b.primary.transactionIndex || 0) - Number(a.primary.transactionIndex || 0)) ||
      (Number(b.primary.logIndex || 0) - Number(a.primary.logIndex || 0))
    );
    return groups;
  }, [userTx]);

  // Dividends
  // When using wallet, we prefer on-chain pending; legacy fallback kept for non-wallet users
  const dividends = (onchainHoldings.length
  ? (properties || []).map(p => {
    const balRec = onchainHoldings.find(h => h.propertyId === p.id);
    const pendingWeiStr = pendingMap[p.id] ?? '0';
    let pendingEth = '0';
    try { pendingEth = ethers.formatEther(BigInt(pendingWeiStr)); } catch {}
    // Hide rows where user has no balance and no pending
    if (!balRec && (!pendingWeiStr || pendingWeiStr === '0')) return null;
    return {
          property: p.title || p.metadataURI || `Property #${p.id}`,
          shares: balRec ? balRec.balance : 0,
          totalShares: p.totalShares || 0,
          pool: '-',
          userDividendEth: pendingEth,
          propertyId: p.id,
          token: p.token || p.tokenAddress
        };
      }).filter(Boolean)
    : userProps.map(o => {
        const pool = dividendPools.find(p => p.propertyId === o.propertyId);
        const prop = properties.find(p => p.id === o.propertyId);
        if (!pool || !prop) return null;
        const totalShares = prop.totalShares || prop.availableShares || 1;
        const userDividend = Math.round((pool.amount * (o.shares / totalShares)) * 100) / 100;
        return { property: prop.title, shares: o.shares, totalShares, pool: pool.amount, userDividend };
      }).filter(Boolean));

  return (
    <>
      <AppHeader user={user} />
      <main>
        <div className="profile-container">
          <div className="profile-title">User Profile</div>
          <div className="profile-avatar" style={{ overflow: 'hidden' }}>
            {(user?.avatar || editAvatar) ? (
              <img src={editAvatar || user?.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (user?.name ? user.name[0].toUpperCase() : 'U')
            )}
          </div>
          <div className="profile-section" style={{ display: 'grid', gap: 8 }}>
            <label className="profile-label">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" />
            <label className="profile-label" style={{ marginTop: 6 }}>Email</label>
            <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="you@example.com" />
            <label className="profile-label" style={{ marginTop: 6 }}>Profile picture</label>
            <input type="file" accept="image/*" onChange={handleAvatarUpload} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="claim-div-btn" onClick={handleSaveProfile}>Save Profile</button>
              <span style={{ color: '#4636e3', fontWeight: 500 }}>{saveMsg}</span>
            </div>
          </div>
          <div className="profile-section">
            <div className="profile-label" style={{ marginBottom: 8 }}>Your Properties & Shares</div>
            <table className="profile-table">
              <thead>
                <tr><th>Property</th><th>Shares Owned</th><th>Share Value (ETH)</th></tr>
              </thead>
              <tbody>
                {userProps.length === 0 && nonZeroHoldings.length === 0 ? (
                  <tr><td colSpan={3}>No shares owned.</td></tr>
                ) : (
                  (nonZeroHoldings.length ? nonZeroHoldings.map(o => {
                    const prop = properties.find(p => p.id === o.propertyId);
                    return (
                      <tr key={o.propertyId}>
                        <td>{prop ? prop.title || prop.metadataURI : '-'}</td>
                        <td>{o.balance}</td>
                        <td>{prop ? prop.sharePrice : '-'}</td>
                      </tr>
                    );
                  }) : userProps.map(o => {
                    const prop = properties.find(p => p.id === o.propertyId);
                    return (
                      <tr key={o.propertyId}>
                        <td>{prop ? prop.title : '-'}</td>
                        <td>{o.shares}</td>
                        <td>{prop ? prop.sharePrice : '-'}</td>
                      </tr>
                    );
                  }))
                )}
              </tbody>
            </table>
          </div>
          <div className="profile-section">
            <div className="profile-label" style={{ marginBottom: 8 }}>Transaction History</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button className="claim-div-btn" onClick={refreshTransactions}>Refresh</button>
            </div>
            <table className="profile-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Property</th><th>Shares</th><th>Amount (ETH)</th><th></th></tr>
              </thead>
              <tbody>
                {groupedTx.length === 0 ? (
                  <tr><td colSpan={6}>No transactions found.</td></tr>
                ) : (
                  groupedTx.map((g, idx) => {
                    const prop = properties.find(p => String(p.id) === String(g.propertyId));
                    const ts = g.timestamp ? new Date(g.timestamp) : new Date();
                    const open = !!expandedTx[g.txHash];
                    return (
                      <React.Fragment key={g.txHash || idx}>
                        <tr key={g.txHash || idx}>
                          <td>{ts.toLocaleString()}</td>
                          <td>{g.primary?.type || '-'}</td>
                          <td>{prop ? (prop.title || prop.metadataURI || `Property #${prop.id}`) : (g.propertyId ?? '-')}</td>
                          <td>{g.shares}</td>
                          <td>{g.amountEth}</td>
                          <td>
                            {g.events.length > 1 ? (
                              <button className="claim-div-btn" onClick={() => setExpandedTx(prev => ({ ...prev, [g.txHash]: !open }))}>
                                {open ? 'Hide' : 'Details'}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={6}>
                              <div style={{ padding: '8px 12px', background: '#f8f7ff', borderRadius: 8 }}>
                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Transaction details</div>
                                <table style={{ width: '100%', fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ textAlign: 'left' }}>
                                      <th>Type</th><th>Property</th><th>Shares</th><th>Amount (ETH)</th><th>Block</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.events.map((e, i) => {
                                      const p2 = properties.find(p => String(p.id) === String(e.propertyId));
                                      let eth = '-';
                                      try {
                                        if (e.price !== undefined && e.amount !== undefined && (e.type === 'buy' || e.type === 'sell' || e.type === 'list')) {
                                          eth = ethers.formatEther(BigInt(e.price) * BigInt(e.amount));
                                        } else if (e.amountEth) {
                                          eth = String(e.amountEth);
                                        }
                                      } catch {}
                                      const shares = (e.amount !== undefined && e.amount !== null) ? String(e.amount) : (e.shares ?? '-');
                                      return (
                                        <tr key={`${g.txHash}:${i}`}>
                                          <td>{e.type}</td>
                                          <td>{p2 ? (p2.title || p2.metadataURI || `Property #${p2.id}`) : (e.propertyId ?? '-')}</td>
                                          <td>{shares}</td>
                                          <td>{eth}</td>
                                          <td>{String(e.blockNumber ?? '')}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <div style={{ marginTop: 6, color: '#666' }}>
                                  Tx: <span className="mono">{g.txHash}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="profile-section">
            <div className="profile-label" style={{ marginBottom: 8 }}>Dividend Distribution</div>
            <table className="profile-table">
              <thead>
                <tr><th>Property</th><th>Your Shares</th><th>Total Shares</th><th>Pending (ETH)</th><th></th></tr>
              </thead>
              <tbody>
                {dividends.length === 0 ? (
                  <tr><td colSpan={5}>No dividends available.</td></tr>
                ) : (
                  dividends.map((d, idx) => (
                    <tr key={idx}>
                      <td>{d.property}</td>
                      <td>{d.shares}</td>
                      <td>{d.totalShares}</td>
            <td>{d.userDividendEth ?? '-'}</td>
                      <td>{d.token ? (() => {
                        let hasPending = false;
                        try { hasPending = (d.userDividendEth && Number(d.userDividendEth) > 0); } catch { hasPending = false; }
                        return (
                          <button
                            className="claim-div-btn"
                            disabled={!hasPending}
                            title={hasPending ? '' : 'No pending dividends to claim'}
                            onClick={async () => {
                        try {
                          await web3Client.claimDividends({ token: d.token, propertyId: d.propertyId });
                          setDividendMsg('Dividends claimed on-chain.');
                          setTimeout(() => setDividendMsg(''), 2500);
              await refreshTransactions();
                        } catch (e) {
                          console.error(e);
                          const msg = e?.shortMessage || e?.reason || e?.message || '';
                          if (msg && msg.toUpperCase().includes('NO_PENDING')) {
                            setDividendMsg('Claim failed: no pending dividends.');
                          } else {
                            setDividendMsg('Claim failed.');
                          }
                          setTimeout(() => setDividendMsg(''), 2500);
                        }
                      }}>Claim</button>
                        );
                      })() : null}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <div style={{ color: '#4636e3', fontWeight: 500 }}>{dividendMsg}</div>
              <button className="claim-div-btn" onClick={handleClaimAll}>Claim All</button>
            </div>
          </div>
          <div className="profile-section">
            <div className="profile-label" style={{ marginBottom: 8 }}>Dividend History</div>
            <table className="profile-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Property</th><th>Amount (ETH)</th></tr>
              </thead>
              <tbody>
                {divHistory.length === 0 ? (
                  <tr><td colSpan={4}>No dividend events.</td></tr>
                ) : (
                  divHistory.map((e, idx) => {
                    const prop = properties.find(p => String(p.id) === String(e.propertyId));
                    const eth = (() => { try { return ethers.formatEther(BigInt(e.amountWei || '0')); } catch { return '-'; } })();
                    const ts = e.timestamp ? new Date(e.timestamp) : new Date();
                    return (
                      <tr key={idx}>
                        <td>{ts.toLocaleString()}</td>
                        <td>{e.type}</td>
                        <td>{prop ? (prop.title || prop.metadataURI || `Property #${prop.id}`) : `#${e.propertyId}`}</td>
                        <td>{eth}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <footer className="profile-footer">
        <div>&copy; 2025 RealEstate dApp. All rights reserved.</div>
      </footer>
    </>
  );
};

export default Profile;
