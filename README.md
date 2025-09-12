# Fractionalisation DApp — Local Run Guide

This guide helps you run the contracts locally and start the React frontend with the new Featured Properties slider.

## Prerequisites

- Node.js LTS and npm
- Hardhat (installed via npx)
- A local EVM at `http://127.0.0.1:8545` (Hardhat Node or Ganache)

## 1) Start a local node (port 8545)

If a node is already using 8545, stop it or update your network config.

```powershell
# Option A: Hardhat node (recommended for local dev)
npx hardhat node

# Option B: Ganache (if you prefer)
# ganache --wallet.mnemonic "<your mnemonic>" --server.host 127.0.0.1 --server.port 8545
```

## 2) Deploy contracts

From the `contracts/` folder, deploy to the local network. The deploy script writes addresses to the frontend at `src/pages/src/web3/addresses.json`.

```powershell
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

If you restart the node, redeploy so the frontend picks up fresh addresses.

## 3) Install and run the frontend

```powershell
cd ..\src\pages
npm install
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

## Optional: IPFS token for media/metadata

If you plan to upload media/metadata to web3.storage (IPFS), set a token so uploads don’t fail with 401 and to keep local storage small:

```powershell
# Create .env in src/pages/
Set-Content -Path .env -Value "VITE_WEB3_STORAGE_TOKEN=your_web3_storage_token_here"
```

Without a token, the app may store larger inline data temporarily. We’ve added safe local storage to avoid quota errors, but IPFS is recommended for real media.

## Featured Properties slider (Home page)

- The Home page now shows a “Featured Properties” section with a responsive, autoplay carousel.
- Pause on hover; navigate with arrows or dots.
- It displays all active properties from local cache/on-chain merges, not just the first three.
- To adjust speed or slides per breakpoint, see `src/pages/src/components/Carousel.jsx` and the usage in `src/pages/src/Home.jsx` (TopProperties -> Carousel props like `interval`, `breakpoints`).

## Data persistence and safety

- Properties are cached in `localStorage` under the `properties` key.
- A safe storage layer automatically trims oversized fields on quota limits (e.g., large data URIs), preserving essential info without deleting your properties.
- Archived items are tracked in `archivedPropertyIds` and `archivedLocal` flags.

## Marketplace and details

- Marketplace includes a Clear local cache + Refresh flow to re-fetch and reconcile listings with on-chain state.
- Property Detail shows a Source badge (on-chain vs local cache) and includes a Refresh button.

## Troubleshooting

- Port 8545 busy: stop the other process or use a different port/network config.
- Addresses mismatch after node restart: redeploy contracts (Step 2) to refresh `addresses.json`.
- 401 from web3.storage: set `VITE_WEB3_STORAGE_TOKEN` as shown above.
- QuotaExceededError: the safe storage layer is active; if needed, clear local cache in the Marketplace or manually remove the `properties` key from the browser’s localStorage.

## Paths reference

- Contracts: `contracts/`
- Frontend: `src/pages/`
- Web3 addresses output: `src/pages/src/web3/addresses.json`