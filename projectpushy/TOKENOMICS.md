# $PUSHY TOKENOMICS + KYŌKAI CORE ECONOMY

## The Two-Asset System

PUSHY runs on two distinct assets with intentional separation of purpose.

---

## $PUSHY — Utility Token (SPL, Solana Mainnet)

**Total Supply:** TBD — emission-controlled via extraction rate caps  
**Mint Authority:** Program-controlled (no team minting)

### Earn
- Burn Kyōkai Cores → receive $PUSHY at burn rate
- Future: PvP wager pools, tournament payouts

### Spend
- Operator frequency upgrades (non-level-gated cosmetics)
- Signal Booster consumables (temporary XP multipliers)
- Garment pre-sale access passes

### Burn Mechanics
$PUSHY has a **deflationary pressure mechanism**: premium in-game actions require burning tokens, permanently removing them from supply.

---

## Kyōkai Cores (cNFTs — Metaplex Bubblegum)

Cores are the primary collectible. Each Core carries:

```json
{
  "name": "Kyōkai Core #<ID>",
  "attributes": [
    { "trait_type": "Operator", "value": "Ghost | Striker | Heavy" },
    { "trait_type": "Frequency", "value": "0–100" },
    { "trait_type": "Static Resistance", "value": "0–100" },
    { "trait_type": "Garment Linked", "value": "true | false" },
    { "trait_type": "Season", "value": "1" }
  ]
}
```

**Garment Linked** Cores — forged with an NFC garment scan active — carry a rarity bonus and are permanently tied to that garment's UID in the on-chain registry.

### Core Rarity Tiers

| Tier | Forge Cost (Shards) | $PUSHY Burn Value | Drop Rate |
|---|---|---|---|
| Static Core | 100 | 50 | 60% |
| Signal Core | 250 | 150 | 28% |
| Kyōkai Core | 500 | 400 | 10% |
| Sovereign Core | 1000 + NFC scan | 1200 | 2% |

---

## Extraction Rate Caps

To prevent hyperinflation of shards:

- Max Shadow Tokens per session: **500**
- Extraction cooldown: **4 hours** between claims
- Shard-to-Core ratio: fixed at mint time, adjustable via DAO vote (post-launch)

---

## Season Model

Season 1 (Hackathon → Public Launch):
- Fixed Core supply tree
- $PUSHY emission rate: conservative, observer period

Season 2+:
- New Operator frequencies unlocked
- New garment drops introduce new NFC frequencies
- Burn-to-upgrade path for S1 → S2 Core migration

---

*Token contract addresses and Merkle tree will be published post-deploy.*
