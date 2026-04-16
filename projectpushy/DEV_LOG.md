# PUSHY — DEV LOG

## FORMAT
Each entry: `[2026-04-16] | SPRINT 2 | IN POGRESS | UPDATES TO THE GAME SHARD HUNTER.

Death screen — when health hits 0, the screen dims to near-black, "STATIC OVERLOAD" flashes in red, a countdown from 5 appears, and a pulsing "HUNT AGAIN" button glows. Tap it to restart instantly. If the 5 seconds elapse, it returns to the main screen automatically.
Health bar — 5 green pip squares in the HUD (top-right). Each enemy hit removes one pip. After a hit there's a 1.5-second invincibility window (player flashes red twice). The bar doesn't kill you on the first touch anymore.
Spree system — kills within 4 seconds of each other build a streak. At ×5 "STATIC SPREE ×5!" flashes centre-screen in gold, scaling up. Escalates to "STATIC DOMINATION ×7!" and "STATIC RAMPAGE ×10!". Each spree hit earns bonus XP multiplied by the streak count.
Explosions — enemies burst into an expanding coloured circle on death. Red for regulars, brighter red for tanks, orange for bosses (when implemented). They fade over ~25 frames.
Special weapon ready — when charge hits 100%, the special button pulses, a haptic fires, and bold text flashes centre-screen: "⚡ EMP BOMB READY!" in the operator's colour.
Next Round flash — after tapping Resume Hunt, "NEXT ROUND / LET'S HUNT!" flashes twice in green over a dark overlay before the run starts.
Bigger header — Shards show at 22px in neon green, Shadow Tokens at 20px in purple, both with text glow.

---

## WEEK 2 — HACKATHON SPRINT

### [2026-04-13] | SPRINT 2 | IN PROGRESS
- Repo restructured to judge-ready state
- README.md: full brand narrative + technical authority
- Architecture documented: Phygital bridge flow, 3-layer diagram
- TypeScript types defined: PlayerState, KyokaiCore, GarmentPayload, HapticEvent
- Leveling system refactored: pure functions, XP curve formalized, tier gates defined
- Constants centralized: storage keys, program IDs, forge costs, NFC cooldowns
- Docs added: TOKENOMICS.md, OPERATORS.md, NFC_BRIDGE.md, ARCHITECTURE.md

**Blockers:** Program IDs pending deploy. RPC endpoint TBC.  
**Next:** NFCBridgeService implementation, HapticService, MWA integration scaffold

---

### [TBD] | SPRINT 2 | PLANNED
- [ ] `NFCBridgeService.ts` — full scan → validate → effect pipeline
- [ ] `HapticService.ts` — event map, Seeker hardware calls
- [ ] `useSeedVault.ts` — hook for Seed Vault tx signing
- [ ] `useWalletAdapter.ts` — MWA protocol hook
- [ ] Extraction screen: UI + tx builder
- [ ] Forge screen: Core mint UI
- [ ] Devnet smoke tests

---

## WEEK 1 — LOCAL PROTOTYPE

### [2026-04-06] | SPRINT 1 | COMPLETE
- Initial Expo project bootstrapped
- Basic XP + leveling logic (pre-refactor)
- Operator unlock flow (non-scalable, now replaced)
- AsyncStorage state prototype
- Static overlay UI concept
- NFC hook placeholder

---

*Log maintained manually. Each dev session gets an entry.*
