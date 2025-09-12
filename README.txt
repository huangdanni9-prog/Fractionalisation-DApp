# Fractionalisation DApp — Quick Run

1) Start a local node on 8545
   - Use Hardhat Node or Ganache (stop anything else using 8545)
   - Example: `npx hardhat node`

2) Deploy contracts (writes web3 addresses for frontend)
   - From `contracts/`: `npx hardhat run scripts/deploy.js --network localhost`

3) Frontend install and run
   - From `src/pages/`: `npm install` then `npm run dev`

Optional
- IPFS uploads: set `VITE_WEB3_STORAGE_TOKEN` in `src/pages/.env` to avoid 401s and large inline data.

What’s new
- Home has a “Featured Properties” carousel (autoplay, responsive). All active properties rotate.
- Safe local storage prevents QuotaExceeded by trimming oversized fields if needed.

Notes
- After node restarts: re-run deploy so `src/pages/src/web3/addresses.json` is fresh.
- Marketplace has Clear cache + Refresh to resync with chain.
- Property Detail shows Source (on-chain vs local cache) and has a Refresh button.
