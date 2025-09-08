import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Profile.css';
import { web3Client } from './web3/client';

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [ownership, setOwnership] = useState([]);
  const [properties, setProperties] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dividendPools, setDividendPools] = useState([]);
  const [dividendMsg, setDividendMsg] = useState('');
  const [onchainHoldings, setOnchainHoldings] = useState([]);
  const [onchainTx, setOnchainTx] = useState([]);

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      alert('Please login to view your profile.');
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userStr));
  const props = JSON.parse(localStorage.getItem('properties') || '[]');
  const archivedIds = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  const filteredProps = (props || []).filter(p => !p.archivedLocal && !archivedIds.includes(p.id) && (p.active === undefined || p.active));
  setOwnership(JSON.parse(localStorage.getItem('ownership') || '[]'));
  setProperties(filteredProps);
    setTransactions(JSON.parse(localStorage.getItem('transactions') || '[]'));
    (async () => {
      try {
        const { account } = await web3Client.connect();
  const chainPropsAll = await web3Client.getProperties(0, 50);
  const archivedIds2 = JSON.parse(localStorage.getItem('archivedPropertyIds') || '[]');
  const chainProps = (chainPropsAll || []).filter(cp => cp.active && !archivedIds2.includes(cp.id));
  if (chainProps && chainProps.length) setProperties(chainProps);
  const holdings = await web3Client.getHoldings(account, chainProps.length ? chainProps : filteredProps);
        setOnchainHoldings(holdings);
        const tx = await web3Client.getUserTransactions(account);
        setOnchainTx(tx);
      } catch (e) {
        console.log('on-chain profile data not available', e);
      }
    })();
    setDividendPools(JSON.parse(localStorage.getItem('dividendPools') || '[]'));
  }, [navigate]);

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

  if (!user) return null;

  // Properties owned (off-chain fallback)
  const userProps = ownership.filter(o => o.userId === user.id && o.shares > 0);

  // Transactions (prefer on-chain)
  const userTx = onchainTx.length ? onchainTx : transactions.filter(t => t.userId === user.id);

  // Dividends
  const dividends = userProps.map(o => {
    const pool = dividendPools.find(p => p.propertyId === o.propertyId);
    const prop = properties.find(p => p.id === o.propertyId);
    if (!pool || !prop) return null;
    const totalShares = prop.totalShares || prop.availableShares || 1;
    const userDividend = Math.round((pool.amount * (o.shares / totalShares)) * 100) / 100;
    return {
      property: prop.title,
      shares: o.shares,
      totalShares,
      pool: pool.amount,
      userDividend
    };
  }).filter(Boolean);

  return (
    <>
      <header className="header">
        <div className="logo">RealEstate dApp</div>
        <nav className="nav">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="/marketplace" className="nav-link">Marketplace</Link>
          {user && !user.isAdmin && (
            <Link to="/profile" className="nav-link">Profile</Link>
          )}
          {user && user.isAdmin && (
            <Link to="/admin" className="nav-link">Admin</Link>
          )}
            <Link to="/about_us" className="nav-link">About Us</Link>
          {!user ? (
            <Link to="/login" className="btn-login">Login</Link>
          ) : (
            <button className="btn-login" onClick={() => {
              localStorage.removeItem('currentUser');
              navigate('/');
            }}>Logout</button>
          )}
        </nav>
      </header>
      <main>
        <div className="profile-container">
          <div className="profile-title">User Profile</div>
          <div className="profile-avatar">{user.name ? user.name[0].toUpperCase() : 'U'}</div>
          <div className="profile-section">
            <span className="profile-label">Name:</span> <span className="profile-value">{user.name || '-'}</span><br />
            <span className="profile-label">Email:</span> <span className="profile-value">{user.email || '-'}</span><br />
          </div>
          <div className="profile-section">
            <div className="profile-label" style={{ marginBottom: 8 }}>Your Properties & Shares</div>
            <table className="profile-table">
              <thead>
                <tr><th>Property</th><th>Shares Owned</th><th>Share Value (ETH)</th></tr>
              </thead>
              <tbody>
                {userProps.length === 0 && onchainHoldings.length === 0 ? (
                  <tr><td colSpan={3}>No shares owned.</td></tr>
                ) : (
                  (onchainHoldings.length ? onchainHoldings.map(o => {
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
            <table className="profile-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Property</th><th>Shares</th><th>Amount (ETH)</th></tr>
              </thead>
              <tbody>
                {userTx.length === 0 ? (
                  <tr><td colSpan={5}>No transactions found.</td></tr>
                ) : (
                  userTx.map((t, idx) => {
                    const prop = properties.find(p => p.id === t.propertyId);
                    return (
                      <tr key={idx}>
                        <td>{new Date(t.timestamp).toLocaleString()}</td>
                        <td>{t.type}</td>
                        <td>{prop ? prop.title : '-'}</td>
                        <td>{t.shares || '-'}</td>
                        <td>{t.amount || '-'}</td>
                      </tr>
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
                <tr><th>Property</th><th>Your Shares</th><th>Total Shares</th><th>Dividend Pool (USD)</th><th>Your Dividend (USD)</th></tr>
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
                      <td>${d.pool}</td>
                      <td>${d.userDividend}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 12, color: '#4636e3', fontWeight: 500 }}>{dividendMsg}</div>
            <button className="claim-div-btn" style={{ marginTop: 18 }} onClick={handleClaimDividends}>Claim Dividends</button>
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
