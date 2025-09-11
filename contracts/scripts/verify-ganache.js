require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const addrPath = path.resolve(__dirname, '../../src/pages/src/web3/addresses.json');
  const json = JSON.parse(fs.readFileSync(addrPath, 'utf8'));
  const g = json.ganache || {};
  if (!g.registry) throw new Error('ganache registry missing in addresses.json');
  const [signer] = await hre.ethers.getSigners();
  console.log('Verifying with address:', signer.address);
  const Registry = await hre.ethers.getContractFactory('contracts/core/PropertyRegistry.sol:PropertyRegistry');
  const registry = Registry.attach(g.registry).connect(signer);
  const next = await registry.nextPropertyId();
  const total = (typeof next === 'bigint') ? next : BigInt(next);
  console.log('Total properties:', total.toString());
  if (total > 0n) {
    const lastId = total - 1n;
    const prop = await registry.getProperty(lastId);
    console.log('Last propertyId:', lastId.toString());
    console.log('Last property token:', prop.fractionalToken);
    console.log('Last property metadataURI:', prop.metadataURI);
    console.log('Active:', prop.active);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
