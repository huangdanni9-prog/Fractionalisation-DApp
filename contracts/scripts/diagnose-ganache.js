require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const addrPath = path.resolve(__dirname, '../../src/pages/src/web3/addresses.json');
  const json = JSON.parse(fs.readFileSync(addrPath, 'utf8'));
  const g = json.ganache || {};
  if (!g.marketplace) throw new Error('ganache marketplace missing in addresses.json');
  if (!g.registry) throw new Error('ganache registry missing in addresses.json');
  const [signer] = await hre.ethers.getSigners();
  console.log('Diagnosing with signer:', signer.address);
  const net = await hre.ethers.provider.getNetwork();
  console.log('Network chainId:', net.chainId?.toString?.() || net.chainId);

  const Registry = await hre.ethers.getContractFactory('contracts/core/PropertyRegistry.sol:PropertyRegistry');
  const registry = Registry.attach(g.registry).connect(signer);
  const Marketplace = await hre.ethers.getContractFactory('contracts/core/Marketplace.sol:Marketplace');
  const marketplace = Marketplace.attach(g.marketplace).connect(signer);

  const [regOwner, mktOwner] = await Promise.all([
    registry.owner(),
    marketplace.owner(),
  ]);
  const regFromMkt = await marketplace.registry();
  const next = await registry.nextPropertyId();
  console.log('Registry address (frontend):', g.registry);
  console.log('Marketplace address (frontend):', g.marketplace);
  console.log('Registry owner:', regOwner);
  console.log('Marketplace owner:', mktOwner);
  console.log('Marketplace.registry() points to:', regFromMkt);
  console.log('Registry.nextPropertyId:', (typeof next === 'bigint' ? next : BigInt(next)).toString());
  const ok = regOwner.toLowerCase() === g.marketplace.toLowerCase();
  console.log('Ownership OK (registry owned by marketplace):', ok);
}

main().catch((e) => { console.error(e); process.exit(1); });
