# OPERATOR FREQUENCIES — TIER BREAKDOWN

Operators are the identity layer of PUSHY. Your tier defines how you move through the Trenches.

---

## Unlock Progression

Operators unlock via Signal Optimization (XP leveling). Ghost tier has an additional hardware gate.

```
RECRUIT (Level 0)
    ↓ [Level 10]
STRIKER
    ↓ [Level 25]  
HEAVY
    ↓ [Level 50 + NFC Garment Scan]
GHOST
```

---

## Operator Specs

### ◈ RECRUIT
- **Unlock:** Default
- **Ability:** Standard extraction. No modifiers.
- **Haptic:** Single pulse on extract
- **Notes:** The baseline. Everyone starts here.

---

### ◈ STRIKER
- **Unlock:** Level 10
- **Ability:** Speed burst on extraction — movement speed +30% for 15s after pull. Shadow Token generation rate ×2.
- **Haptic:** Rapid double-pulse on ability activation
- **Playstyle:** High-volume farmers. In and out fast.
- **Weakness:** No damage mitigation. Static hits hard.

---

### ◈ HEAVY
- **Unlock:** Level 25
- **Ability:** Tank Mode — Static damage reduction 40%. Extraction radius +50%.
- **Haptic:** Low sustained rumble during Tank Mode (active)
- **Playstyle:** Anchor players. Hold zones, extract in bulk.
- **Weakness:** Slower movement. Can't outrun The Static.

---

### ◈ GHOST
- **Unlock:** Level 50 **+ Valid NFC Garment Scan**
- **Ability:** Invisibility Pulse — 45s phase-out from Static detection. During phase, double extraction multiplier.
- **Haptic:** Fade-in hum on activation, silence during phase, double-pulse on return
- **Playstyle:** Solo elites. Maximum efficiency, maximum risk if caught post-phase.
- **Hard Gate:** Ghost cannot be activated without scanning a registered PUSHY garment. The frequency is locked to the physical. No garment = no Ghost.
- **Notes:** Ghost Cores command the highest $PUSHY burn value. They're rare for a reason.

---

## Operator Persistence

- Operator tier is stored in `AsyncStorage` and synced to on-chain player account
- Downgrade is not possible (tiers are permanent unlocks)
- NFC garment scan for Ghost is validated on-chain at each session start — lost/sold garments revoke the activation until a new valid scan is performed

---

## Future Operators (Season 2)

Not confirmed. Signal traffic suggests: **WRAITH**, **CONDUIT**, **SOVEREIGN**.

Unlock conditions: unknown. Watch the drops.
