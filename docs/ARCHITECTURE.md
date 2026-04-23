# PUSHY — SYSTEM ARCHITECTURE

## The Phygital Bridge

PUSHY operates across three layers simultaneously. The bridge between them is the product.

---

## Layer 1: Physical (NFC Garments)

Every PUSHY item ships with a **NTAG215 NFC chip** embedded in the garment seam.

**Tag Payload:**
```json
{
  "uid": "PUSHY-GARMENT-<UUID>",
  "operatorFreq": "ghost" | "striker" | "heavy",
  "mintRef": "<on-chain registry address>",
  "version": "1.0"
}
```

Tags are **read-only post-manufacture**. The UID is registered on-chain at the point of physical garment mint. Tampering with the tag invalidates the registry lookup.

---

## Layer 2: Mobile Application (Solana Seeker)

### NFC Bridge Flow

```
User scans garment
        ↓
NFCBridgeService.scan()         ← Seeker NFC hardware
        ↓
validateGarmentUID(uid)         ← RPC call to on-chain registry
        ↓
[VALID]                         [INVALID]
  ↓                               ↓
applyEffect()                   StaticGlitchOverlay()
HapticService.pulse('confirm')  HapticService.pulse('static')
```

### Haptic Feedback Map

| Event | Pattern |
|---|---|
| Extraction pulse | 3× short burst, escalating intensity |
| Static collision | Irregular stutter, 800ms |
| NFC scan confirm | Single long pulse, 400ms |
| Core forged | Double pulse + fade |
| Signal Shield active | Continuous low hum, 60s |

### State Architecture

```
AsyncStorage (local)
├── player.xp
├── player.level
├── player.operatorTier
├── shadowTokens.count
├── fragments[]
└── nfcGarments[] (scanned UIDs, cached)

Solana Mainnet (on-chain)
├── $PUSHY token account
├── Kyōkai Core cNFTs (Bubblegum)
└── Garment registry (custom program)
```

---

## Layer 3: Blockchain (Solana Mainnet)

### Program Architecture

```
pushy-program (Anchor)
├── garment_registry        ← NFC UID → wallet ownership map
├── shard_stabilizer        ← Shadow Token → Stabilized Shard conversion
└── core_forge              ← Shard → cNFT mint (Bubblegum CPI)

$PUSHY SPL Token
└── Mint authority: multisig (post-hackathon)

Kyōkai Cores
└── Compressed NFTs via Metaplex Bubblegum
    └── Tree: <MERKLE_TREE_ADDRESS>
```

### Transaction Flow: Extraction

```
1. Player initiates Extract in UI
2. App builds tx: shard_stabilizer.extract(shadowTokenCount)
3. MWA presents tx to Seed Vault
4. User approves on-device
5. Seed Vault signs (hardware-isolated)
6. Tx broadcast to Mainnet
7. App listens for confirmation
8. AsyncStorage updated (tokens decremented)
9. Haptic: extraction pulse fired
```

### Transaction Flow: Forge Core

```
1. Player initiates Forge (requires min 100 shards)
2. App builds tx: core_forge.mint(shardAccount, metadata)
   └── CPI → Bubblegum → compressed mint
3. MWA → Seed Vault → User signs
4. Core appears in wallet as cNFT
5. Optional: burn path → $PUSHY credited
```

---

## Security Model

- **No custodial keys.** All signing via Seed Vault hardware module.
- **NFC tags read-only.** UID validation is on-chain, not client-side.
- **Shadow Tokens are off-chain.** Only Stabilized Shards and above hit the chain — reduces gas friction during gameplay.
- **MWA enforces approval.** Every Mainnet action requires explicit user confirmation via wallet adapter.

---

## Scalability Notes

- Compressed NFTs (cNFTs) allow minting at ~$0.000005/Core vs standard NFT costs.
- Off-chain Shadow Tokens keep gameplay fluid — extraction is the on-chain threshold event.
- Operator tier logic lives in `src/utils/levelingSystem.ts` — stateless, pure functions, easily upgradeable.

---

*For NFC tag spec → `NFC_BRIDGE.md`*  
*For token economy → `TOKENOMICS.md`*  
*For Operator tiers → `OPERATORS.md`*
