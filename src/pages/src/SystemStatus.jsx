import React, { useEffect, useState } from 'react';
import AppHeader from './components/AppHeader';
import { web3Client } from './web3/client';
import { getNftStorageToken, getWeb3StorageToken } from './web3/ipfs';

const Row = ({ label, value, ok, help }) => (
  <div className="flex items-start justify-between border-b border-white/10 py-2">
    <div className="text-white/80">{label}</div>
    <div className="text-right">
      <div className={ok === false ? 'text-red-300' : 'text-white'}>{value}</div>
      {help ? <div className="text-xs text-white/60">{help}</div> : null}
    </div>
  </div>
);

export default function SystemStatus() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState({ loading: true });

  useEffect(() => {
    const userStr = localStorage.getItem('currentUser');
    setUser(userStr ? JSON.parse(userStr) : null);
  }, []);

  useEffect(() => {
    (async () => {
      const out = { loading: true };
      try {
        await web3Client.connect();
        const [net, mktAddr, regAddr, mktOwner, regOwner] = await Promise.all([
          web3Client.provider.getNetwork(),
          web3Client.getMarketplaceAddress(),
          web3Client.getRegistryAddress(),
          web3Client.getMarketplaceOwner(),
          web3Client.getRegistryOwner(),
        ]);
        out.chainId = net.chainId?.toString?.() || String(net.chainId);
        const codeMkt = await web3Client.provider.getCode(mktAddr);
        const codeReg = await web3Client.provider.getCode(regAddr);
        out.contractsOk = codeMkt !== '0x' && codeReg !== '0x';
        out.mktAddr = mktAddr;
        out.regAddr = regAddr;
        out.mktOwner = mktOwner;
        out.regOwner = regOwner;
        out.ownershipOk = (regOwner && mktAddr) ? (regOwner.toLowerCase() === mktAddr.toLowerCase()) : false;
      } catch (e) {
        out.error = e?.message || String(e);
      }
      try {
        out.nftToken = getNftStorageToken() ? 'set' : 'missing';
        out.web3Token = getWeb3StorageToken() ? 'set' : 'missing';
      } catch {}
      out.loading = false;
      setStatus(out);
    })();
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#050721' }}>
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 text-white">
        <h1 className="text-2xl font-semibold">System Status</h1>
        {status.loading ? (
          <div className="mt-4 rounded-lg bg-white/5 h-40 animate-pulse" />
        ) : (
          <div className="mt-4 rounded-lg bg-white/5 p-4">
            {status.error && (
              <div className="mb-3 rounded bg-red-500/20 p-2 text-red-200 text-sm">{status.error}</div>
            )}
            <Row label="Chain ID" value={status.chainId || '—'} ok={status.chainId === '1337'} help="Expect 1337 (Ganache)" />
            <Row label="Marketplace address" value={status.mktAddr || '—'} ok={status.contractsOk} />
            <Row label="Registry address" value={status.regAddr || '—'} ok={status.contractsOk} />
            <Row label="Contracts code at address" value={status.contractsOk ? 'OK' : 'Missing'} ok={status.contractsOk} />
            <Row label="Registry owned by Marketplace" value={status.ownershipOk ? 'Yes' : 'No'} ok={status.ownershipOk} />
            <Row label="Marketplace owner" value={status.mktOwner || '—'} ok />
            <Row label="Registry owner" value={status.regOwner || '—'} ok />
            <Row label="nft.storage token" value={status.nftToken} ok={status.nftToken === 'set'} help="Set NFT_STORAGE_TOKEN in localStorage or Vite env" />
            <Row label="web3.storage token" value={status.web3Token} ok={status.web3Token === 'set'} />
          </div>
        )}
      </main>
    </div>
  );
}
