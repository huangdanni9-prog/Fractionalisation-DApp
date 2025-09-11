import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { web3Client } from '../web3/client';

export default function AppHeader({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [account, setAccount] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [chainLabel, setChainLabel] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Reflect live wallet connection (independent of app login)
  useEffect(() => {
    (async () => {
      try {
        const addr = await web3Client.getAccount();
        if (addr) {
          setAccount(addr);
          try {
            const owner = await web3Client.getMarketplaceOwner();
            setIsOwner(Boolean(owner && addr && owner.toLowerCase() === addr.toLowerCase()));
          } catch {}
          try {
            // Best-effort network label
            const desired = web3Client.getDesiredLocalChain?.();
            if (desired?.name) setChainLabel(desired.name);
          } catch {}
        }
      } catch {}
    })();
  }, []);
  // React to wallet changes without requiring a full page reload
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = async (accounts) => {
      const addr = Array.isArray(accounts) && accounts.length ? accounts[0] : '';
      setAccount(addr || '');
      try {
        const owner = await web3Client.getMarketplaceOwner();
        setIsOwner(Boolean(owner && addr && owner.toLowerCase() === addr.toLowerCase()));
      } catch { setIsOwner(false); }
    };
    const handleChainChanged = async () => {
      try {
        const net = await web3Client.provider?.getNetwork?.();
        if (net?.chainId) setChainLabel(`Chain ${net.chainId.toString()}`);
      } catch {}
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    return () => {
      try { window.ethereum.removeListener('accountsChanged', handleAccountsChanged); } catch {}
      try { window.ethereum.removeListener('chainChanged', handleChainChanged); } catch {}
    };
  }, []);
  const handleLogin = () => navigate('/login');
  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
    window.location.reload();
  };
  const connect = async () => {
    try {
      const { account } = await web3Client.connect();
      setAccount(account);
      try {
        const owner = await web3Client.getMarketplaceOwner();
        setIsOwner(Boolean(owner && account && owner.toLowerCase() === account.toLowerCase()));
      } catch {}
      try {
        const net = await web3Client.provider?.getNetwork?.();
        if (net?.chainId) setChainLabel(`Chain ${net.chainId.toString()}`);
      } catch {}
    } catch (e) {
  console.error(e);
  alert(e?.message || 'Wallet connect failed');
    }
  };
  const short = (a) => (a && a.startsWith('0x') ? `${a.slice(0,6)}...${a.slice(-4)}` : a || '—');
  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(()=>setCopied(false), 1000);
    } catch {}
  };
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="text-xl font-bold text-violet-700">RealEstate dApp</div>
        <nav className="hidden md:flex items-center gap-5 text-sm">
          <Link to="/" className="text-gray-700 hover:text-violet-700">Home</Link>
          <Link to="/marketplace" className="text-gray-700 hover:text-violet-700">Marketplace</Link>
          {(account || location.pathname.startsWith('/profile')) && (
            <Link to="/profile" className="text-gray-700 hover:text-violet-700">Profile</Link>
          )}
          {isOwner && (
            <Link to="/admin" className="text-gray-700 hover:text-violet-700">Admin</Link>
          )}
          <Link to="/about_us" className="text-gray-700 hover:text-violet-700">About Us</Link>
        </nav>
        <div className="flex items-center gap-3">
          {chainLabel ? (
            <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs border">
              {chainLabel}
            </span>
          ) : null}
          {!account ? (
            <button className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm" onClick={connect} aria-label="Connect wallet">
              Connect Wallet
            </button>
          ) : (
            <div className="relative">
              <button
                className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50"
                onClick={() => setMenuOpen(v=>!v)}
                aria-label="Wallet menu"
              >
                {short(account)}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-2 z-50">
                  <div className="px-3 py-2 text-xs text-gray-500">Connected wallet</div>
                  <div className="px-3 pb-2 font-mono text-sm">{account}</div>
                  <div className="flex gap-2 px-2 pb-2">
                    <button className="flex-1 px-2 py-1 rounded-lg bg-gray-100 text-sm" onClick={copyAddr}>{copied ? 'Copied' : 'Copy'}</button>
                    <button className="flex-1 px-2 py-1 rounded-lg bg-gray-100 text-sm" onClick={() => setMenuOpen(false)}>Close</button>
                  </div>
                  <div className="border-t my-2" />
                  <button
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm"
                    onClick={() => { setMenuOpen(false); navigate('/status'); }}
                  >
                    System Status
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
