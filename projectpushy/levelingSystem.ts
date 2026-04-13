// src/utils/levelingSystem.ts
// Signal Optimization — XP & Operator Tier Logic
// Pure functions. No side effects. Easily unit-testable.

import { OperatorTier } from '../types';

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const OPERATOR_THRESHOLDS: Record<OperatorTier, number> = {
  recruit: 0,
  striker: 10,
  heavy: 25,
  ghost: 50,
};

// XP required to reach level N from level N-1
// Exponential curve: base 100, multiplier 1.15 per level
const XP_PER_LEVEL_BASE = 100;
const XP_MULTIPLIER = 1.15;

// Max Shadow Tokens earnable per session
export const SESSION_TOKEN_CAP = 500;

// Extraction cooldown in milliseconds (4 hours)
export const EXTRACTION_COOLDOWN_MS = 4 * 60 * 60 * 1000;

// ─── LEVEL CALCULATION ────────────────────────────────────────────────────────

/**
 * XP required to reach a given level from level 0
 */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  let total = 0;
  for (let i = 1; i <= level; i++) {
    total += Math.floor(XP_PER_LEVEL_BASE * Math.pow(XP_MULTIPLIER, i - 1));
  }
  return total;
}

/**
 * Current level based on total XP
 */
export function levelFromXP(xp: number): number {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) {
    level++;
  }
  return level;
}

/**
 * XP progress within current level (0–1 float)
 */
export function levelProgress(xp: number): number {
  const currentLevel = levelFromXP(xp);
  const currentLevelXP = xpForLevel(currentLevel);
  const nextLevelXP = xpForLevel(currentLevel + 1);
  const delta = nextLevelXP - currentLevelXP;
  return (xp - currentLevelXP) / delta;
}

/**
 * XP remaining to reach next level
 */
export function xpToNextLevel(xp: number): number {
  const currentLevel = levelFromXP(xp);
  return xpForLevel(currentLevel + 1) - xp;
}

// ─── OPERATOR TIER ────────────────────────────────────────────────────────────

/**
 * Determine operator tier from level alone.
 * Ghost requires additional NFC validation — this returns the tier eligibility.
 */
export function operatorTierFromLevel(level: number): OperatorTier {
  if (level >= OPERATOR_THRESHOLDS.ghost) return 'ghost';
  if (level >= OPERATOR_THRESHOLDS.heavy) return 'heavy';
  if (level >= OPERATOR_THRESHOLDS.striker) return 'striker';
  return 'recruit';
}

/**
 * Check if player is eligible for Ghost (level gate only — NFC gate handled separately)
 */
export function isGhostEligible(level: number): boolean {
  return level >= OPERATOR_THRESHOLDS.ghost;
}

/**
 * Levels until next operator tier unlock
 */
export function levelsToNextTier(level: number): number | null {
  const tiers = Object.values(OPERATOR_THRESHOLDS).sort((a, b) => a - b);
  const next = tiers.find((threshold) => threshold > level);
  return next !== undefined ? next - level : null; // null = max tier reached
}

// ─── TOKEN MECHANICS ──────────────────────────────────────────────────────────

/**
 * Shadow Token generation rate multiplier based on operator
 */
export function tokenRateMultiplier(tier: OperatorTier): number {
  switch (tier) {
    case 'striker': return 2.0;
    case 'heavy': return 1.0;
    case 'ghost': return 2.0; // ×2 during phase, applied separately
    case 'recruit': return 1.0;
  }
}

/**
 * Static damage reduction as a decimal (0–1)
 */
export function staticDamageReduction(tier: OperatorTier): number {
  switch (tier) {
    case 'heavy': return 0.4;
    case 'ghost': return 0.2; // partial during phase
    case 'striker': return 0.0;
    case 'recruit': return 0.0;
  }
}

/**
 * Whether extraction cooldown has elapsed
 */
export function canExtract(lastExtractionTimestamp: number | undefined): boolean {
  if (!lastExtractionTimestamp) return true;
  return Date.now() - lastExtractionTimestamp >= EXTRACTION_COOLDOWN_MS;
}

/**
 * Ms remaining until extraction is available
 */
export function extractionCooldownRemaining(lastExtractionTimestamp: number | undefined): number {
  if (!lastExtractionTimestamp) return 0;
  const elapsed = Date.now() - lastExtractionTimestamp;
  return Math.max(0, EXTRACTION_COOLDOWN_MS - elapsed);
}
