require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

// Usage: node scripts/check-token-owner.js <propertyId>
async function main() {
  const pidArg = process.argv[2];
  if (pidArg === undefined) {
    console.error('Usage: node scripts/check-token-owner.js <propertyId>');
    process.exit(1);
  }
  const propertyId = BigInt(pidArg);
  const addrPath = path.resolve(__dirname, '../../src/pages/src/web3/addresses.json');
  const json = JSON.parse(fs.readFileSync(addrPath, 'utf8'));
  // Prefer ganache when chainId=1337, else local
  const net = await hre.ethers.provider.getNetwork();
  const isGanache = String(net.chainId) === '1337';
  const cfg = isGanache ? (json.ganache || {}) : (json.local || {});
  if (!cfg.registry || !cfg.marketplace) {
    throw new Error('Missing registry/marketplace in addresses.json for this network');
  }
  const [signer] = await hre.ethers.getSigners();
  const Registry = await hre.ethers.getContractFactory('contracts/core/PropertyRegistry.sol:PropertyRegistry');
  const registry = Registry.attach(cfg.registry).connect(signer);
  const Marketplace = await hre.ethers.getContractFactory('contracts/core/Marketplace.sol:Marketplace');
  const marketplace = Marketplace.attach(cfg.marketplace).connect(signer);
  const prop = await registry.getProperty(propertyId);
  const token = prop.fractionalToken;
  if (!token || token === hre.ethers.ZeroAddress) {
    console.log('No token for property', propertyId.toString());
    return;
  }
  const ownableAbi = [ { inputs: [], name: 'owner', outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' } ];
  const t = new hre.ethers.Contract(token, ownableAbi, signer);
  const tokenOwner = await t.owner();
  const mktAddr = await marketplace.getAddress();
  const ok = tokenOwner.toLowerCase() === mktAddr.toLowerCase();
  console.log('PropertyId:', propertyId.toString());
  console.log('Token:', token);
  console.log('Token.owner():', tokenOwner);
  console.log('Marketplace:', mktAddr);
  console.log('Owner == Marketplace:', ok);
}

main().catch((e) => { console.error(e); process.exit(1); });
