require('dotenv').config();
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  // Clean + compile to ensure artifacts exist when running via node
  await hre.run('clean');
  await hre.run('compile');
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  // Deploy Registry
  const Registry = await hre.ethers.getContractFactory('contracts/core/PropertyRegistry.sol:PropertyRegistry');
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  console.log('PropertyRegistry:', await registry.getAddress());

  // Deploy Marketplace
  const Marketplace = await hre.ethers.getContractFactory('contracts/core/Marketplace.sol:Marketplace');
  const marketplace = await Marketplace.deploy(deployer.address, await registry.getAddress());
  await marketplace.waitForDeployment();
  console.log('Marketplace:', await marketplace.getAddress());

  // Transfer registry ownership to marketplace so it can createProperty
  const txOwn = await registry.transferOwnership(await marketplace.getAddress());
  await txOwn.wait();
  console.log('Transferred registry ownership to Marketplace');

  // Deploy PropertyFactory and authorize it as a creator in the registry
  const Factory = await hre.ethers.getContractFactory('contracts/core/PropertyFactory.sol:PropertyFactory');
  const factory = await Factory.deploy(deployer.address, registry);
  await factory.waitForDeployment();
  console.log('PropertyFactory:', await factory.getAddress());
  // Authorize factory via Marketplace owner wrapper to simplify UX
  try {
    const txAuth = await marketplace.setAuthorizedCreator(await factory.getAddress(), true);
    await txAuth.wait();
    console.log('Authorized PropertyFactory in Registry');
  } catch (e) {
    console.warn('Failed to authorize factory in registry:', e?.message || e);
  }

  // Example: create a property (optional demo)
  // const tx = await marketplace.createProperty(
  //   'Damansara Villa Shares',
  //   'DMNS',
  //   'ipfs://example-metadata',
  //   100000,
  //   hre.ethers.parseEther('0.01'),
  //   deployer.address
  // );
  // await tx.wait();

  // Persist addresses to frontend config for the active network
  try {
    const network = hre.network.name || 'localhost';
    const isLocal = network === 'localhost' || network === 'hardhat';
    const netKey = isLocal ? 'local' : (network === 'sepolia' ? 'sepolia' : network);
    const pagesDir = path.resolve(__dirname, '../../src/pages/src/web3');
    const addrPath = path.join(pagesDir, 'addresses.json');
    let json = { local: { registry: '', marketplace: '', factory: '' }, sepolia: { registry: '', marketplace: '', factory: '' } };
    try { json = JSON.parse(fs.readFileSync(addrPath, 'utf8')); } catch {}
    json[netKey] = {
      registry: await registry.getAddress(),
      marketplace: await marketplace.getAddress(),
      factory: await factory.getAddress(),
    };
    fs.writeFileSync(addrPath, JSON.stringify(json, null, 2));
    console.log('Wrote frontend addresses.json for', netKey, json[netKey]);
  } catch (e) {
    console.warn('Failed to write frontend addresses.json:', e?.message || e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
