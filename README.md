# ▓▓ PUSHY — THE SIGNAL ▓▓

> *The Static consumes. The Signal endures.*

**PUSHY** is a hardware-native Phygital ecosystem built for the [Solana Seeker](https://solanamobile.com) — a mobile extraction game fused with real-world streetwear drops, on-chain tokenomics, and Seed Vault-secured identity.

This is not a Web3 wrapper. This is a new primitive.

---

## ◈ THE WORLD: KYŌKAI

The **Kyōkai** is the borderland between signal and noise. **The Static** — predatory AI glitch-beasts — hunts players through the Trenches. Your only weapon is frequency. Your only armor is authenticity.

```
PHYSICAL (NFC Garment)
        ↓
  [Signal Shield / Operator Unlock]
        ↓
DIGITAL (In-Game Trigger)
        ↓
  [Shadow Tokens → Extraction]
        ↓
ON-CHAIN (Solana Mainnet)
        ↓
  [Kyōkai Core cNFT / $PUSHY Burn]
```

Scan the hoodie. Break the Static. Forge your Core.

---

## ◈ TECH STACK

| Layer | Technology |
|---|---|
| Frontend | React Native / Expo (Seeker-optimized) |
| Blockchain | Solana Mainnet — `@solana/web3.js` |
| Wallet | `@solana-mobile/mobile-wallet-adapter-protocol` |
| State | `AsyncStorage` (XP, Levels, Fragments) |
| Hardware | Seed Vault · Haptic Engine · NFC Bridge |
| Tokens | $PUSHY (SPL) · Kyōkai Cores (cNFTs via Bubblegum) |

---

## ◈ REPO STRUCTURE

```
pushy/
├── src/
│   ├── components/       # Reusable UI (SignalMeter, StaticOverlay, CoreCard)
│   ├── screens/          # App screens (Trenches, Extraction, Forge, Operator)
│   ├── hooks/            # useHaptic, useNFC, useSeedVault, useWalletAdapter
│   ├── services/         # Solana tx builders, NFC listener, token logic
│   ├── utils/            # Leveling calc, shard math, frequency maps
│   ├── constants/        # Operator tiers, token config, game constants
│   └── types/            # Full TypeScript definitions
├── docs/
│   ├── ARCHITECTURE.md   # Phygital bridge deep-dive
│   ├── TOKENOMICS.md     # $PUSHY + Core economy spec
│   ├── OPERATORS.md      # Striker / Heavy / Ghost tier breakdown
│   └── NFC_BRIDGE.md     # Hardware ↔ game logic spec
├── logs/                 # Dev logs, sprint notes, debug traces
├── scripts/              # Deploy, mint, burn CLI tools
├── config/               # Environment configs (devnet / mainnet)
└── assets/               # Fonts, textures, audio pulses
```

---

## ◈ SIGNAL OPTIMIZATION (LEVELING)

XP is earned in the Trenches. Levels unlock **Operator Frequencies** — loadout archetypes that define your extraction style.

| Level | Operator | Ability |
|---|---|---|
| 0–9 | Recruit | Base extraction. No shield. |
| 10–24 | **Striker** | Speed burst. Double token pull rate. |
| 25–49 | **Heavy** | Tank mode. Static damage reduction 40%. |
| 50+ | **Ghost** | Invisibility pulse. NFC-only unlock. |

Ghost tier **requires a physical PUSHY garment scan** to activate. No garment, no Ghost. That's the phygital gate.

---

## ◈ THE PHYGITAL BRIDGE

Every PUSHY hoodie, patch, and drop ships with an embedded **NFC tag** containing:
- Garment UID (unique per item)
- Operator frequency signature
- Mint authority reference

Scanning via the Seeker's NFC reader:
1. Triggers `NFCBridgeService.scan()` 
2. Validates garment UID against on-chain registry
3. Fires haptic confirmation pulse (Seed Vault proximity feedback)
4. Applies in-game effect: Signal Shield (60s invincibility) or Ghost unlock

> Full spec → [`docs/NFC_BRIDGE.md`](docs/NFC_BRIDGE.md)

---

## ◈ ON-CHAIN FLOW

```
Shadow Tokens (off-chain, AsyncStorage)
        ↓ [Extraction — MWA Transaction Request]
Stabilized Shards (on-chain SPL fragments)
        ↓ [Forge — Bubblegum cNFT mint]
Kyōkai Core (cNFT)        OR        $PUSHY burn → utility
```

Every Claim and Forge is a real Mainnet transaction. MWA prompts the Seed Vault. The player signs. The chain records. No custodial bridges. No compromise.

---

## ◈ SEEKER HARDWARE INTEGRATION

| Feature | Integration |
|---|---|
| **Seed Vault** | Private key never leaves hardware. All tx signing isolated. |
| **Haptic Engine** | Extraction pulses, Static collision feedback, NFC scan confirm |
| **NFC Reader** | Garment scan → `NFCBridgeService` → in-game trigger |
| **MWA** | Every on-chain action routes through Seed Vault via MWA protocol |

---

## ◈ GETTING STARTED

```bash
# Clone the signal
git clone https://github.com/YOUR_ORG/pushy.git
cd pushy

# Install dependencies
yarn install

# Configure environment
cp config/env.example.ts config/env.ts
# → Set RPC endpoint, program IDs, NFC registry address

# Run on Seeker (USB debug)
yarn expo run:android --device

# Run devnet simulation
yarn expo start --tunnel
```

> ⚠️ Full Seeker features (Seed Vault, NFC, Haptics) require physical hardware or the official Seeker emulator.

---

## ◈ CONTRIBUTING

This repo is **closed during the hackathon sprint**. Post-submission, contribution guidelines will drop with the v1 public release.

---

## ◈ LICENSE

MIT — but if you bite the aesthetic, we'll know.

---

*Built in the Kyōkai. Forged on Solana. Worn in the streets.*

**▓ PUSHY — STAY SIGNAL ▓**
