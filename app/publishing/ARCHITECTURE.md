# 📡 Project Pushy: Technical Architecture

## 🧬 Overview
Pushy is a hardware-native extraction ARPG built for the Solana Seeker. It utilizes a **Hybrid-Sovereign Architecture** to bridge high-speed mobile gameplay with the Solana blockchain's security.

## ⚙️ Core Tech Stack
- **Frontend:** React Native (Expo)
- **Blockchain:** @solana/web3.js & @solana-mobile/mobile-wallet-adapter-protocol
- **Storage:** Local AsyncStorage (State) & Solana Mainnet (Value)
- **Audio/Visual:** Expo-AV & Custom Haptic Waveforms

## 🏗️ The Hybrid Engine
To maintain a 120Hz refresh rate on the Seeker display, we separate **Velocity** from **Value**:
1. **The Trenches (Off-Chain):** High-speed game logic, collision detection, and XP accumulation are handled locally.
2. **The Vault (On-Chain):** Identity verification and token/NFT interactions are handled via the **Mobile Wallet Adapter (MWA)**.

## ⚡ Seeker Hardware Integrations

### 1. Seed Vault & MWA
Pushy utilizes the **Solana Mobile Stack** to ensure users never expose their private keys to the game environment. 
- **Connection:** Identity verification via Seeker Genesis Token check.
- **Transactions:** 'Burning' Shadow Tokens to mint Shards is handled via **Solana Memo Transactions** [Program ID: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr].

### 2. Phygital Bridge (NFC)
Using the Seeker's NFC sensor, physical PUSHY garments act as hardware keys.
- **NFC Signature:** Scanning the hoodie tag sets `isHoodieSynced: true`.
- **Game Buff:** Synced players start hunts with a **100% Special Weapon Charge**, rewarding physical brand loyalty with digital utility.

### 3. Haptic Feedback Engine
We utilize the Seeker’s high-fidelity actuator to communicate game state without visual clutter:
- **Directional Damage:** Short, sharp pulses.
- **Extraction Tension:** A ramping frequency pulse as the capture timer nears 3.0s.

## 💰 The $SKR Economy
Pushy is built on the native **$SKR Token Economy**. 
- **Leaderboard Sync:** Players sign a message via the Seed Vault to authorize their weekly Shadow Token count.
- **Rewards:** $SKR is distributed to top operators, driving token velocity and hardware usage.

---
*Developed for the Colosseum Hackathon & Seeker Builder Grant (April 2026)*