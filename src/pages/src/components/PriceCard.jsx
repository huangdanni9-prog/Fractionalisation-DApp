import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { ethers } from 'ethers';
import { web3Client } from '../web3/client';

const PRIMARY = '#6D47FF';
const LAVENDER = '#F1EEFF';

export default function PriceCard({ property, onSuccess }) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('idle'); // idle|pending|success|error
  const [message, setMessage] = useState('');
  const [usd, setUsd] = useState('');
  const [tokens, setTokens] = useState('');

  const sharePriceUsd = useMemo(() => {
    // property.sharePrice is in ETH in this project; assume 1 ETH = 3000 USD mock
    const eth = Number(property?.sharePrice || 0.001);
    return eth * 3000;
  }, [property?.sharePrice]);

  const updateFromUsd = (v) => {
    setUsd(v);
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) { setTokens(''); return; }
    setTokens(String((n / sharePriceUsd).toFixed(4)));
  };
  const updateFromTokens = (v) => {
    setTokens(v);
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) { setUsd(''); return; }
    setUsd(String((n * sharePriceUsd).toFixed(2)));
  };

  async function ensureConnected() {
    try {
      const res = await web3Client.connect();
      setConnected(Boolean(res?.account));
      return true;
    } catch (e) {
      setConnected(false);
      setStatus('error');
      setMessage(e?.message || 'Wallet connection failed');
      return false;
    }
  }

  async function transact(kind) {
    const ok = connected || (await ensureConnected());
    if (!ok) return;
    const amount = Number(tokens);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('error');
      setMessage('Enter a valid amount');
      return;
    }
    setStatus('pending');
    setMessage(kind === 'buy' ? 'Submitting buy…' : 'Submitting sell…');
    try {
      if (kind === 'buy') {
        const receipt = await web3Client.buyShares({
          propertyId: property?.id || 0,
          token: property?.tokenAddress || property?.token,
          amount: Math.floor(amount),
          pricePerShareWei: ethers.parseEther(String(property?.sharePrice || 0.001)),
        });
        setStatus('success');
        setMessage(`Success. Tx: ${receipt?.hash || receipt?.transactionHash}`);
        onSuccess?.(receipt);
      } else {
        const receipt = await web3Client.createListing({
          token: property?.tokenAddress || property?.token,
          propertyId: property?.id || 0,
          amount: Math.floor(amount),
          pricePerShareWei: ethers.parseEther(String(property?.sharePrice || 0.001)),
        });
        setStatus('success');
        setMessage(`Listed. Tx: ${receipt?.hash || receipt?.transactionHash}`);
        onSuccess?.(receipt);
      }
    } catch (e) {
      setStatus('error');
      setMessage(e?.reason || e?.message || 'Transaction failed');
    }
  }

  const estPayoutDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toLocaleDateString();
  }, []);

  return (
    <aside className="lg:sticky lg:top-24" aria-label="Trading card">
      <div className="overflow-hidden rounded-2xl bg-white text-[#050721] shadow">
        <div className="px-5 py-4" style={{ background: LAVENDER }}>
          <div className="flex items-center justify-between">
            <h3 className="text-[#050721]/70 font-medium">Starting Price</h3>
            <div className="text-2xl font-bold">${sharePriceUsd.toFixed(2)}</div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <KpiRow label="Projected Annual Return" value="9.13%" />
          <KpiRow label="Projected Rental Yield" value="6.26%" />
          <KpiRow label="Rental Yield" value="6.26%" />

          <div className="mt-4 grid grid-cols-2 gap-3" role="group" aria-label="Order inputs">
            <LabeledInput label="USD" value={usd} onChange={updateFromUsd} placeholder="0.00" ariaLabel="Amount in USD" />
            <LabeledInput label="Tokens" value={tokens} onChange={updateFromTokens} placeholder="0" ariaLabel="Number of tokens" />
          </div>

          <p className="text-sm text-[#050721]/70">Cost preview: <span className="font-semibold">${Number(usd || 0).toFixed(2)}</span></p>
          <p className="text-xs text-[#050721]/60">Your first estimated payout date is {estPayoutDate}.</p>

          <div className="mt-3 grid grid-cols-2 gap-3" role="group" aria-label="Actions">
            <button
              onClick={() => transact('buy')}
              className="rounded-xl bg-[#6D47FF] px-4 py-2 font-medium text-white hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#6D47FF]"
            >
              Buy
            </button>
            <button
              onClick={() => transact('sell')}
              className="rounded-xl border border-[#6D47FF] px-4 py-2 font-medium text-[#6D47FF] hover:bg-[#6D47FF]/10 focus:outline-none focus:ring-2 focus:ring-[#6D47FF]"
            >
              Sell
            </button>
          </div>

          {!connected && (
            <button
              onClick={ensureConnected}
              className="mt-2 w-full rounded-lg bg-black/80 px-4 py-2 text-white hover:bg-black"
              aria-label="Connect your wallet"
            >
              Connect Wallet
            </button>
          )}

          <Status status={status} message={message} />
        </div>
      </div>
    </aside>
  );
}

function KpiRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[#050721]/70">{label}</span>
      <span className="font-semibold" style={{ color: PRIMARY }}>{value}</span>
    </div>
  );
}

KpiRow.propTypes = { label: PropTypes.string, value: PropTypes.string };

function LabeledInput({ label, ariaLabel, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col text-sm">
      <span className="text-[#050721]/70">{label}</span>
      <input
        aria-label={ariaLabel}
        className="mt-1 rounded-lg border border-black/10 px-3 py-2 outline-none focus:ring-2 focus:ring-[#6D47FF]"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

LabeledInput.propTypes = {
  label: PropTypes.string,
  ariaLabel: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
};

function Status({ status, message }) {
  if (status === 'idle') return null;
  const color = status === 'success' ? 'text-green-600' : status === 'error' ? 'text-red-600' : 'text-[#6D47FF]';
  return (
    <p className={`text-sm ${color}`} role="status" aria-live="polite">{message}</p>
  );
}

Status.propTypes = { status: PropTypes.string, message: PropTypes.string };

PriceCard.propTypes = {
  property: PropTypes.object,
  onSuccess: PropTypes.func,
};
