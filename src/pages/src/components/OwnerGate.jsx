import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { web3Client } from '../web3/client';

export default function OwnerGate({ children }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [account, setAccount] = useState('');
  const [owner, setOwner] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  const short = (a) => (a && a.startsWith('0x') ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || '—');

  const check = async (triggerConnect = false) => {
    setError('');
    try {
      if (triggerConnect) {
        await web3Client.connect();
      }
      // Try to get addresses; connect if needed when fetching owner
      const acct = await web3Client.getAccount();
      let own = '';
      try { own = await web3Client.getMarketplaceOwner(); } catch (e) { throw e; }
      setAccount(acct || '');
      setOwner(own || '');
      const match = acct && own && acct.toLowerCase() === own.toLowerCase();
      setIsOwner(Boolean(match));
    } catch (e) {
      setError(e?.message || 'Unable to verify owner access.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Attempt a passive check; if not connected, this will likely defer until user clicks Connect/Switch
    (async () => { await check(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectSwitch = async () => {
    setLoading(true);
    await check(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-6 text-center">
            <div className="text-sm text-gray-500">Checking wallet access…</div>
          </div>
        </div>
      </div>
    );
  }

  if (isOwner) return children;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-6">
          <h2 className="text-xl font-semibold text-violet-700 mb-2">Owner access required</h2>
          <p className="text-sm text-gray-600 mb-4">
            Please switch to the Marketplace owner wallet to access this page.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-gray-500">Current wallet</div>
              <div className="font-mono">{short(account)}</div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 border">
              <div className="text-gray-500">Required owner</div>
              <div className="font-mono">{short(owner)}</div>
            </div>
          </div>
          {error ? (
            <div className="text-red-600 text-sm mb-3">{error}</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleConnectSwitch}
            >
              Connect / Switch Wallet
            </button>
            <button
              className="px-4 py-2 rounded-lg border"
              onClick={() => check(false)}
            >
              Refresh
            </button>
            <button
              className="px-4 py-2 rounded-lg border"
              onClick={() => navigate('/status')}
            >
              Open System Status
            </button>
            <button
              className="px-4 py-2 rounded-lg border"
              onClick={() => navigate('/')}
            >
              Back Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
