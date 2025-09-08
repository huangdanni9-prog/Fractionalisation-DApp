import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { web3Client } from '../web3/client';

export default function AppHeader({ user }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
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
    } catch (e) {
      console.error(e);
      alert('Wallet connect failed');
    }
  };
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
        <div className="text-xl font-bold text-violet-700">RealEstate dApp</div>
        <nav className="hidden md:flex items-center gap-5 text-sm">
          <Link to="/" className="text-gray-700 hover:text-violet-700">Home</Link>
          <Link to="/marketplace" className="text-gray-700 hover:text-violet-700">Marketplace</Link>
          {user && !user.isAdmin && (
            <Link to="/profile" className="text-gray-700 hover:text-violet-700">Profile</Link>
          )}
          {user && user.isAdmin && (
            <Link to="/admin" className="text-gray-700 hover:text-violet-700">Admin</Link>
          )}
          <Link to="/about_us" className="text-gray-700 hover:text-violet-700">About Us</Link>
        </nav>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm" onClick={connect} aria-label="Connect wallet">
            {account ? account.slice(0,6)+'...'+account.slice(-4) : 'Connect Wallet'}
          </button>
          {!user ? (
            <button className="px-3 py-2 rounded-lg border text-sm" onClick={handleLogin}>Login</button>
          ) : (
            <button className="px-3 py-2 rounded-lg border text-sm" onClick={handleLogout}>Logout</button>
          )}
        </div>
      </div>
    </header>
  );
}
