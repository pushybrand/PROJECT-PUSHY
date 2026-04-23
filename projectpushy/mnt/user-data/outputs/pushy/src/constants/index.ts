// src/constants/index.ts
// PUSHY — Game & Chain Constants

import { CoreRarity, OperatorTier } from '../types';

// ─── NETWORK ──────────────────────────────────────────────────────────────────

export const SOLANA_NETWORK = 'mainnet-beta'; // No devnet in prod
export const RPC_ENDPOINT = process.env.EXPO_PUBLIC_RPC_ENDPOINT ?? 'https://api.mainnet-beta.solana.com';

// Program IDs (replace with deployed addresses)
export const PROGRAM_IDS = {
  GARMENT_REGISTRY: process.env.EXPO_PUBLIC_GARMENT_REGISTRY_PROGRAM ?? '',
  SHARD_STABILIZER: process.env.EXPO_PUBLIC_SHARD_STABILIZER_PROGRAM ?? '',
  CORE_FORGE: process.env.EXPO_PUBLIC_CORE_FORGE_PROGRAM ?? '',
  PUSHY_TOKEN_MINT: process.env.EXPO_PUBLIC_PUSHY_MINT ?? '',
  MERKLE_TREE: process.env.EXPO_PUBLIC_MERKLE_TREE ?? '',
};

// ─── CORE FORGE ───────────────────────────────────────────────────────────────

export const CORE_FORGE_COSTS: Record<CoreRarity, number> = {
  static: 100,
  signal: 250,
  kyokai: 500,
  sovereign: 1000, // + NFC scan required
};

export const CORE_BURN_VALUES: Record<CoreRarity, number> = {
  static: 50,
  signal: 150,
  kyokai: 400,
  sovereign: 1200,
};

export const CORE_DROP_RATES: Record<CoreRarity, number> = {
  static: 0.60,
  signal: 0.28,
  kyokai: 0.10,
  sovereign: 0.02,
};

// ─── OPERATORS ────────────────────────────────────────────────────────────────

export const OPERATOR_LEVEL_GATES: Record<OperatorTier, number> = {
  recruit: 0,
  striker: 10,
  heavy: 25,
  ghost: 50,
};

export const GHOST_PHASE_DURATION_MS = 45_000; // 45 seconds
export const SIGNAL_SHIELD_DURATION_MS = 60_000; // 60 seconds

// ─── NFC ──────────────────────────────────────────────────────────────────────

export const NFC_SHIELD_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
export const NFC_GHOST_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── ASYNC STORAGE KEYS ───────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  PLAYER_XP: 'pushy:player:xp',
  PLAYER_LEVEL: 'pushy:player:level',
  PLAYER_OPERATOR: 'pushy:player:operator',
  SHADOW_TOKENS: 'pushy:tokens:shadow',
  FRAGMENTS: 'pushy:fragments',
  NFC_SCANS: 'pushy:nfc:scans',
  LAST_EXTRACTION: 'pushy:extraction:lastTimestamp',
  GAME_SESSION: 'pushy:session:current',
  TX_HISTORY: 'pushy:tx:history',
} as const;

// ─── SEASON ───────────────────────────────────────────────────────────────────

export const CURRENT_SEASON = 1;
export const SESSION_TOKEN_CAP = 500;
