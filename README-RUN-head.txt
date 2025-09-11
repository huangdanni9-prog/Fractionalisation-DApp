# Fractionalisation DApp: Local Run

Start a local node (if one isn’t running on 8545):
  - Either close the existing process bound to 8545 or use a different port.
Deploy contracts (this script also writes frontend/web3/addresses.json):
  - From `contracts/`: `npx hardhat run scripts/deploy.js --network localhost`
Start the frontend:
  - From `src/pages/`: `npm run dev`

Notes
- If you restart the node, you must redeploy and let the deploy script update `src/pages/src/web3/addresses.json`.
- Marketplace page has a Clear local cache + Refresh (on-chain) flow to resync listings.
- Property Detail page shows a Source badge (on-chain vs local cache) and includes a Refresh button.
