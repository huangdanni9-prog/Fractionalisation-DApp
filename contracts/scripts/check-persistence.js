require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const provider = new hre.ethers.JsonRpcProvider(process.env.GANACHE_RPC_URL || 'http://127.0.0.1:8545');
  const addrPath = path.resolve(__dirname, '../../src/pages/src/web3/addresses.json');
  const json = JSON.parse(fs.readFileSync(addrPath, 'utf8'));
  const g = json.ganache || {};
  if (!g.registry || !g.marketplace) throw new Error('ganache addresses missing in addresses.json');
  const [regCode, mktCode] = await Promise.all([
    provider.getCode(g.registry),
    provider.getCode(g.marketplace),
  ]);
  console.log('Registry:', g.registry, 'codeSize:', (regCode.length - 2) / 2);
  console.log('Marketplace:', g.marketplace, 'codeSize:', (mktCode.length - 2) / 2);
  if (regCode === '0x' || mktCode === '0x') throw new Error('One or more contracts not found on-chain');

  // Also read simple registry state: nextPropertyId
  const Registry = await hre.ethers.getContractFactory('contracts/core/PropertyRegistry.sol:PropertyRegistry');
  const registry = Registry.attach(g.registry).connect(provider);
  const nextId = await registry.nextPropertyId();
  console.log('nextPropertyId:', nextId.toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
