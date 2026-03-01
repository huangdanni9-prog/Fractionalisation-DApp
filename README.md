# Real-Estate Fractionalisation DApp

A decentralised application that lets property owners **tokenise real-estate into fractional shares** (ERC-20 tokens) and trade them on a peer-to-peer marketplace — all running on an Ethereum-compatible blockchain.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Smart Contracts](#smart-contracts)
4. [Frontend Pages](#frontend-pages)
5. [Prerequisites](#prerequisites)
6. [Quick Start (One Command)](#quick-start-one-command)
7. [Manual Step-by-Step Run Guide](#manual-step-by-step-run-guide)
8. [Optional Configuration](#optional-configuration)
9. [Project Structure](#project-structure)
10. [Troubleshooting](#troubleshooting)

---

## System Overview

The system connects three layers:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Blockchain** | Ganache (local Ethereum) | Stores property records, token balances, listings, and dividends on-chain |
| **Smart Contracts** | Solidity 0.8.20 / Hardhat | Business logic — property registration, ERC-20 fractional tokens, marketplace trading, dividend distribution |
| **Frontend** | React 19 + Vite + Tailwind CSS | User interface — browse properties, buy/sell shares, submit listings, admin panel |

### How It Works End-to-End

```
User submits property ──► PropertyFactory (application)
                               │
                         Admin approves
                               │
                         Applicant finalises
                               │
              ┌────────────────┴────────────────┐
              │                                 │
      FractionalToken deployed          PropertyRegistry entry
      (ERC-20, total shares               (metadata, price,
       minted to owner)                    token address)
              │                                 │
              └────────────────┬────────────────┘
                               │
                          Marketplace
                     ┌─────────┴─────────┐
                     │                   │
               Buy shares           Create listing
            (from owner at         (seller escrows tokens,
             primary price)         sets custom price)
                     │                   │
                     │              Fill listing
                     │            (buyer pays seller,
                     │             receives tokens)
                     │                   │
                     └─────────┬─────────┘
                               │
                        Dividend distribution
                      (admin deposits ETH,
                       holders claim pro-rata)
```

1. **Property Submission** — A user calls `PropertyFactory.submitApplication()` with a name, symbol, metadata URI (images/details on IPFS), total shares, and price per share.
2. **Admin Review** — The contract owner approves or rejects the application.
3. **Finalisation** — The applicant calls `finalizeApprovedApplication()`. This deploys a new `FractionalToken` (ERC-20), mints the total supply to the applicant, and registers the property in `PropertyRegistry`.
4. **Primary Market** — Other users call `Marketplace.buyShares()` to purchase shares directly from the property owner at the set price.
5. **Secondary Market** — Any share-holder can call `createListing()` to sell shares at a custom price. Tokens are escrowed (burned from seller, re-minted to buyer on fill).
6. **Dividends** — The admin deposits ETH via `depositDividends()`. All token holders can then `claimDividends()` proportional to their balance.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Frontend (Vite)                │
│  React 19  ·  React Router  ·  Tailwind CSS      │
│  ethers.js v6  ·  Chart.js  ·  React Query       │
│              http://localhost:5173               │
└──────────────────────┬───────────────────────────┘
                       │ JSON-RPC (ethers.js)
                       ▼
┌──────────────────────────────────────────────────┐
│            Ganache Local Blockchain              │
│           http://127.0.0.1:8545                  │
│                Chain ID 1337                     │
│                                                  │
│  ┌──────────────┐  ┌────────────────────────┐    │
│  │ Property     │  │ PropertyFactory        │    │
│  │ Registry     │◄─┤ (application workflow) │    │
│  └──────┬───────┘  └────────────────────────┘    │
│         │                                        │
│  ┌──────┴───────┐  ┌────────────────────────┐    │
│  │ Marketplace  │──┤ FractionalToken (ERC20)│    │
│  │ (buy/sell/   │  │ (one per property)     │    │
│  │  dividends)  │  └────────────────────────┘    │
│  └──────────────┘                                │
└──────────────────────────────────────────────────┘
```

---

## Smart Contracts

| Contract | File | Role |
|----------|------|------|
| **PropertyRegistry** | `contracts/contracts/core/PropertyRegistry.sol` | Central registry — stores metadata URI, token address, share price, and active status for every property. |
| **PropertyFactory** | `contracts/contracts/core/PropertyFactory.sol` | Application workflow: submit → admin review → approve/reject → applicant finalise (deploys token + registers property). |
| **Marketplace** | `contracts/contracts/core/Marketplace.sol` | Trading engine — primary buys, secondary listings (create/fill/cancel), dividend deposits & claims. Owns the Registry. |
| **FractionalToken** | `contracts/tokens/FractionalToken.sol` | Minimal ERC-20 with owner-only `mint`/`burn`. One instance deployed per property. |

---

## Frontend Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Featured properties carousel, KPI chips, hero gallery |
| `/marketplace` | Marketplace | Browse all active listings, filter, buy shares, clear cache & refresh |
| `/property/:id` | Property Detail | Price chart, ownership pie, order book depth chart, buy/sell actions |
| `/submit` | Submit | Submit a new property listing application |
| `/admin` | Admin | Review pending applications, manage properties (owner-gated) |
| `/profile` | Profile | View your token balances, transaction history, claim dividends |
| `/login` | Login | Wallet connection / authentication |
| `/register` | Register | New user registration |
| `/about_us` | About Us | Project information |
| `/status` | System Status | Smart contract connectivity and deployment health check |

---

## Prerequisites

- **Node.js** v18+ and **npm** (LTS recommended)
- **Windows PowerShell** 5.1+ (ships with Windows 10/11)
- A browser with **MetaMask** (or any injected Ethereum wallet) configured for:
  - Network: `http://127.0.0.1:8545`
  - Chain ID: `1337`

> Dependencies (Hardhat, Ganache, Vite, etc.) are installed automatically by the startup script.

---

## Quick Start (One Command)

From the project root, run:

```powershell
.\dev.ps1
```

This single script will:

1. **Install dependencies** in `contracts/` and `src/pages/`
2. **Kill** any existing process on port 8545
3. **Start Ganache** (local blockchain with persistent state in `contracts/ganache-db/`)
4. **Wait** until Ganache is listening
5. **Compile & deploy** all smart contracts (writes addresses to `src/pages/src/web3/addresses.json`)
6. **Verify** the deployment
7. **Seed** sample properties into the blockchain
8. **Launch the Vite dev server** at `http://localhost:5173`

Each service opens in its own PowerShell window. Close them or press `Ctrl+C` to stop.

### Script Flags

| Flag | Effect |
|------|--------|
| `-NoSeed` | Skip seeding sample data |
| `-SkipInstall` | Skip `npm install` (faster after first run) |

```powershell
# Examples
.\dev.ps1 -NoSeed             # start without sample data
.\dev.ps1 -SkipInstall        # skip npm install
.\dev.ps1 -SkipInstall -NoSeed
```

---

## Manual Step-by-Step Run Guide

If you prefer to run each step yourself:

### 1. Install Dependencies

```powershell
cd contracts
npm install

cd ..\src\pages
npm install
```

### 2. Start Ganache

```powershell
cd contracts
npm run chain
```

Leave this terminal open. Ganache will run on `http://127.0.0.1:8545` (chain ID 1337).

### 3. Compile & Deploy Contracts

In a **new terminal**:

```powershell
cd contracts
npx hardhat compile
npm run deploy:ganache
npm run verify:ganache
```

The deploy script writes contract addresses to `src/pages/src/web3/addresses.json` so the frontend can find them.

### 4. (Optional) Seed Sample Data

```powershell
cd contracts
npm run seed:ganache
```

### 5. Start the Frontend

In a **new terminal**:

```powershell
cd src\pages
npm run dev
```

Open `http://localhost:5173` in your browser.

### 6. Configure MetaMask

1. Add a custom network: RPC URL `http://127.0.0.1:8545`, Chain ID `1337`.
2. Import one of the Ganache accounts using its private key (printed in the Ganache terminal).
3. You now have 1000 test ETH to interact with the dApp.

---

## Optional Configuration

### IPFS Token for Media Uploads

If you want to upload property images/metadata to IPFS via web3.storage:

```powershell
# Create .env in src/pages/
Set-Content -Path src\pages\.env -Value "VITE_WEB3_STORAGE_TOKEN=your_token_here"
```

Without a token, the app stores data inline (data URIs). A safe-storage layer prevents `QuotaExceededError` by trimming oversized fields automatically.

---

## Project Structure

```
Fractionalisation-DAPP/
├── dev.ps1                        # One-command startup script
├── contracts/                     # Blockchain layer
│   ├── contracts/core/            # Solidity sources
│   │   ├── PropertyRegistry.sol   #   property registry
│   │   ├── PropertyFactory.sol    #   application workflow
│   │   └── Marketplace.sol        #   trading + dividends
│   ├── tokens/
│   │   └── FractionalToken.sol    #   ERC-20 fractional share token
│   ├── scripts/
│   │   ├── deploy.js              #   deployment script
│   │   ├── seed-ganache.js        #   seeds sample properties
│   │   └── verify-ganache.js      #   post-deploy verification
│   ├── ganache-db/                #   persistent blockchain state
│   ├── hardhat.config.js          #   Hardhat configuration
│   └── package.json
├── src/pages/                     # Frontend layer
│   ├── index.html                 #   Vite entry point
│   ├── vite.config.js             #   Vite configuration
│   ├── src/
│   │   ├── App.jsx                #   React router + layout
│   │   ├── Home.jsx               #   Home page
│   │   ├── Marketplace.jsx        #   Marketplace page
│   │   ├── PropertyDetail.jsx     #   Property detail page
│   │   ├── Admin.jsx              #   Admin panel
│   │   ├── Submit.jsx             #   Property submission form
│   │   ├── Profile.jsx            #   User profile + dividends
│   │   ├── components/            #   Reusable UI components
│   │   ├── web3/
│   │   │   ├── client.js          #   ethers.js provider + signers
│   │   │   ├── config.js          #   network configuration
│   │   │   ├── addresses.json     #   deployed contract addresses (auto-generated)
│   │   │   └── abi/               #   contract ABIs
│   │   └── utils/                 #   helpers (safe localStorage, image utils)
│   └── package.json
└── backend/                       #   (reserved for future API server)
```

---
