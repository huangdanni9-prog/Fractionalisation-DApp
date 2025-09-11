require('dotenv').config();
const hre = require('hardhat');

async function main() {
  const provider = hre.ethers.provider;
  const chain = await provider.getNetwork();
  console.log('ChainId:', chain.chainId.toString());
  const accounts = await provider.send('eth_accounts', []);
  console.log('eth_accounts:', accounts);
  for (const a of accounts.slice(0, 5)) {
    const bal = await provider.getBalance(a);
    console.log(a, 'balance', hre.ethers.formatEther(bal), 'ETH');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
