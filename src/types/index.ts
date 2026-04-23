// src/types/index.ts
// PUSHY — Core Type Definitions

// ─── PLAYER ───────────────────────────────────────────────────────────────────

export type OperatorTier = 'recruit' | 'striker' | 'heavy' | 'ghost';

export interface PlayerState {
  walletPublicKey: string;
  xp: number;
  level: number;
  operatorTier: OperatorTier;
  shadowTokens: number;
  fragments: Fragment[];
  nfcScans: NFCScanRecord[];
  lastExtraction?: number; // unix timestamp
}

// ─── TOKENS & SHARDS ──────────────────────────────────────────────────────────

export interface Fragment {
  id: string;
  type: 'static' | 'signal' | 'kyokai' | 'sovereign';
  quantity: number;
  acquiredAt: number;
}

export type CoreRarity = 'static' | 'signal' | 'kyokai' | 'sovereign';

export interface KyokaiCore {
  mintAddress: string;
  operator: OperatorTier;
  frequency: number; // 0–100
  staticResistance: number; // 0–100
  garmentLinked: boolean;
  garmentUID?: string;
  season: number;
  rarity: CoreRarity;
}

// ─── NFC ──────────────────────────────────────────────────────────────────────

export type NFCEffect = 'signal_shield' | 'ghost_unlock' | 'operator_boost';

export interface GarmentPayload {
  uid: string;
  operatorFreq: OperatorTier;
  mintRef: string;
  version: string;
}

export interface NFCScanRecord {
  uid: string;
  timestamp: number;
  effect: NFCEffect;
  valid: boolean;
}

export interface GarmentValidationResult {
  valid: boolean;
  owner: string;
  effect: NFCEffect;
  duration?: number;
}

// ─── HAPTIC ───────────────────────────────────────────────────────────────────

export type HapticEvent =
  | 'extract_pulse'
  | 'static_collision'
  | 'nfc_confirm'
  | 'core_forged'
  | 'shield_active'
  | 'ability_activate'
  | 'tank_mode_active'
  | 'ghost_phase_in'
  | 'ghost_phase_out';

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export type TxType = 'extraction' | 'forge' | 'burn' | 'transfer';

export interface PushyTransaction {
  type: TxType;
  signature?: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  payload: Record<string, unknown>;
}

// ─── GAME STATE ───────────────────────────────────────────────────────────────

export interface GameSession {
  sessionId: string;
  startedAt: number;
  operator: OperatorTier;
  signalShieldActive: boolean;
  shieldExpiry?: number;
  ghostPhaseActive: boolean;
  ghostExpiry?: number;
  shadowTokensThisSession: number;
}
