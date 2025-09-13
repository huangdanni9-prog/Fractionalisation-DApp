import { ethers } from 'ethers';
import { networks } from './config';
import { resolveIpfsUrlToHttp } from './ipfs';

import registryAbi from './abi/PropertyRegistry.json';
import marketplaceAbi from './abi/Marketplace.json';
import factoryAbi from './abi/PropertyFactory.json';

export class Web3Client {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.registry = null;
    this.marketplace = null;
    this.marketplaceIface = null;
    this.factory = null;
  }

  // Determine desired local dev chain based on available addresses
  getDesiredLocalChain() {
    try {
      if (networks?.ganache?.marketplace && networks?.ganache?.registry) {
        return { label: 'ganache', chainIdHex: '0x539', name: 'Ganache 8545', rpc: 'http://127.0.0.1:8545' }; // 1337
      }
    } catch {}
    return { label: 'local', chainIdHex: '0x7a69', name: 'Localhost 8545', rpc: 'http://127.0.0.1:8545' }; // 31337
  }

  async ensureLocalhostNetwork() {
    if (!window.ethereum) throw new Error('MetaMask not found');
    const desired = this.getDesiredLocalChain();
    const target = desired.chainIdHex; // '0x7a69' (31337) or '0x539' (1337)
    const current = await window.ethereum.request({ method: 'eth_chainId' });
    if (current !== target) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: target }],
        });
      } catch (err) {
        if (err && err.code === 4902) {
          // Chain not added — add it
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: target,
              chainName: desired.name,
              // Provide multiple localhost variants to satisfy MetaMask
              rpcUrls: [desired.rpc, 'http://127.0.0.1:8545', 'http://localhost:8545'],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            }],
          });
          // Ensure we are actually switched after adding
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: target }],
          });
        } else {
          throw err;
        }
      }
    }
  }

  async connect() {
    if (!window.ethereum) throw new Error('No wallet');
    // Prefer localhost for development; auto-switch MetaMask
    try {
      await this.ensureLocalhostNetwork();
    } catch (e) {
      // Don’t proceed on the wrong chain; surface a clear action to the user
      const msg = (e && e.message) ? e.message : String(e || 'unknown');
      throw new Error(`Please switch to Ganache (chainId 1337). ${msg}`);
    }
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    const net = await this.provider.getNetwork();
  // Decide address set by chainId
    let chainName;
    if (net.chainId === 11155111n) chainName = 'sepolia';
    else if (net.chainId === 31337n) chainName = 'local';
    else if (net.chainId === 1337n) chainName = 'ganache';
    else {
      throw new Error(`Unsupported chainId ${net.chainId?.toString?.() || net.chainId}. Please switch to Ganache (1337) or Hardhat (31337).`);
    }
    // If Ganache addresses exist but user stayed on Hardhat, stop and guide them
    try {
      if (chainName === 'local' && networks?.ganache?.marketplace && networks?.ganache?.registry) {
        throw new Error('Detected Hardhat (31337) while Ganache addresses exist. Please switch MetaMask to Ganache (1337).');
      }
    } catch {}
    const cfg = networks[chainName] || {};
    if (!cfg.registry || !cfg.marketplace) throw new Error(`Missing addresses for chain '${chainName}'`);

    // Instantiate contracts
    this.registry = new ethers.Contract(cfg.registry, registryAbi, this.signer);
    this.marketplace = new ethers.Contract(cfg.marketplace, marketplaceAbi, this.signer);
    this.marketplaceIface = new ethers.Interface(marketplaceAbi);
    if (cfg.factory) {
      this.factory = new ethers.Contract(cfg.factory, factoryAbi, this.signer);
    } else {
      this.factory = null;
    }

    // Basic sanity: ensure code exists at marketplace address
    const code = await this.provider.getCode(cfg.marketplace);
    if (code === '0x') {
      const cid = net.chainId?.toString?.() || net.chainId;
      throw new Error(`Marketplace not deployed on this network (no code at ${cfg.marketplace} on chainId ${cid}). If you are running Ganache, ensure MetaMask is on chain 1337.`);
    }

    // Reactivity: refresh on chain or account changes to avoid stale state
    try {
      window.ethereum.removeAllListeners?.('chainChanged');
      window.ethereum.removeAllListeners?.('accountsChanged');
      window.ethereum.on('chainChanged', () => window.location.reload());
      window.ethereum.on('accountsChanged', (accounts) => {
        try {
          const addr = Array.isArray(accounts) && accounts.length ? accounts[0] : null;
          const currentRaw = localStorage.getItem('currentUser');
          const current = currentRaw ? JSON.parse(currentRaw) : null;
          const isWalletSession = !current || current.type === 'wallet';
          if (addr && isWalletSession) {
            const key = addr.toLowerCase();
            const profiles = JSON.parse(localStorage.getItem('profiles') || '{}');
            const prof = profiles[key] || {};
            const next = { address: addr, isAdmin: false, type: 'wallet', ...prof };
            localStorage.setItem('currentUser', JSON.stringify(next));
          } else {
            if (isWalletSession) localStorage.removeItem('currentUser');
          }
        } catch {}
        window.location.reload();
      });
    } catch {}
    return { account: await this.signer.getAddress(), chainId: net.chainId.toString() };
  }

  async getAccount() {
    if (!this.signer) return null;
    try { return await this.signer.getAddress(); } catch { return null; }
  }

  async getMarketplaceOwner() {
    if (!this.marketplace) await this.connect();
    try { return await this.marketplace.owner(); } catch { return null; }
  }

  async getRegistryOwner() {
    if (!this.registry) await this.connect();
    try { return await this.registry.owner(); } catch { return null; }
  }

  async getMarketplaceAddress() {
    if (!this.marketplace) await this.connect();
    try { return await this.marketplace.getAddress(); } catch { return null; }
  }

  async getRegistryAddress() {
    if (!this.registry) await this.connect();
    try { return await this.registry.getAddress(); } catch { return null; }
  }

  async getProperty(propertyId) {
    if (!this.registry) await this.connect();
    try {
      const p = await this.registry.getProperty(Number(propertyId));
      return {
        metadataURI: p.metadataURI,
        fractionalToken: p.fractionalToken,
        totalShares: Number(p.totalShares || 0),
        sharePriceWei: typeof p.sharePriceWei === 'bigint' ? p.sharePriceWei : BigInt(p.sharePriceWei || 0),
        propertyOwner: p.propertyOwner,
        active: Boolean(p.active),
      };
    } catch {
      return null;
    }
  }

  async transferRegistryOwnershipToMarketplace() {
    // Current signer must be the registry owner to transfer
    if (!this.registry || !this.marketplace) await this.connect();
    const current = await this.getAccount();
    const regOwner = await this.getRegistryOwner();
    if (!regOwner || regOwner.toLowerCase() !== current?.toLowerCase()) {
      throw new Error(`Only registry owner can transfer. Current: ${current}, Owner: ${regOwner}`);
    }
    const mktAddr = await this.getMarketplaceAddress();
    const tx = await this.registry.transferOwnership(mktAddr);
    return tx.wait();
  }

  async transferMarketplaceOwnership(newOwner) {
    if (!this.marketplace) await this.connect();
    const current = await this.getAccount();
    const mktOwner = await this.getMarketplaceOwner();
    if (!mktOwner || mktOwner.toLowerCase() !== (current || '').toLowerCase()) {
      throw new Error(`Only marketplace owner can transfer. Current: ${current}, Owner: ${mktOwner}`);
    }
    const target = newOwner || current;
    const tx = await this.marketplace.transferOwnership(target);
    return tx.wait();
  }

  async getProperties(start = 0, count = 50) {
    if (!this.registry) await this.connect();
    try {
      const arr = await this.registry.getAllProperties(start, count);
      // Parse or fetch metadata to surface title/address/images for UI
      const parseOrFetchMeta = async (uri) => {
        try {
          if (!uri) return null;
          if (typeof uri === 'string' && uri.startsWith('data:application/json')) {
            const idx = uri.indexOf(',');
            const jsonStr = decodeURIComponent(idx >= 0 ? uri.slice(idx + 1) : uri);
            return JSON.parse(jsonStr);
          }
          if (typeof uri === 'string' && (uri.startsWith('ipfs://') || uri.startsWith('http://') || uri.startsWith('https://'))) {
            const url = resolveIpfsUrlToHttp(uri);
            const res = await fetch(url, { method: 'GET' });
            if (res.ok) {
              const j = await res.json();
              return j || null;
            }
          }
        } catch {}
        return null;
      };
      const meta = await Promise.all((arr || []).map((p) => parseOrFetchMeta(p.metadataURI)));
      const erc20Abi = [
        { "inputs": [{"internalType":"address","name":"account","type":"address"}], "name":"balanceOf", "outputs":[{"internalType":"uint256","name":"","type":"uint256"}], "stateMutability":"view", "type":"function" },
        { "inputs": [], "name": "totalSupply", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" }
      ];
      // Parallel fetch available components: owner balance + active listed supply on secondary market
      const balances = await Promise.all(arr.map(async (p) => {
        try {
          const c = new ethers.Contract(p.fractionalToken, erc20Abi, this.provider);
          const bal = await c.balanceOf(p.propertyOwner);
          return Number(bal);
        } catch {
          return undefined;
        }
      }));
      // Minimal ABI to read activeListedSupply mapping without requiring full ABI refresh
      let listedSupplies = new Array(arr.length).fill(0);
      try {
        const mktAddr = await this.marketplace.getAddress();
        const liteAbi = [
          { "inputs": [{"internalType":"uint256","name":"","type":"uint256"}], "name": "activeListedSupply", "outputs": [{"internalType":"uint256","name":"","type":"uint256"}], "stateMutability": "view", "type": "function" }
        ];
        const mktLite = new ethers.Contract(mktAddr, liteAbi, this.provider);
        listedSupplies = await Promise.all(arr.map(async (_p, idx) => {
          try {
            const pid = start + idx;
            const v = await mktLite.activeListedSupply(pid);
            return Number(v);
          } catch {
            return 0;
          }
        }));
      } catch {}
      return arr.map((p, idx) => {
        const m = meta[idx] || null;
        const title = (m?.title || m?.name || '').trim();
        const addressText = (m?.address || '').trim();
        const imgs = Array.isArray(m?.images) ? m.images : (m?.image ? [m.image] : []);
        const resolvedImgs = imgs.map(u => resolveIpfsUrlToHttp(u));
        return {
          id: start + idx,
          metadataURI: p.metadataURI,
          token: p.fractionalToken,
          tokenAddress: p.fractionalToken,
          propertyOwner: p.propertyOwner,
          totalShares: Number(p.totalShares),
          availableShares: (balances[idx] !== undefined ? balances[idx] : Number(p.totalShares)) + (listedSupplies[idx] || 0),
          sharePrice: Number(ethers.formatEther(p.sharePriceWei || 0n)),
          active: p.active,
          // UI metadata fallbacks
          title: title || undefined,
          address: addressText || undefined,
          image: resolvedImgs[0] || undefined,
          images: resolvedImgs.length ? resolvedImgs : undefined,
          rentalYield: (typeof m?.rentalYield === 'number' || typeof m?.rentalYield === 'string') ? Number(m.rentalYield) : undefined,
          annualReturn: (typeof m?.annualReturn === 'number' || typeof m?.annualReturn === 'string') ? Number(m.annualReturn) : undefined,
        };
      });
    } catch (e) {
      console.error('getProperties failed', e);
      return [];
    }
  }

  async getHoldings(account, properties) {
    if (!this.provider) await this.connect();
    const erc20Abi = [
      { "inputs": [{"internalType":"address","name":"account","type":"address"}], "name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}], "stateMutability":"view", "type":"function" },
      { "inputs": [], "name": "totalSupply", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" }
    ];
    const results = [];
    for (const p of properties) {
      if (!p.token) continue;
      const c = new ethers.Contract(p.token, erc20Abi, this.provider);
      try {
        const [bal, supply] = await Promise.all([
          c.balanceOf(account),
          c.totalSupply()
        ]);
        results.push({ propertyId: p.id, token: p.token, balance: Number(bal), totalSupply: Number(supply) });
      } catch (e) {
        console.warn('balance fetch failed', p.token, e);
      }
    }
    return results;
  }

  async setPropertyActive(propertyId, active) {
  if (!this.marketplace) await this.connect();
  const tx = await this.marketplace.setPropertyActive(Number(propertyId), Boolean(active));
    return tx.wait();
  }

  async updatePropertyMetadataURI(propertyId, metadataURI) {
    if (!this.marketplace) await this.connect();
    // Only marketplace owner can call the wrapper
    const [acct, owner] = await Promise.all([this.getAccount(), this.getMarketplaceOwner()]);
    if (owner && acct && owner.toLowerCase() !== acct.toLowerCase()) {
      throw new Error(`Only marketplace owner can update metadata. Current: ${acct}, Owner: ${owner}`);
    }
    try {
      const tx = await this.marketplace.updatePropertyMetadataURI(Number(propertyId), String(metadataURI));
      return await tx.wait();
    } catch (e) {
      const data = e?.data || e?.error?.data;
      if (data) {
        try {
          const perr = this.marketplaceIface.parseError(data);
          if (perr?.name === 'OwnableUnauthorizedAccount') {
            throw new Error('Only marketplace owner can update metadata.');
          }
        } catch {}
      }
      throw e;
    }
  }

  async updatePropertySharePrice(propertyId, sharePriceWei) {
    if (!this.marketplace) await this.connect();
    // Only marketplace owner can call the wrapper
    const [acct, owner] = await Promise.all([this.getAccount(), this.getMarketplaceOwner()]);
    if (owner && acct && owner.toLowerCase() !== acct.toLowerCase()) {
      throw new Error(`Only marketplace owner can update share price. Current: ${acct}, Owner: ${owner}`);
    }
    const price = ethers.toBigInt(sharePriceWei);
    try {
      const tx = await this.marketplace.updatePropertySharePrice(Number(propertyId), price);
      return await tx.wait();
    } catch (e) {
      const data = e?.data || e?.error?.data;
      if (data) {
        try {
          const perr = this.marketplaceIface.parseError(data);
          if (perr?.name === 'OwnableUnauthorizedAccount') {
            throw new Error('Only marketplace owner can update share price.');
          }
        } catch {}
      }
      throw e;
    }
  }

  // Admin
  async createProperty({ name, symbol, metadataURI, totalShares, sharePriceWei, owner }) {
    // Preflight: ensure Marketplace owns Registry
    try {
      const [regOwner, mktAddr] = await Promise.all([
        this.getRegistryOwner(),
        this.getMarketplaceAddress(),
      ]);
      if (!regOwner || !mktAddr || regOwner.toLowerCase() !== mktAddr.toLowerCase()) {
        throw new Error('Registry is not owned by Marketplace. Transfer ownership first.');
      }
    } catch (e) {
      // Surface clear message; caller can decide to continue/abort
      throw e;
    }
    // Preflight: ensure caller is marketplace owner (avoid opaque Ownable reverts on some local chains)
    const acct = await this.getAccount();
    const mktOwner = await this.getMarketplaceOwner();
    if (mktOwner && acct && mktOwner.toLowerCase() !== acct.toLowerCase()) {
      throw new Error(`Only marketplace owner can create properties. Current: ${acct}, Owner: ${mktOwner}`);
    }
    // Normalize types to satisfy ethers v6 (avoid "could not coalesce" issues)
    const n = String(name ?? '');
    const s = String(symbol ?? '');
    const uri = String(metadataURI ?? '');
    // Reject oversized inline metadata to avoid out-of-gas reverts on some local chains
    if (uri.startsWith('data:') && uri.length > 8192) {
      throw new Error('Metadata URI is too large. Please enable IPFS for media or reduce metadata size.');
    }
    const asUint = (v, label) => {
      if (typeof v === 'bigint') return v;
      if (typeof v === 'number') return ethers.toBigInt(Math.trunc(v));
      const str = String(v ?? '').trim();
      if (!/^[0-9]+$/.test(str)) throw new Error(`${label || 'Value'} must be an integer (wei)`);
      return ethers.toBigInt(str);
    };
    const ts = asUint(totalShares, 'totalShares');
    const price = asUint(sharePriceWei, 'sharePriceWei');
    const ownerAddr = ethers.getAddress(owner);

    // Preflight: ensure ABI encoder accepts the args to avoid opaque errors
    try {
      this.marketplaceIface.encodeFunctionData('createProperty', [n, s, uri, ts, price, ownerAddr]);
    } catch (encErr) {
      throw new Error(`Invalid input types for createProperty (pre-encode). Ensure totalShares is an integer and sharePrice is a valid ETH number. Details: ${encErr?.message || encErr}`);
    }

    // Preflight simulate: prefer staticCall with ample gas. If it still fails with no data but prechecks pass, continue.
    try {
      if (this.marketplace.createProperty?.staticCall) {
        await this.marketplace.createProperty.staticCall(n, s, uri, ts, price, ownerAddr, { gasLimit: 10_000_000n });
      } else {
        const to = await this.marketplace.getAddress();
        const data = this.marketplaceIface.encodeFunctionData('createProperty', [n, s, uri, ts, price, ownerAddr]);
        await this.provider.call({ to, from: acct, data, gasLimit: 10_000_000n });
      }
    } catch (simErr) {
      // Try to decode ownable errors
      const raw = simErr?.data || simErr?.error?.data;
      try {
        if (raw) {
          const perr = this.marketplaceIface.parseError(raw);
          if (perr?.name === 'OwnableUnauthorizedAccount') {
            throw new Error('Only marketplace owner can create properties. Switch to the owner wallet.');
          }
        }
      } catch {}
      // If we reached here, either gas estimation/simulation failed on local chain (ganache quirk) or another non-decodable error.
      // Since owner/ownership prechecks passed and args encoded, proceed with sending the tx.
      console.warn('createProperty preflight simulate failed; proceeding to send tx. Reason:', simErr);
    }
    let tx;
    try {
      // Provide a generous gasLimit as BigInt to satisfy ethers v6 coalescing rules
      tx = await this.marketplace.createProperty(n, s, uri, ts, price, ownerAddr, { gasLimit: 6_000_000n });
    } catch (e) {
      // Try to decode common causes for clearer UX
      try {
        const data = e?.data || e?.error?.data;
        if (data) {
          try {
            const perr = this.marketplaceIface.parseError(data);
            if (perr?.name === 'OwnableUnauthorizedAccount') {
              throw new Error('Only marketplace owner can create properties. Switch to the owner wallet.');
            }
          } catch {}
        }
      } catch {}
      let msg = e?.shortMessage || e?.reason || e?.message || String(e);
      // If gasLimit coalescing caused the issue, retry without overrides
      if (/coalesc/i.test(msg) && !/pre-encode/i.test(msg)) {
        try {
          tx = await this.marketplace.createProperty(n, s, uri, ts, price, ownerAddr);
          // If retry succeeds, continue
        } catch (e2) {
          msg = e2?.shortMessage || e2?.reason || e2?.message || String(e2);
        }
      }
      if (/coalesc/i.test(msg)) {
        const dbg = {
          name: n, symbol: s,
          uri,
          totalShares: ts?.toString?.() || String(ts),
          sharePriceWei: price?.toString?.() || String(price),
          owner: ownerAddr
        };
        throw new Error(`Invalid input types for createProperty. Ensure totalShares is an integer and sharePrice is a valid ETH number. Details: ${msg}. Args: ${JSON.stringify(dbg)}`);
      }
      if (/missing revert data/i.test(msg)) {
        throw new Error('Transaction reverted without a reason. Likely causes: wrong contract/ABI at address, not the marketplace owner, or Registry not owned by Marketplace. Verify network (1337), addresses.json, and ownership status in Admin.');
      }
      throw e;
    }
    const receipt = await tx.wait();
    let parsed;
    try {
      for (const log of receipt.logs) {
        try {
          const ev = this.marketplaceIface.parseLog(log);
          if (ev && ev.name === 'PropertyCreated') {
            parsed = {
              propertyId: Number(ev.args[0]),
              token: ev.args[1]
            };
            break;
          }
        } catch {}
      }
    } catch {}
    return { receipt, ...(parsed || {}) };
  }

  // Primary buy (demo pricing)
  async buyShares({ propertyId, token, amount, pricePerShareWei }) {
    const value = ethers.toBigInt(pricePerShareWei) * ethers.toBigInt(amount);
    const tx = await this.marketplace.buyShares(propertyId, token, amount, pricePerShareWei, { value });
    return tx.wait();
  }

  async createListing({ token, propertyId, amount, pricePerShareWei }) {
    const tx = await this.marketplace.createListing(token, propertyId, amount, pricePerShareWei);
    return tx.wait();
  }

  async fillListing({ token, listingId, amount, pricePerShareWei }) {
    const value = ethers.toBigInt(pricePerShareWei) * ethers.toBigInt(amount);
    const tx = await this.marketplace.fillListing(token, listingId, amount, { value });
    return tx.wait();
  }

  async depositDividends({ propertyId, amountWei }) {
    const tx = await this.marketplace.depositDividends(propertyId, { value: amountWei });
    return tx.wait();
  }

  async claimDividends({ token, propertyId }) {
    const tx = await this.marketplace.claimDividends(token, propertyId);
    return tx.wait();
  }

  async getPendingDividends({ token, propertyId, account }) {
    if (!this.marketplace) await this.connect();
    const addr = account || (await this.getAccount());
    if (!addr) return 0;
    try {
      const v = await this.marketplace.pendingDividends(token, Number(propertyId), addr);
      // ethers v6 returns bigint; return as decimal string to avoid precision loss
      return typeof v === 'bigint' ? v.toString() : (v?.toString?.() ?? '0');
    } catch {
      return 0;
    }
  }

  // Order book: best asks for a property (price ascending)
  async getOrderBookAsks(propertyId, limit = 5) {
    if (!this.provider || !this.marketplace) await this.connect();
    const latestNumber = await this.provider.getBlockNumber();
    const toBlock = Number(latestNumber);
    const pid = Number(propertyId);
    try {
      // Fetch all ListingCreated for this property
      const createdFilter = this.marketplace.filters.ListingCreated(null, pid, null);
      const created = await this.marketplace.queryFilter(createdFilter, 0, toBlock);
      // Index by listingId
      const book = new Map();
      for (const e of created) {
        const listingId = Number(e.args[0]);
        const propertyId = Number(e.args[1]);
        const seller = e.args[2];
        const amount = Number(e.args[3]);
        const pricePerShareWei = e.args[4]?.toString();
        book.set(listingId, { listingId, propertyId, seller, createdBlock: e.blockNumber, pricePerShareWei, initialAmount: amount, filled: 0, cancelled: false });
      }
      if (!book.size) return [];
      // Fetch cancellations
      const cancelResults = [];
      for (const id of book.keys()) {
        try {
          const cancelFilter = this.marketplace.filters.ListingCancelled(id);
          const evs = await this.marketplace.queryFilter(cancelFilter, 0, toBlock);
          if (evs && evs.length) cancelResults.push({ id });
        } catch {}
      }
      cancelResults.forEach(({ id }) => { const rec = book.get(id); if (rec) rec.cancelled = true; });
      // Fetch fills to net out remaining amounts
      for (const id of book.keys()) {
        try {
          const filledFilter = this.marketplace.filters.ListingFilled(id, null);
          const evs = await this.marketplace.queryFilter(filledFilter, 0, toBlock);
          let filledAmt = 0;
          for (const ev of evs) {
            filledAmt += Number(ev.args[2] || 0);
          }
          const rec = book.get(id);
          if (rec) rec.filled = filledAmt;
        } catch {}
      }
      // Remaining and active
      const active = [];
      for (const rec of book.values()) {
        const remaining = Math.max(0, (rec.initialAmount || 0) - (rec.filled || 0));
        if (!rec.cancelled && remaining > 0) {
          active.push({
            listingId: rec.listingId,
            propertyId: rec.propertyId,
            seller: rec.seller,
            pricePerShareWei: rec.pricePerShareWei,
            priceEth: Number(ethers.formatEther(rec.pricePerShareWei || '0')),
            amount: remaining,
            createdBlock: rec.createdBlock,
          });
        }
      }
      // Sort by price asc then createdBlock asc
      active.sort((a, b) => (a.priceEth - b.priceEth) || (a.createdBlock - b.createdBlock));
      return active.slice(0, limit);
    } catch (e) {
      console.warn('getOrderBookAsks failed', e);
      return [];
    }
  }

  async getDividendHistory(account, properties) {
    if (!this.provider || !this.marketplace) await this.connect();
    const acct = account || (await this.getAccount());
    const latestNumber = await this.provider.getBlockNumber();
    const toBlock = Number(latestNumber);
    const props = Array.isArray(properties) ? properties : [];
    const out = [];
    for (const p of props) {
      const pid = Number(p.id ?? p.propertyId ?? 0);
      if (Number.isNaN(pid)) continue;
      try {
        // Deposits (by owner) for this property
        const depFilter = this.marketplace.filters.DividendsDeposited(pid);
        const deps = await this.marketplace.queryFilter(depFilter, 0, toBlock);
        for (const e of deps) {
          out.push({
            type: 'deposit',
            propertyId: pid,
            amountWei: e.args?.[1]?.toString?.() || '0',
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
          });
        }
      } catch {}
      try {
        if (acct) {
          const claimFilter = this.marketplace.filters.DividendClaimed(pid, acct);
          const cls = await this.marketplace.queryFilter(claimFilter, 0, toBlock);
          for (const e of cls) {
            out.push({
              type: 'claim',
              propertyId: pid,
              account: acct,
              amountWei: e.args?.[2]?.toString?.() || '0',
              txHash: e.transactionHash,
              blockNumber: e.blockNumber,
            });
          }
        }
      } catch {}
    }
    out.sort((a, b) => (b.blockNumber || 0) - (a.blockNumber || 0));
    // Enrich with timestamps (best-effort)
    try {
      const uniqBlocks = [...new Set(out.map(e => e.blockNumber))];
      const blockMap = new Map();
      for (const bn of uniqBlocks) {
        try { const blk = await this.provider.getBlock(bn); blockMap.set(bn, blk?.timestamp ? blk.timestamp * 1000 : Date.now()); } catch {}
      }
      out.forEach(e => { e.timestamp = blockMap.get(e.blockNumber) || Date.now(); });
    } catch {}
    return out;
  }

  async getUserTransactions(address, fromBlockDelta = 500000n) {
    if (!this.provider || !this.marketplace) await this.connect();
    // Ensure we use consistent types (avoid mixing Number and BigInt)
    const latestNumber = await this.provider.getBlockNumber();
    const latest = BigInt(latestNumber);
    const normAddr = (()=>{ try { return ethers.getAddress(address); } catch { return address; } })();
    const fromBlockBig = latest > fromBlockDelta ? (latest - fromBlockDelta) : 0n;
    // queryFilter expects number or block tag; convert safely for local/dev ranges
    const fromBlock = Number(fromBlockBig);
    const toBlock = Number(latest);
    const events = [];
    // Build filters
    const purchaseFilter = this.marketplace.filters.SharesPurchased(null, normAddr);
    const sellFilter = this.marketplace.filters.SharesSold(null, normAddr);
  const listCreatedFilter = this.marketplace.filters.ListingCreated(null, null, normAddr);
  const listFilledFilter = this.marketplace.filters.ListingFilled(null, normAddr);
  // Include dividend claims (these originate from Marketplace)
  let claimedFilter = null;
  try { claimedFilter = this.marketplace.filters.DividendClaimed(null, normAddr); } catch {}

    // Prepare a lite contract to read listing details (propertyId, price)
    let mktLite = null;
    try {
      const mktAddr = await this.marketplace.getAddress();
      const liteAbi = [
        {
          "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
          "name": "listings",
          "outputs": [
            { "internalType": "uint256", "name": "propertyId", "type": "uint256" },
            { "internalType": "address", "name": "seller", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" },
            { "internalType": "uint256", "name": "pricePerShareWei", "type": "uint256" },
            { "internalType": "bool", "name": "active", "type": "bool" }
          ],
          "stateMutability": "view",
          "type": "function"
        }
      ];
      mktLite = new ethers.Contract(mktAddr, liteAbi, this.provider);
    } catch {}

    // Query events
    const purchases = await this.marketplace.queryFilter(purchaseFilter, fromBlock, toBlock);
    const sales = await this.marketplace.queryFilter(sellFilter, fromBlock, toBlock);
  let listingsCreated = [];
    try { listingsCreated = await this.marketplace.queryFilter(listCreatedFilter, fromBlock, toBlock); } catch {}
  let listingsFilled = [];
    try { listingsFilled = await this.marketplace.queryFilter(listFilledFilter, fromBlock, toBlock); } catch {}
  let claims = [];
  try { if (claimedFilter) claims = await this.marketplace.queryFilter(claimedFilter, fromBlock, toBlock); } catch {}

    // Timestamp enrichment across ALL event types
  const rawAll = [...purchases, ...sales, ...listingsCreated, ...listingsFilled, ...claims];
    const uniqueBlocks = Array.from(new Set(rawAll.map(e => e.blockNumber)));
    const blockMap = new Map();
    for (const bn of uniqueBlocks) {
      try {
        const blk = await this.provider.getBlock(bn);
        blockMap.set(bn, blk?.timestamp ? Number(blk.timestamp) * 1000 : undefined);
      } catch {}
    }

    for (const e of purchases) {
      events.push({
        type: 'buy',
        propertyId: e.args[0]?.toString(),
        user: e.args[1],
        amount: e.args[2]?.toString(),
        price: e.args[3]?.toString(),
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
        transactionIndex: e.transactionIndex,
        logIndex: e.logIndex,
        timestamp: blockMap.get(e.blockNumber)
      });
    }
    for (const e of sales) {
      events.push({
        type: 'sell',
        propertyId: e.args[0]?.toString(),
        user: e.args[1],
        amount: e.args[2]?.toString(),
        price: e.args[3]?.toString(),
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
        transactionIndex: e.transactionIndex,
        logIndex: e.logIndex,
        timestamp: blockMap.get(e.blockNumber)
      });
    }
    for (const e of listingsCreated) {
      events.push({
        type: 'list',
        listingId: e.args[0]?.toString(),
        propertyId: e.args[1]?.toString(),
        user: e.args[2],
        amount: e.args[3]?.toString(),
        price: e.args[4]?.toString(),
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
        transactionIndex: e.transactionIndex,
        logIndex: e.logIndex,
        timestamp: blockMap.get(e.blockNumber)
      });
    }
    // Listing filled where user is buyer; enrich with listing info to get propertyId/price when possible
    for (const e of listingsFilled) {
      let propertyId = undefined;
      let price = undefined;
      try {
        const listingId = e.args[0];
        if (mktLite) {
          const listing = await mktLite.listings(listingId);
          propertyId = listing?.propertyId?.toString?.() || listing?.[0]?.toString?.();
          price = listing?.pricePerShareWei?.toString?.() || listing?.[3]?.toString?.();
        }
      } catch {}
      events.push({
        type: 'buy', // secondary buy
        listingId: e.args[0]?.toString(),
        propertyId: propertyId,
        user: e.args[1],
        amount: e.args[2]?.toString(),
        price: price,
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
        transactionIndex: e.transactionIndex,
        logIndex: e.logIndex,
        timestamp: blockMap.get(e.blockNumber)
      });
    }
    // Dividend claims
    for (const e of claims) {
      events.push({
        type: 'claim',
        propertyId: e.args[0]?.toString(),
        user: e.args[1],
        amount: e.args[2]?.toString(),
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
        transactionIndex: e.transactionIndex,
        logIndex: e.logIndex,
        timestamp: blockMap.get(e.blockNumber)
      });
    }

    // Stable sort: blockNumber desc, transactionIndex desc, logIndex desc
    events.sort((a, b) =>
      (Number(b.blockNumber) - Number(a.blockNumber)) ||
      (Number(b.transactionIndex ?? 0) - Number(a.transactionIndex ?? 0)) ||
      (Number(b.logIndex ?? 0) - Number(a.logIndex ?? 0))
    );

  // Fallback: widen range to block 0 and include listing events as well
    if (!events.length) {
      try {
        const fb = 0;
        const purchases2 = await this.marketplace.queryFilter(purchaseFilter, fb, toBlock);
        const sales2 = await this.marketplace.queryFilter(sellFilter, fb, toBlock);
        let listingsCreated2 = [];
        try { listingsCreated2 = await this.marketplace.queryFilter(listCreatedFilter, fb, toBlock); } catch {}
  let listingsFilled2 = [];
        try { listingsFilled2 = await this.marketplace.queryFilter(listFilledFilter, fb, toBlock); } catch {}
  let claims2 = [];
  try { if (claimedFilter) claims2 = await this.marketplace.queryFilter(claimedFilter, fb, toBlock); } catch {}
  const all2 = [...purchases2, ...sales2, ...listingsCreated2, ...listingsFilled2, ...claims2];
        const uniqueBlocks2 = Array.from(new Set(all2.map(e => e.blockNumber)));
        const blockMap2 = new Map();
        for (const bn of uniqueBlocks2) {
          try { const blk = await this.provider.getBlock(bn); blockMap2.set(bn, blk?.timestamp ? Number(blk.timestamp) * 1000 : undefined); } catch {}
        }
        for (const e of purchases2) {
          events.push({
            type: 'buy',
            propertyId: e.args[0]?.toString(),
            user: e.args[1],
            amount: e.args[2]?.toString(),
            price: e.args[3]?.toString(),
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            transactionIndex: e.transactionIndex,
            logIndex: e.logIndex,
            timestamp: blockMap2.get(e.blockNumber)
          });
        }
        for (const e of sales2) {
          events.push({
            type: 'sell',
            propertyId: e.args[0]?.toString(),
            user: e.args[1],
            amount: e.args[2]?.toString(),
            price: e.args[3]?.toString(),
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            transactionIndex: e.transactionIndex,
            logIndex: e.logIndex,
            timestamp: blockMap2.get(e.blockNumber)
          });
        }
        for (const e of listingsCreated2) {
          events.push({
            type: 'list',
            listingId: e.args[0]?.toString(),
            propertyId: e.args[1]?.toString(),
            user: e.args[2],
            amount: e.args[3]?.toString(),
            price: e.args[4]?.toString(),
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            transactionIndex: e.transactionIndex,
            logIndex: e.logIndex,
            timestamp: blockMap2.get(e.blockNumber)
          });
        }
        for (const e of listingsFilled2) {
          let propertyId = undefined;
          let price = undefined;
          try {
            const listingId = e.args[0];
            if (mktLite) {
              const listing = await mktLite.listings(listingId);
              propertyId = listing?.propertyId?.toString?.() || listing?.[0]?.toString?.();
              price = listing?.pricePerShareWei?.toString?.() || listing?.[3]?.toString?.();
            }
          } catch {}
          events.push({
            type: 'buy',
            listingId: e.args[0]?.toString(),
            propertyId,
            user: e.args[1],
            amount: e.args[2]?.toString(),
            price,
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            transactionIndex: e.transactionIndex,
            logIndex: e.logIndex,
            timestamp: blockMap2.get(e.blockNumber)
          });
        }
        for (const e of claims2) {
          events.push({
            type: 'claim',
            propertyId: e.args[0]?.toString(),
            user: e.args[1],
            amount: e.args[2]?.toString(),
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            transactionIndex: e.transactionIndex,
            logIndex: e.logIndex,
            timestamp: blockMap2.get(e.blockNumber)
          });
        }
        events.sort((a, b) =>
          (Number(b.blockNumber) - Number(a.blockNumber)) ||
          (Number(b.transactionIndex ?? 0) - Number(a.transactionIndex ?? 0)) ||
          (Number(b.logIndex ?? 0) - Number(a.logIndex ?? 0))
        );
      } catch {}
    }

    // Also incorporate ERC20 Transfer events across all known property tokens.
    // This captures mints/transfers done outside Marketplace so the user still sees activity.
    try {
      // Read a reasonable window of properties; adjust count if your registry has more.
      const maxProps = 200;
      const arr = await this.registry.getAllProperties(0, maxProps);
      const erc20Abi = [
        { "anonymous": false, "inputs": [
          { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
          { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
          { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }
        ], "name": "Transfer", "type": "event" }
      ];
      for (let idx = 0; idx < arr.length; idx++) {
        const p = arr[idx];
        const token = p.fractionalToken;
        if (!token) continue;
        try {
          const c = new ethers.Contract(token, erc20Abi, this.provider);
          const recvFilter = c.filters.Transfer(null, normAddr);
          const sendFilter = c.filters.Transfer(normAddr, null);
          const [recvLogs, sendLogs] = await Promise.all([
            c.queryFilter(recvFilter, fromBlock, toBlock),
            c.queryFilter(sendFilter, fromBlock, toBlock)
          ]);
          for (const e of recvLogs) {
            events.push({
              type: e.args?.[0] === ethers.ZeroAddress ? 'mint' : 'receive',
              propertyId: (0 + idx).toString(),
              user: normAddr,
              amount: e.args?.[2]?.toString?.(),
              txHash: e.transactionHash,
              blockNumber: e.blockNumber,
              transactionIndex: e.transactionIndex,
              logIndex: e.logIndex,
              timestamp: (await this.provider.getBlock(e.blockNumber))?.timestamp * 1000
            });
          }
          for (const e of sendLogs) {
            events.push({
              type: 'send',
              propertyId: (0 + idx).toString(),
              user: normAddr,
              amount: e.args?.[2]?.toString?.(),
              txHash: e.transactionHash,
              blockNumber: e.blockNumber,
              transactionIndex: e.transactionIndex,
              logIndex: e.logIndex,
              timestamp: (await this.provider.getBlock(e.blockNumber))?.timestamp * 1000
            });
          }
        } catch {}
      }
      events.sort((a, b) =>
        (Number(b.blockNumber) - Number(a.blockNumber)) ||
        (Number(b.transactionIndex ?? 0) - Number(a.transactionIndex ?? 0)) ||
        (Number(b.logIndex ?? 0) - Number(a.logIndex ?? 0))
      );
    } catch {}
    return events;
  }

  // Factory helpers
  async getFactoryAddress() {
    if (!this.factory) return null;
    try { return await this.factory.getAddress(); } catch { return null; }
  }

  async submitListingApplication({ title, addressText, rentalYield, annualReturn, totalShares, sharePriceEth, images, metadataURI }) {
    if (!this.factory) throw new Error('Factory not configured on this network.');
    // Build metadata same as Admin.createProperty flow
    const name = `${title} Shares`;
    const symbol = (title || '').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase() || 'PROP';
    let uri = String(metadataURI || '');
    if (!uri) throw new Error('Missing metadataURI');
    const ts = BigInt(totalShares);
    const priceWei = ethers.parseEther(String(sharePriceEth));
    const tx = await this.factory.submitApplication(name, symbol, uri, ts, priceWei);
    const receipt = await tx.wait();
    let appId;
    try {
      const iface = new ethers.Interface(factoryAbi);
      for (const log of receipt.logs) {
        try {
          const ev = iface.parseLog(log);
          if (ev && ev.name === 'ApplicationSubmitted') { appId = Number(ev.args[0]); break; }
        } catch {}
      }
    } catch {}
    return { receipt, appId };
  }

  async getMyApplications() {
    if (!this.factory) throw new Error('Factory not configured on this network.');
    const addr = await this.getAccount();
    const [arr, ids] = await this.factory.getMyApplications(addr);
    const list = (arr || []).map((a, i) => ({
      id: Number((ids && ids[i]) || (i+1)),
      applicant: a.applicant,
      name: a.name,
      symbol: a.symbol,
      metadataURI: a.metadataURI,
      totalShares: Number(a.totalShares || 0),
      sharePriceWei: a.sharePriceWei?.toString?.() || '0',
      sharePrice: Number(ethers.formatEther(a.sharePriceWei || 0n)),
      status: Number(a.status || 0),
      reviewNote: a.reviewNote,
      createdAt: Number(a.createdAt || 0),
      decidedAt: Number(a.decidedAt || 0),
      propertyId: Number(a.propertyId || 0),
      token: a.token
    }));
    return list;
  }

  async adminGetApplications(start = 1, count = 100) {
    if (!this.factory) throw new Error('Factory not configured on this network.');
    const [items, ids, total] = await this.factory.getApplications(start - 1, count); // 1-based in contract view
    const norm = (items || []).map((a, idx) => ({
      id: Number((ids && ids[idx]) || (start + idx)),
      applicant: a.applicant,
      name: a.name,
      symbol: a.symbol,
      metadataURI: a.metadataURI,
      totalShares: Number(a.totalShares || 0),
      sharePriceWei: a.sharePriceWei?.toString?.() || '0',
      sharePrice: Number(ethers.formatEther(a.sharePriceWei || 0n)),
      status: Number(a.status || 0),
      reviewNote: a.reviewNote,
      createdAt: Number(a.createdAt || 0),
      decidedAt: Number(a.decidedAt || 0),
      propertyId: Number(a.propertyId || 0),
      token: a.token
    }));
    return { items: norm, total: Number(total || 0) };
  }

  async reviewApplication(appId, approve, note) {
    if (!this.factory) throw new Error('Factory not configured on this network.');
    const tx = await this.factory.reviewApplication(Number(appId), Boolean(approve), String(note || ''));
    return tx.wait();
  }

  async finalizeMyApplication(appId) {
    if (!this.factory) throw new Error('Factory not configured on this network.');
    const tx = await this.factory.finalizeApprovedApplication(Number(appId));
    const receipt = await tx.wait();
    let parsed;
    try {
      const iface = new ethers.Interface(factoryAbi);
      for (const log of receipt.logs) {
        try {
          const ev = iface.parseLog(log);
          if (ev && ev.name === 'ApplicationFinalized') { parsed = { propertyId: Number(ev.args[1]), token: ev.args[2] }; break; }
        } catch {}
      }
    } catch {}
    return { receipt, ...(parsed || {}) };
  }

  async setAuthorizedCreator(creator, allowed) {
    // Marketplace owner only (call wrapper to keep a single admin key)
    if (!this.marketplace) await this.connect();
    const [acct, owner] = await Promise.all([ this.getAccount(), this.getMarketplaceOwner() ]);
    if (owner && acct && owner.toLowerCase() !== acct.toLowerCase()) {
      throw new Error(`Only marketplace owner can authorize factory. Current: ${acct}, Owner: ${owner}`);
    }
    const tx = await this.marketplace.setAuthorizedCreator(creator, Boolean(allowed));
    return tx.wait();
  }

  // Factory admin lifecycle: mark a finalized application Removed by propertyId
  async markApplicationRemovedByProperty(propertyId, note = 'Removed') {
    if (!this.factory) throw new Error('Factory not configured on this network.');
    // Only marketplace/registry admin should call this. We require factory.owner == current signer.
    const acct = await this.getAccount();
    let owner;
    try { owner = await this.factory.owner(); } catch {}
    if (!owner || owner.toLowerCase() !== (acct || '').toLowerCase()) {
      throw new Error('Only factory owner can mark removed.');
    }
    const tx = await this.factory.markRemovedByProperty(Number(propertyId), String(note || 'Removed'));
    return tx.wait();
  }
}

export const web3Client = new Web3Client();
// Debug helper: access from browser console as window.web3Client
if (typeof window !== 'undefined') {
  window.web3Client = web3Client;
}
