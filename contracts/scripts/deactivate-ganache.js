require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const addrPath = path.resolve(__dirname, '../../src/pages/src/web3/addresses.json');
  const json = JSON.parse(fs.readFileSync(addrPath, 'utf8'));
  const g = json.ganache || {};
  if (!g.marketplace) throw new Error('ganache marketplace missing in addresses.json');
  const [signer] = await hre.ethers.getSigners();
  console.log('Using signer:', signer.address);
  const net = await hre.ethers.provider.getNetwork();
  console.log('Network chainId:', net.chainId?.toString?.() || net.chainId);
  const Marketplace = await hre.ethers.getContractFactory('contracts/core/Marketplace.sol:Marketplace');
  const mkt = Marketplace.attach(g.marketplace).connect(signer);
  const id = Number(process.env.PROPERTY_ID || 0);
  console.log('Deactivating propertyId:', id, 'on', g.marketplace);
  const tx = await mkt.setPropertyActive(id, false);
  await tx.wait();
  console.log('Deactivated propertyId', id);
}

main().catch((e) => { console.error(e); process.exit(1); });
