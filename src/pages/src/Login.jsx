
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';
import { web3Client } from './web3/client';

// MetaMask connection helper via centralized web3Client
const connectMetaMask = async () => {
  try {
    const res = await web3Client.connect();
    return res?.account;
  } catch (error) {
    alert(error?.message || 'MetaMask connection failed.');
    return null;
  }
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [userAddress, setUserAddress] = useState('');
  const navigate = useNavigate();

  // Initialize default users if not exist
  React.useEffect(() => {
    if (!localStorage.getItem('users')) {
      const users = [
        { id: 1, email: 'admin@dapp', password: 'admin123', name: 'Admin', isAdmin: true }
      ];
      localStorage.setItem('users', JSON.stringify(users));
    }
  }, []);

  const handleAdminLogin = () => {
    setShowAdmin(true);
  };

  const handleUserLogin = async () => {
    const address = await connectMetaMask();
    if (address) {
      setUserAddress(address);
      setShowAdmin(false);
  localStorage.setItem('currentUser', JSON.stringify({ address, isAdmin: false, type: 'wallet' }));
      navigate('/');
    }
  };

  const handleLogin = () => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const u = users.find(x => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password);
    if (!u) {
      alert('Invalid credentials.');
      return;
    }
  localStorage.setItem('currentUser', JSON.stringify({ ...u, type: 'admin' }));
    navigate('/');
  };

  return (
    <div className="login-root">
      <div className="card" style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute',
          top: 16,
          right: 16,
          fontSize: '1.7rem',
          color: '#4f46e5',
          cursor: 'pointer',
          zIndex: 2
        }}
          title={showAdmin ? "Back to Login Options" : "Back to Home"}
          onClick={() => {
            if (showAdmin) {
              setShowAdmin(false);
            } else {
              navigate('/');
            }
          }}
        >
          &times;
        </span>
        <h2 style={{ textAlign: 'center', margin: '0 0 18px 0', fontWeight: 600, fontSize: '2rem', color: '#222' }}>Login</h2>

        {!showAdmin && !userAddress && (
          <div className="login-options" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
            <button onClick={handleAdminLogin}>Admin Login</button>
            <button onClick={handleUserLogin}>User Login (MetaMask)</button>
          </div>
        )}

        {showAdmin && (
          <>
            <div style={{ marginBottom: '12px', fontSize: 13, color: '#666' }}>
              Demo admin: <code>admin@dapp</code> / <code>admin123</code>
            </div>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
            />
            <button onClick={handleLogin}>Login as Admin</button>
            {/* Register link removed as requested */}
          </>
        )}

        {userAddress && (
          <div className="user-info" style={{ marginTop: '20px', textAlign: 'center' }}>
            <p>Connected with MetaMask!</p>
            <p>Wallet Address: {userAddress}</p>
          </div>
        )}
      </div>
    </div>
  );
}
