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
  const [deployer] = await hre.ethers.getSigners();
  console.log('Seeding with deployer:', deployer.address);
  const Marketplace = await hre.ethers.getContractFactory('contracts/core/Marketplace.sol:Marketplace');
  const mkt = Marketplace.attach(g.marketplace).connect(deployer);
  const Registry = await hre.ethers.getContractFactory('contracts/core/PropertyRegistry.sol:PropertyRegistry');
  const registry = Registry.attach(g.registry).connect(deployer);
  const net = await hre.ethers.provider.getNetwork();
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  const feeData = await hre.ethers.provider.getFeeData();
  console.log('Network chainId:', net.chainId?.toString?.() || net.chainId);
  console.log('Deployer balance (ETH):', hre.ethers.formatEther(bal));
  console.log('Fee data:', {
    gasPrice: feeData.gasPrice ? hre.ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei' : null,
    maxFeePerGas: feeData.maxFeePerGas ? hre.ethers.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei' : null,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? hre.ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei' : null,
  });
  // Ensure we act as Marketplace owner (onlyOwner)
  const ownerAddr = await mkt.owner();
  let ownerSigner;
  try {
    ownerSigner = await hre.ethers.getSigner(ownerAddr);
  } catch {
    // Fallback: try to use the first signer if direct lookup fails
    ownerSigner = deployer;
  }
  const ownerBal = await hre.ethers.provider.getBalance(ownerAddr);
  console.log('Marketplace owner:', ownerAddr, 'balance:', hre.ethers.formatEther(ownerBal), 'ETH');
  if (ownerBal === 0n) throw new Error('Marketplace owner has 0 ETH on Ganache; ensure Ganache wallet matches the DB mnemonic');

  const name = 'Test Tower';
  const symbol = 'TTWR';
  const metadataURI = 'data:application/json,{"name":"Test Tower","description":"Seeded property"}';
  const totalShares = 1000000n;
  const sharePriceWei = hre.ethers.parseEther('0.01');
  const owner = ownerAddr;
  const tx = await mkt.connect(ownerSigner).createProperty(name, symbol, metadataURI, totalShares, sharePriceWei, owner);
  const rcpt = await tx.wait();
  console.log('createProperty tx:', rcpt?.hash);
  // Derive the created propertyId from registry counter
  const next = await registry.nextPropertyId();
  const createdId = (typeof next === 'bigint') ? next - 1n : BigInt(next) - 1n;
  const prop = await registry.getProperty(createdId);
  console.log('Created propertyId:', createdId.toString());
  console.log('Token:', prop.fractionalToken);
}

main().catch((e) => { console.error(e); process.exit(1); });
