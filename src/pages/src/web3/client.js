import { ethers } from 'ethers';
import { networks } from './config';

import registryAbi from './abi/PropertyRegistry.json';
import marketplaceAbi from './abi/Marketplace.json';

export class Web3Client {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.registry = null;
    this.marketplace = null;
  this.marketplaceIface = null;
  }

  async connect() {
    if (!window.ethereum) throw new Error('No wallet');
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    const net = await this.provider.getNetwork();
    const chainName = net.chainId === 11155111n ? 'sepolia' : 'local';
    const cfg = networks[chainName];
  this.registry = new ethers.Contract(cfg.registry, registryAbi, this.signer);
  this.marketplace = new ethers.Contract(cfg.marketplace, marketplaceAbi, this.signer);
  this.marketplaceIface = new ethers.Interface(marketplaceAbi);
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

  async getProperties(start = 0, count = 50) {
    if (!this.registry) await this.connect();
    try {
      const arr = await this.registry.getAllProperties(start, count);
      return arr.map((p, idx) => ({
        id: start + idx,
        metadataURI: p.metadataURI,
        token: p.fractionalToken,
        totalShares: Number(p.totalShares),
        sharePrice: Number(ethers.formatEther(p.sharePriceWei || 0n)),
        tokenAddress: p.fractionalToken,
        active: p.active
      }));
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

  // Admin
  async createProperty({ name, symbol, metadataURI, totalShares, sharePriceWei, owner }) {
    const tx = await this.marketplace.createProperty(name, symbol, metadataURI, totalShares, sharePriceWei, owner);
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

  async getUserTransactions(address, fromBlockDelta = 500000n) {
    if (!this.provider || !this.marketplace) await this.connect();
    const latest = await this.provider.getBlockNumber();
    const fromBlock = latest - fromBlockDelta > 0n ? latest - fromBlockDelta : 0n;
    const events = [];
    const purchaseFilter = this.marketplace.filters.SharesPurchased(null, address);
    const sellFilter = this.marketplace.filters.SharesSold(null, address);
    const purchases = await this.marketplace.queryFilter(purchaseFilter, fromBlock, latest);
    const sales = await this.marketplace.queryFilter(sellFilter, fromBlock, latest);
    // Gather unique block numbers to fetch timestamps efficiently
    const all = [...purchases, ...sales];
    const uniqueBlocks = Array.from(new Set(all.map(e => e.blockNumber)));
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
        timestamp: blockMap.get(e.blockNumber)
      });
    }
    // sort by blockNumber desc
    events.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
    return events;
  }
}

export const web3Client = new Web3Client();
// Debug helper: access from browser console as window.web3Client
if (typeof window !== 'undefined') {
  window.web3Client = web3Client;
}
