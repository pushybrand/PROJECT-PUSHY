# NFC BRIDGE — HARDWARE ↔ GAME LOGIC SPEC

## Overview

The NFC Bridge is the physical-to-digital gate layer. It converts a garment scan into an authenticated, on-chain-validated in-game event.

---

## Hardware Spec

- **Tag Type:** NTAG215 (ISO 14443-A)
- **Capacity:** 504 bytes (sufficient for UID + freq signature + mint ref)
- **Read Range:** ~10cm (standard Seeker NFC proximity)
- **Write Protection:** Locked at manufacture. Tags are read-only in field.

---

## Scan Flow

```
[User taps garment to Seeker]
        ↓
Seeker NFC hardware reads NTAG215
        ↓
NFCBridgeService.scan() receives raw payload
        ↓
Parse: { uid, operatorFreq, mintRef, version }
        ↓
validateGarmentUID(uid)
  → RPC call: garment_registry.lookup(uid)
  → Returns: { owner, registeredFreq, isActive }
        ↓
[Owner matches current wallet?]
  YES → applyGarmentEffect(operatorFreq)
  NO  → renderStaticError("Frequency mismatch. This signal isn't yours.")
        ↓
HapticService.fire(event)
AsyncStorage.setItem('lastNFCScan', { uid, timestamp, effect })
```

---

## Service Interface

```typescript
// src/services/NFCBridgeService.ts

interface GarmentPayload {
  uid: string;
  operatorFreq: 'striker' | 'heavy' | 'ghost';
  mintRef: string;
  version: string;
}

interface ValidationResult {
  valid: boolean;
  owner: string;
  effect: 'signal_shield' | 'ghost_unlock' | 'operator_boost';
  duration?: number; // seconds
}

class NFCBridgeService {
  scan(): Promise<GarmentPayload>
  validate(uid: string, walletPublicKey: string): Promise<ValidationResult>
  applyEffect(result: ValidationResult): void
  getLastScan(): Promise<GarmentPayload | null>
  clearCache(): void
}
```

---

## In-Game Effects

| Garment Type | Effect | Duration | Haptic |
|---|---|---|---|
| Standard Hoodie | Signal Shield (invincibility) | 60s | Long pulse |
| Operator Patch | Operator frequency unlock | Session | Confirm pulse |
| Limited Drop | Sovereign frequency + 2× XP | 120s | Escalating burst |

---

## On-Chain Registry

The garment registry is a custom Anchor program. Each garment is registered at point-of-physical-mint:

```
garment_registry account
├── uid: String          (NTAG215 unique ID)
├── owner: Pubkey        (initial buyer wallet)
├── freq: String         (operator frequency)
├── mint_ref: Pubkey     (associated cNFT if garment-linked Core exists)
├── active: bool
└── transfer_count: u8   (garments can be resold; ownership transfers on-chain)
```

**Resale handling:** When a PUSHY garment changes hands, the new owner initiates an on-chain ownership transfer via `garment_registry.transfer()`. Ghost unlock follows the physical garment, not the original buyer.

---

## Error States

| Error | Cause | UX Response |
|---|---|---|
| `NFC_READ_FAIL` | Hardware/proximity issue | "Get closer. The Signal is weak here." |
| `UID_NOT_FOUND` | Unregistered tag | "This frequency is unknown to the Kyōkai." |
| `OWNER_MISMATCH` | Garment not in user's name | "This signal isn't yours." |
| `TAG_INACTIVE` | Garment flagged/revoked | "Frequency terminated." |
| `COOLDOWN_ACTIVE` | Scanned too recently | "Signal recharging. Try in Xm Xs." |

---

## Scan Cooldown

To prevent scan-farming Signal Shield:
- Signal Shield: 30-minute cooldown between activations per garment UID
- Ghost unlock: 24-hour session lock (one Ghost activation per day per garment)
- Cooldown state stored in `AsyncStorage`, validated server-side at extraction

---

*NFC integration uses `react-native-nfc-manager` on Expo with Seeker hardware overrides where applicable.*
