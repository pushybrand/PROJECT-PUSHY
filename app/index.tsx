// ── Solana Mobile Wallet Adapter — Buffer polyfill must come before any Solana import ──
import { Buffer } from 'buffer';
global.Buffer = Buffer;

import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Easing,
  Dimensions, Image, Vibration, ImageBackground,
  PanResponder, useWindowDimensions, TextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Audio } from 'expo-av';

// Solana + MWA
import { PublicKey, Transaction, TransactionInstruction, Connection, clusterApiUrl } from '@solana/web3.js';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';

// ── RPC cluster — flip this between 'devnet' and 'mainnet-beta' for release ──
const SOLANA_CLUSTER = 'mainnet-beta';
// ── RPC Configuration ────────────────────────────────────────────────────────
// Replace with your own Helius API key from https://helius.dev (free tier works).
// For production: move this to an environment variable or a backend proxy.
// Never commit a live API key to a public repo — rotate this key after forking.
const HELIUS_API_KEY = 'YOUR_HELIUS_API_KEY_HERE';
const RPC_URL        = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const APP_IDENTITY   = {
  name: 'Kyōkai',
  uri:  'https://pushy.xyz',
  icon: 'favicon.ico',
};
// Seeker Genesis Token mint — placeholder, replace with real mint address when Solana Mobile publishes it
const SEEKER_GENESIS_MINT = '11111111111111111111111111111111';
// $SKR token mint — placeholder until the official mint is published
const SKR_TOKEN_MINT      = '11111111111111111111111111111111';
// Solana Memo program for signed message transactions
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
// SPL Token programs — both must be checked for token-2022 mints
const TOKEN_PROGRAM_ID      = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
// Metaplex Token Metadata Program — used to derive metadata PDAs and read collection info
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
// Kyokai Key — verified collection address. Holders unlock the Kyokazi operator.
const KYOKAI_KEY_COLLECTION = 'AMnjFWcPSWArm3CUbumLJnyuhd3CKJYcpU66fochxp97';

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAYER_SIZE    = 30;
const SHARD_SIZE     = 90;
const ENEMY_SIZE     = 35;
const TOKEN_SIZE     = 12;
const EXTRACT_SIZE   = 80;   // extraction zone diameter
const RESET_DELAY_MS = 2500;

// Heat system
const MAX_HEAT        = 100;
const HEAT_COOLDOWN   = 0.8;
const OVERHEAT_FRAMES = 180;
const HEAT_PER_SHOT   = [14, 28, 20, 22];  // VEKT, SHOKU, GHOST, KYOKAZI

// Forge bars
const FORGE_FILL_RATE  = 2.2;
const FORGE_DRAIN_RATE = 1.8;
const FORGE_MAX        = 100;

// Sequential forge targets: [side, fillTarget] — 'L' or 'R', value 0–100
// Player fills the active bar to each target in order
const FORGE_SEQUENCE = [
  { side: 'L', target: 33  },
  { side: 'R', target: 33  },
  { side: 'L', target: 100 },
  { side: 'R', target: 100 },
];

// Endless Trenches
const EXTRACT_OPEN_SEC        = 15;   // zone stays open 15s
const ENEMY_SPEED_SCALE_SEC   = 20;
const DEATH_PENALTY           = 0.5;
const EXTRACT_BASE_TOKENS     = 5;    // first zone at 5 tokens, then ×2 each run (5→10→20→40…)

// Tank enemy
const TANK_SIZE         = 55;
const TANK_HP           = 4;
const TANK_SPEED        = 0.9;
const TANK_SPAWN_TOKENS = 10;

// Boss enemy — spawns only at player level 5+, at 30 run tokens
const BOSS_SIZE         = 75;
const BOSS_HP           = 8;
const BOSS_SPEED        = 1.4;
const BOSS_SPAWN_TOKENS = 30;
const BOSS_MIN_LEVEL    = 5;

// Splitter enemy — splits into 2 minis on first hit. Spawns from level 2+
const SPLITTER_SIZE       = 40;
const SPLITTER_MINI_SIZE  = 18;
const SPLITTER_SPEED      = 1.7;
const SPLITTER_MIN_LEVEL  = 2;
const SPLITTER_SPAWN_RATE = 12;  // every N seconds, roll to spawn a splitter

// Sniper Boss — large flashing circle that fires projectiles at the player.
// Spawns from extract run 3 onwards.
const SNIPER_SIZE              = 90;
const SNIPER_HP                = 12;
const SNIPER_SPEED             = 0.7;        // very slow — it threatens via bullets, not body collision
const SNIPER_MIN_RUN           = 3;          // appears from the 3rd resumed hunt onwards
const SNIPER_SHOT_INTERVAL_MS  = 1800;       // fires every 1.8s
const SNIPER_BULLET_SPEED      = 4.5;
const SNIPER_BULLET_SIZE       = 12;
const SNIPER_BULLET_LIFE_MS    = 4000;

// Economy
const BURN_COST = 250;

// XP system
const XP_PER_TOKEN             = 1;
const XP_PER_EXTRACT           = 50;
const XP_PER_SPREE             = 20;  // bonus XP per spree hit
const XP_PER_LEVEL             = [0, 50, 120, 200, 300, 420, 560, 720, 900, 1100, 1320];
const UNLOCK_LEVEL_HEAVY       = 5;
const UNLOCK_LEVEL_GHOST       = 10;
const SPECIAL_CHARGE_PER_TOKEN   = 8;
const SPECIAL_CHARGE_PER_EXTRACT = 40;

// Health
const MAX_HEALTH      = 5;   // hits before death
const HIT_INVINCIBLE_FRAMES = 90; // invincibility frames after being hit

// Spree
const SPREE_WINDOW_MS = 4000; // ms between kills to maintain spree

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const MAX_X = width  - PLAYER_SIZE;
  const MAX_Y = height - PLAYER_SIZE - 60;

  // ── Animated values ──────────────────────────────────────────────────────
  const breathAnim         = useRef(new Animated.Value(1)).current;
  const erraticGlow        = useRef(new Animated.Value(1)).current;
  const shakeAnim          = useRef(new Animated.Value(0)).current;
  const introTextOpacity   = useRef(new Animated.Value(0)).current;
  const buttonFlashAnim    = useRef(new Animated.Value(0)).current;
  const epicCoreAnim       = useRef(new Animated.Value(0)).current;
  const scanPulseAnim      = useRef(new Animated.Value(0)).current;
  const purpleFlashAnim    = useRef(new Animated.Value(0)).current;
  const shardVisibilityAnim= useRef(new Animated.Value(1)).current;
  const huntPulseAnim      = useRef(new Animated.Value(0)).current;
  const shieldSpinAnim     = useRef(new Animated.Value(0)).current;
  const joystickPan        = useRef(new Animated.ValueXY()).current;
  const extractPulseAnim   = useRef(new Animated.Value(1)).current;
  const extractTimerAnim   = useRef(new Animated.Value(1)).current;
  const extractCaptureAnim = useRef(new Animated.Value(0)).current;  // 0–1 fill while standing in zone
  const extractFlashAnim   = useRef(new Animated.Value(0)).current;  // green flash during capture
  const xpBarAnim          = useRef(new Animated.Value(0)).current;
  const specialChargeAnim  = useRef([
    new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0),
  ]).current;
  const specialReadyAnim   = useRef(new Animated.Value(0)).current;  // pulsing when special ready
  const healthBarAnim      = useRef(new Animated.Value(1)).current;  // 0–1 health fraction
  const hitFlashAnim       = useRef(new Animated.Value(0)).current;  // player hit flash
  const damageFlashAnim    = useRef(new Animated.Value(0)).current;  // full-screen red glitch on damage
  const zoneAlertAnim      = useRef(new Animated.Value(0)).current;  // full-screen green flash on zone spawn
  const spreeAnim          = useRef(new Animated.Value(0)).current;  // spree text fade
  const deathScreenAnim    = useRef(new Animated.Value(0)).current;  // death overlay fade
  const deathBtnPulseAnim  = useRef(new Animated.Value(1)).current;
  const deathGlitchAnim    = useRef(new Animated.Value(0)).current;  // glitch translateX on death screen
  const nextRoundAnim      = useRef(new Animated.Value(0)).current;  // next round flash
  const tutorialPanelAnim  = useRef(new Animated.Value(0)).current;
  const tutorialSlideAnim  = useRef(new Animated.Value(40)).current;
  const hoodieSyncGlowAnim = useRef(new Animated.Value(0)).current;
  const hoodieBuffTextAnim = useRef(new Animated.Value(0)).current;
  const playerOpacityAnim  = useRef(new Animated.Value(1)).current;  // 1.0 normal, 0.3 during Ghost Phase Shift
  const kyokaziFlashAnim   = useRef(new Animated.Value(0)).current;  // 0 = black, 1 = white — toggles every 200ms when Kyokazi is active
  const enemyFreezeRef     = useRef(0);  // ms timestamp until which enemies are frozen (Kyokazi special)
  const hasKyokaiKeyRef    = useRef(false);
  const activeLoadoutRef   = useRef([0, 1, 2]);  // indices of operators chosen for hunt

  // Forge
  const leftBarAnim    = useRef(new Animated.Value(0)).current;
  const rightBarAnim   = useRef(new Animated.Value(0)).current;
  const forgeBarPulse  = useRef(new Animated.Value(1)).current;
  const forgeBtnAnim   = useRef(new Animated.Value(0)).current;
  const shardSpinAnim  = useRef(new Animated.Value(0)).current;
  const shardPulseAnim = useRef(new Animated.Value(1)).current;
  const whiteLightAnim = useRef(new Animated.Value(0)).current;
  const targetHitAnim  = useRef(new Animated.Value(0)).current;  // flash on step complete

  const heatAnims = useRef([
    new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0),
  ]).current;

  const particlesRef = useRef(
    Array.from({ length: 25 }, () => ({
      left: Math.random() * Dimensions.get('window').width,
      top:  Math.random() * Dimensions.get('window').height,
      size: Math.random() * 4 + 1,
    }))
  );

  // ── Refs ──────────────────────────────────────────────────────────────────
  const hapticTimer    = useRef(null);
  const countdownTimer = useRef(null);
  const gameLoopRef    = useRef(null);
  const forgeLoopRef   = useRef(null);
  const animLoopsRef   = useRef({ pulse: null, shake: null, scan: null, forgeGlow: null, extractPulse: null });
  const shardsRef      = useRef(4);
  const isTutorialRef  = useRef(true);
  const heatRef        = useRef([0, 0, 0, 0]);
  const overheatRef    = useRef([0, 0, 0, 0]);
  const leftBarRef     = useRef(0);
  const rightBarRef    = useRef(0);
  const leftHeldRef    = useRef(false);
  const rightHeldRef   = useRef(false);
  const forgeReadyRef  = useRef(false);
  const forgeStepRef   = useRef(0);  // which FORGE_SEQUENCE step is active

  // Endless Trenches refs (game-loop safe)
  const isHuntingRef      = useRef(false);
  const activeOperatorRef = useRef(0);
  const runTokensRef      = useRef(0);
  const shadowTokensRef    = useRef(0);
  const totalSecondsRef    = useRef(0);
  const extractZoneRef     = useRef(null);
  const extractTimerRef    = useRef(0);
  const secondTickRef      = useRef(null);
  const tankSpawnedRef     = useRef(false);
  const bossSpawnedRef     = useRef(false);
  const sniperSpawnedRef   = useRef(false);  // sniper boss appears once per run, from run 3+
  const extractUnlockedRef = useRef(false);
  const extractRunCountRef = useRef(0);
  const extractThresholdRef = useRef(EXTRACT_BASE_TOKENS);

  // XP / level refs (sync versions for game loop)
  const playerXPRef       = useRef(0);
  const playerLevelRef    = useRef(1);
  const unlockedOpsRef    = useRef([0]);
  const specialChargeRef  = useRef([0, 0, 0, 0]);
  const specialActiveRef  = useRef(false);
  const tornadoTimerRef   = useRef(null);
  const ghostTimerRef     = useRef(null);
  const playerHealthRef   = useRef(MAX_HEALTH);
  const hitInvincibleRef  = useRef(0);
  const spreeCountRef     = useRef(0);
  const spreeTimerRef     = useRef(null);
  const deathTimerRef     = useRef(null);
  const bankedAmountRef   = useRef(0);
  const explosionsRef     = useRef([]);

  // ── Sound refs ────────────────────────────────────────────────────────────
  const sndBGM       = useRef(null);
  const sndFire      = useRef(null);
  const sndDeath     = useRef(null);
  const sndCollect   = useRef(null);
  const sndExtract   = useRef(null);
  const sndBtn       = useRef(null);
  const sndDamage    = useRef(null);
  const sndHeavyShot = useRef(null);  // sfx_heavyshot — used when Heavy operator fires
  const sndGhostShot = useRef(null);  // ghostshot — used when Ghost fires (pulse wave)
  const sndEMP       = useRef(null);  // EMP — Striker special
  const sndForging   = useRef(null);  // forging.mp3 — looping during the merge sequence
  const sndShardForged = useRef(null); // shardforged.mp3 — plays when the Kyōkai Core appears
  const extractSoundActiveRef = useRef(false);
  const isMutedRef   = useRef(false);
  const isSeekerCitizenRef = useRef(false);
  const isHoodieSyncedRef  = useRef(false);  // mirrored for startHunt buff logic

  // ── State ─────────────────────────────────────────────────────────────────
  const [appStage, setAppStage]               = useState('INTRO');
  const [tutorialStep, setTutorialStep]       = useState(0);
  const [briefing, setBriefing]               = useState(null);
  const [isAppReady, setIsAppReady]           = useState(false);
  const [shards, setShards]                   = useState(4);
  const [isTutorial, setIsTutorial]           = useState(true);
  const [systemMessage, setSystemMessage]     = useState('SYSTEM BOOTING...');
  const [isLocked, setIsLocked]               = useState(true);
  const [isSuccess, setIsSuccess]             = useState(false);
  const [introActive, setIntroActive]         = useState(true);
  const [isForging, setIsForging]             = useState(false);
  const [forgeReady, setForgeReady]           = useState(false);
  const [forgeStep, setForgeStep]             = useState(0);     // 0–3 which target is active
  const [isMintingRWA, setIsMintingRWA]       = useState(false);
  const [rwaMinted, setRwaMinted]             = useState(false);
  const [comingSoonMsg, setComingSoonMsg]     = useState(null);
  const [showOperatorSelect, setShowOperatorSelect] = useState(false);  // new char select screen
  // Kyokai Key NFT — unlocks the Kyokazi operator
  const [hasKyokaiKey, setHasKyokaiKey]       = useState(false);
  const [isCheckingKey, setIsCheckingKey]     = useState(false);
  const [keyResult, setKeyResult]             = useState(null);
  const [showKeyPicker, setShowKeyPicker]     = useState(false);
  const [pasteAddress, setPasteAddress]       = useState('');
  // Active loadout — when 4+ operators are unlocked, player picks 3
  const [activeLoadout, setActiveLoadout]     = useState([0, 1, 2]);  // indices of chosen operators
  const [pendingLoadout, setPendingLoadout]   = useState([]);  // staged selection during the pick-3 flow
  const [isPaused, setIsPaused]               = useState(false);  // in-game pause + quit dialog
  const isPausedRef                           = useRef(false);
  const [isMerging, setIsMerging]             = useState(false);
  const [isScanning, setIsScanning]           = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [walletAddress, setWalletAddress]     = useState(null);  // full base58 public key
  const [walletLabel, setWalletLabel]         = useState(null);  // .skr name or truncated addr
  const [authToken, setAuthToken]             = useState(null);  // MWA reauth token
  const [isSeekerCitizen, setIsSeekerCitizen] = useState(false);
  const [skrBalance, setSkrBalance]           = useState(0);
  // Leaderboard sync — disabled for Season 1, will return in Season 2
  // const [isSyncing, setIsSyncing]             = useState(false);
  // const [syncComplete, setSyncComplete]       = useState(false);
  const [isHoodieSynced, setIsHoodieSynced]   = useState(false);
  const [isHunting, setIsHunting]             = useState(false);
  const [shadowTokens, setShadowTokens]       = useState(0);
  const [activeOperator, setActiveOperator]   = useState(0);
  const [extractZone, setExtractZone]         = useState(null);
  const [extractSecsLeft, setExtractSecsLeft] = useState(0);
  const [runTokens, setRunTokens]             = useState(0);

  // XP / level / unlock
  const [playerXP, setPlayerXP]               = useState(0);
  const [playerLevel, setPlayerLevel]         = useState(1);
  const [unlockedOps, setUnlockedOps]         = useState([0]);
  const [pendingUnlock, setPendingUnlock]     = useState(null);
  const [extractResult, setExtractResult]     = useState(null);

  // Special weapon charge (0–100) per operator
  const [specialCharge, setSpecialCharge]     = useState([0, 0, 0, 0]);
  const [specialActive, setSpecialActive]     = useState(false);
  const [isMuted, setIsMuted]                 = useState(false);
  const [playerHealth, setPlayerHealth]       = useState(MAX_HEALTH);
  const [spreeCount, setSpreeCount]           = useState(0);
  const [spreeLabel, setSpreeLabel]           = useState('');
  const [isDead, setIsDead]                   = useState(false);
  const [deathCountdown, setDeathCountdown]   = useState(5);
  const [nextRoundVisible, setNextRoundVisible] = useState(false);
  const [showDamageText, setShowDamageText]   = useState(false);
  const [showZoneAlert, setShowZoneAlert]     = useState(false);

  const [, setTick]                           = useState(0);

  // ── Operators ─────────────────────────────────────────────────────────────
  const operators = [
    {
      name: 'VEKT', color: '#00FFFF', speedMult: 1.0, bulletSpeed: 12, spread: false,
      unlockLevel: 1,
      special: 'EMP BOMB',
      specialDesc: 'Instantly destroys all Static\non screen. Charges over time.',
      portrait: require('../assets/images/vekt.png'),
    },
    {
      name: 'SHOKU', color: '#FF00FF', speedMult: 0.7, bulletSpeed: 10, spread: true,
      unlockLevel: UNLOCK_LEVEL_HEAVY,
      special: 'TORNADO BLAST',
      specialDesc: 'Stops and spins 360°, firing\nblasts in all directions for 3s.',
      portrait: require('../assets/images/shoku.png'),
    },
    {
      name: 'GHOST', color: '#FFFF00', speedMult: 1.1, bulletSpeed: 20, spread: false,
      unlockLevel: UNLOCK_LEVEL_GHOST,
      special: 'PHASE SHIFT',
      specialDesc: 'Becomes invincible for 3 seconds.\nPass through all Static safely.',
      portrait: require('../assets/images/ghost.png'),
    },
    {
      name: 'KYOKAZI', color: '#FFFFFF', speedMult: 1.0, bulletSpeed: 13, spread: false,
      unlockLevel: 999,                // never level-unlockable — gated by Kyokai Key NFT only
      isKyokaiKeyGated: true,
      special: 'TIME FREEZE',
      specialDesc: 'Pauses all enemies on screen for\n5 seconds. Free shots. Free tokens.',
      portrait: require('../assets/images/kyokazi.png'),
    },
  ];

  const setShardsBoth = (n) => { shardsRef.current = n; setShards(n); };

  // ── XP / Level helper ─────────────────────────────────────────────────────
  const gainXP = async (amount) => {
    // Seeker Citizens get a permanent 1.15× XP multiplier
    const finalXP = isSeekerCitizenRef.current ? Math.floor(amount * 1.15) : amount;
    const newXP   = playerXPRef.current + finalXP;
    let newLevel  = playerLevelRef.current;

    // Check for level-up(s)
    while (newLevel < XP_PER_LEVEL.length - 1 && newXP >= XP_PER_LEVEL[newLevel]) {
      newLevel++;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate([0, 100, 50, 200, 50, 300]);

      // Check operator unlocks
      if (newLevel === UNLOCK_LEVEL_HEAVY && !unlockedOpsRef.current.includes(1)) {
        setPendingUnlock(1);
      }
      if (newLevel === UNLOCK_LEVEL_GHOST && !unlockedOpsRef.current.includes(2)) {
        setPendingUnlock(2);
      }
    }

    playerXPRef.current    = newXP;
    playerLevelRef.current = newLevel;
    setPlayerXP(newXP);
    setPlayerLevel(newLevel);

    // Animate XP bar
    const levelStart = XP_PER_LEVEL[newLevel - 1] || 0;
    const levelEnd   = XP_PER_LEVEL[newLevel]     || XP_PER_LEVEL[XP_PER_LEVEL.length - 1];
    const progress   = Math.min(1, (newXP - levelStart) / (levelEnd - levelStart));
    Animated.timing(xpBarAnim, { toValue: progress, duration: 600, useNativeDriver: false }).start();

    await AsyncStorage.setItem('@xp',    newXP.toString());
    await AsyncStorage.setItem('@level', newLevel.toString());
  };

  const confirmUnlock = async (opIdx) => {
    const newUnlocks = [...unlockedOpsRef.current, opIdx];
    unlockedOpsRef.current = newUnlocks;
    setUnlockedOps(newUnlocks);
    setPendingUnlock(null);
    await AsyncStorage.setItem('@unlocked_ops', JSON.stringify(newUnlocks));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── Sound helpers ─────────────────────────────────────────────────────────
  const playBGM = async () => {
    try {
      if (!sndBGM.current || isMutedRef.current) return;
      await sndBGM.current.setPositionAsync(0);
      await sndBGM.current.playAsync();
    } catch (e) {}
  };

  const stopBGM = async () => {
    try { await sndBGM.current?.stopAsync(); } catch (e) {}
  };

  const unmuffleBGM = async () => {
    try {
      if (!sndBGM.current || isMutedRef.current) return;
      const steps = 12;
      const from = 0.18; const to = 0.55;
      for (let i = 1; i <= steps; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (isMutedRef.current) return;
        await sndBGM.current.setVolumeAsync(from + (to - from) * (i / steps));
      }
    } catch (e) {}
  };

  const muffleBGM = async () => {
    try {
      if (!sndBGM.current || isMutedRef.current) return;
      const steps = 10;
      const from = 0.55; const to = 0.18;
      for (let i = 1; i <= steps; i++) {
        await new Promise(r => setTimeout(r, 40));
        if (isMutedRef.current) return;
        await sndBGM.current.setVolumeAsync(from + (to - from) * (i / steps));
      }
    } catch (e) {}
  };

  const playSFX = async (ref) => {
    try {
      if (!ref.current || isMutedRef.current) return;
      await ref.current.replayAsync();
    } catch (e) {}
  };

  const playBtn = () => { playSFX(sndBtn); };

  // ── Mute toggle ───────────────────────────────────────────────────────────
  const toggleMute = async () => {
    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);
    await AsyncStorage.setItem('@muted', newMuted ? 'true' : 'false');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (newMuted) {
        // Silence everything immediately
        await sndBGM.current?.pauseAsync();
        await sndExtract.current?.stopAsync();
        extractSoundActiveRef.current = false;
      } else {
        // Unmute — resume BGM at current appropriate volume
        await sndBGM.current?.setVolumeAsync(isHuntingRef.current ? 0.55 : 0.18);
        await sndBGM.current?.playAsync();
      }
    } catch (e) {}
  };

  const startExtractSound = async () => {
    try {
      if (!sndExtract.current || extractSoundActiveRef.current || isMutedRef.current) return;
      extractSoundActiveRef.current = true;
      await sndExtract.current.setRateAsync(1.0, true);
      await sndExtract.current.setPositionAsync(0);
      await sndExtract.current.playAsync();
    } catch (e) {}
  };

  const stopExtractSound = async () => {
    try {
      if (!sndExtract.current) return;
      extractSoundActiveRef.current = false;
      await sndExtract.current.stopAsync();
      await sndExtract.current.setRateAsync(1.0, true);
    } catch (e) {}
  };

  // Called from game loop — escalates pitch as captureFrames rises (0→180)
  const updateExtractPitch = async (captureFrames) => {
    try {
      if (!sndExtract.current || !extractSoundActiveRef.current) return;
      // 1.0 at frame 0 → 1.5 at frame 180 (3 seconds)
      const rate = 1.0 + (captureFrames / 180) * 0.5;
      await sndExtract.current.setRateAsync(rate, true);
    } catch (e) {}
  };
  const physicsRef = useRef({
    player: { x: 200, y: 200 }, velocity: { x: 0, y: 0 },
    enemies: [], bullets: [], tokens: [], pulses: [], sniperBullets: [],
    tilt: { x: 0, y: 0 }, facingAngle: 0,
    lastHeartbeat: 0, isShielded: false, shieldTimer: null,
    empCharge: 0, baseEnemySpeed: 2.2,
  });

  // ── Lock landscape ─────────────────────────────────────────────────────────
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); };
  }, []);

  // ── Joystick (only claims gesture on MOVE, never steals taps) ─────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, g) => {
        const maxDist = 45;
        const dist = Math.hypot(g.dx, g.dy);
        const bx = dist > maxDist ? (g.dx / dist) * maxDist : g.dx;
        const by = dist > maxDist ? (g.dy / dist) * maxDist : g.dy;
        joystickPan.setValue({ x: bx, y: by });
        physicsRef.current.tilt = { x: bx / maxDist, y: by / maxDist };
      },
      onPanResponderRelease: () => {
        Animated.spring(joystickPan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        physicsRef.current.tilt = { x: 0, y: 0 };
      },
      onPanResponderTerminate: () => {
        Animated.spring(joystickPan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        physicsRef.current.tilt = { x: 0, y: 0 };
      },
    })
  ).current;

  // ── Fire bullet (reads refs — no stale closure) ────────────────────────────
  const fireBullet = (locationX, locationY) => {
    if (!isHuntingRef.current) return;
    const opIdx = activeOperatorRef.current;
    if (overheatRef.current[opIdx] > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return;
    }
    const state    = physicsRef.current;
    const pCenterX = state.player.x + PLAYER_SIZE / 2;
    const pCenterY = state.player.y + PLAYER_SIZE / 2;
    const dx = locationX - pCenterX;
    const dy = locationY - pCenterY;
    const mag = Math.hypot(dx, dy);
    if (mag === 0) return;
    const op = operators[opIdx];
    if (opIdx === 2) {
      // GHOST — fires a circular pulse wave that expands from the player and damages anything in its path
      state.pulses.push({
        x: pCenterX,
        y: pCenterY,
        radius: 12,
        maxRadius: 220,
        speed: 8,
        hitEnemies: new Set(), // each enemy can only be hit once per pulse
        color: op.color,
      });
    } else if (opIdx === 3) {
      // KYOKAZI — uzi-spread: 7 bullets in a 90° arc with randomised speeds (chaotic shotgun feel)
      const baseAngle = Math.atan2(dy, dx);
      const ARC_HALF  = Math.PI / 4; // ±45°
      const NUM = 7;
      for (let i = 0; i < NUM; i++) {
        // Even angular spread + slight jitter
        const t = NUM === 1 ? 0 : (i / (NUM - 1)) - 0.5;
        const angle = baseAngle + t * ARC_HALF * 2 + (Math.random() - 0.5) * 0.12;
        const speed = op.bulletSpeed * (0.85 + Math.random() * 0.4); // 10.5 – 16.9 around base 13
        state.bullets.push({
          x: pCenterX - 5,
          y: pCenterY - 5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: op.color,
        });
      }
    } else if (op.spread) {
      const angle = Math.atan2(dy, dx);
      [-0.2, 0, 0.2].forEach(offset => {
        state.bullets.push({ x: pCenterX - 5, y: pCenterY - 5, vx: Math.cos(angle + offset) * op.bulletSpeed, vy: Math.sin(angle + offset) * op.bulletSpeed, color: op.color });
      });
    } else {
      state.bullets.push({ x: pCenterX - 5, y: pCenterY - 5, vx: (dx / mag) * op.bulletSpeed, vy: (dy / mag) * op.bulletSpeed, color: op.color });
    }
    const newHeat = Math.min(MAX_HEAT, heatRef.current[opIdx] + HEAT_PER_SHOT[opIdx]);
    heatRef.current[opIdx] = newHeat;
    heatAnims[opIdx].setValue(newHeat);
    if (newHeat >= MAX_HEAT) {
      overheatRef.current[opIdx] = OVERHEAT_FRAMES;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const sfxRef = opIdx === 1 ? sndHeavyShot : opIdx === 2 ? sndGhostShot : sndFire;
      playSFX(sfxRef);
    }
  };

  // ── Global cleanup ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Preload all sounds
    const loadSounds = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        console.log('[Audio] Mode set OK');

        const results = await Promise.allSettled([
          Audio.Sound.createAsync(require('../assets/sounds/bgm_trenches.mp3'),    { isLooping: true,  volume: 0.18 }),
          Audio.Sound.createAsync(require('../assets/sounds/sfx_fire.mp3'),        { isLooping: false, volume: 0.20 }),
          Audio.Sound.createAsync(require('../assets/sounds/sfx_death.mp3'),       { isLooping: false, volume: 0.55 }),
          Audio.Sound.createAsync(require('../assets/sounds/sfx_collect.mp3'),     { isLooping: false, volume: 0.45 }),
          Audio.Sound.createAsync(require('../assets/sounds/sfx_extract.mp3'),     { isLooping: true,  volume: 0.7  }),
          Audio.Sound.createAsync(require('../assets/sounds/sfx_buttonpress.mp3'), { isLooping: false, volume: 0.30 }),
          Audio.Sound.createAsync(require('../assets/sounds/sfx_damage.mp3'),      { isLooping: false, volume: 0.40 }),
          Audio.Sound.createAsync(require('../assets/sounds/heavyshot.mp3'),       { isLooping: false, volume: 0.32 }),
          Audio.Sound.createAsync(require('../assets/sounds/ghostshot.mp3'),       { isLooping: false, volume: 0.35 }),
          Audio.Sound.createAsync(require('../assets/sounds/EMP.mp3'),             { isLooping: false, volume: 0.6  }),
          Audio.Sound.createAsync(require('../assets/sounds/forging.mp3'),         { isLooping: true,  volume: 0.7  }),
          Audio.Sound.createAsync(require('../assets/sounds/shardforged.mp3'),     { isLooping: false, volume: 0.9  }),
        ]);

        const names = ['bgm','fire','death','collect','extract','btn','damage','heavyshot','ghostshot','emp','forging','shardforged'];
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.error(`[Audio] FAILED to load ${names[i]}:`, r.reason);
          } else {
            console.log(`[Audio] Loaded ${names[i]} OK`);
          }
        });

        if (results[0].status === 'fulfilled') {
          sndBGM.current     = results[0].value.sound;
          if (!isMutedRef.current) {
            await sndBGM.current.playAsync();
            console.log('[Audio] BGM playing');
          }
        }
        if (results[1].status === 'fulfilled') sndFire.current    = results[1].value.sound;
        if (results[2].status === 'fulfilled') sndDeath.current   = results[2].value.sound;
        if (results[3].status === 'fulfilled') sndCollect.current = results[3].value.sound;
        if (results[4].status === 'fulfilled') sndExtract.current = results[4].value.sound;
        if (results[5].status === 'fulfilled') sndBtn.current     = results[5].value.sound;
        if (results[6].status === 'fulfilled') sndDamage.current  = results[6].value.sound;
        if (results[7].status === 'fulfilled') sndHeavyShot.current = results[7].value.sound;
        if (results[8].status === 'fulfilled') sndGhostShot.current = results[8].value.sound;
        if (results[9].status === 'fulfilled') sndEMP.current       = results[9].value.sound;
        if (results[10].status === 'fulfilled') sndForging.current     = results[10].value.sound;
        if (results[11].status === 'fulfilled') sndShardForged.current = results[11].value.sound;

      } catch (e) {
        console.error('[Audio] setAudioModeAsync failed:', e);
      }
    };
    loadSounds();

    return () => {
      cancelAnimationFrame(gameLoopRef.current);
      cancelAnimationFrame(forgeLoopRef.current);
      if (physicsRef.current?.shieldTimer) clearTimeout(physicsRef.current.shieldTimer);
      if (hapticTimer.current)    clearInterval(hapticTimer.current);
      if (countdownTimer.current) clearInterval(countdownTimer.current);
      if (secondTickRef.current)  clearInterval(secondTickRef.current);
      // Unload all sounds
      [sndBGM, sndFire, sndDeath, sndCollect, sndExtract, sndBtn, sndDamage, sndHeavyShot, sndGhostShot, sndEMP, sndForging, sndShardForged].forEach(ref => {
        ref.current?.unloadAsync().catch(() => {});
      });
    };
  }, []);

  useEffect(() => { shardsRef.current = shards; isTutorialRef.current = isTutorial; }, [shards, isTutorial]);
  useEffect(() => { isHuntingRef.current = isHunting; }, [isHunting]);
  useEffect(() => { activeOperatorRef.current = activeOperator; }, [activeOperator]);

  // Kyokazi flash loop — toggles between black and white. Only running when Kyokazi is active.
  useEffect(() => {
    if (activeOperator === 3) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(kyokaziFlashAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
          Animated.timing(kyokaziFlashAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => { loop.stop(); kyokaziFlashAnim.setValue(0); };
    }
  }, [activeOperator]);
  useEffect(() => { shadowTokensRef.current = shadowTokens; }, [shadowTokens]);

  // ── Animation helpers ──────────────────────────────────────────────────────
  const startPulse = () => {
    if (animLoopsRef.current.pulse) animLoopsRef.current.pulse.stop();
    animLoopsRef.current.pulse = Animated.loop(Animated.sequence([
      Animated.timing(buttonFlashAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(buttonFlashAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]));
    animLoopsRef.current.pulse.start();
  };
  const stopPulse = () => { if (animLoopsRef.current.pulse) animLoopsRef.current.pulse.stop(); buttonFlashAnim.setValue(0); };

  const startShake = () => {
    if (animLoopsRef.current.shake) animLoopsRef.current.shake.stop();
    animLoopsRef.current.shake = Animated.loop(Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: false }),
    ]));
    animLoopsRef.current.shake.start();
  };
  const stopShake = () => { if (animLoopsRef.current.shake) animLoopsRef.current.shake.stop(); shakeAnim.setValue(0); };

  const startForgeGlow = () => {
    if (animLoopsRef.current.forgeGlow) animLoopsRef.current.forgeGlow.stop();
    animLoopsRef.current.forgeGlow = Animated.loop(Animated.sequence([
      Animated.timing(forgeBarPulse, { toValue: 1.4, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(forgeBarPulse, { toValue: 1.0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ]));
    animLoopsRef.current.forgeGlow.start();
  };
  const stopForgeGlow = () => { if (animLoopsRef.current.forgeGlow) animLoopsRef.current.forgeGlow.stop(); forgeBarPulse.setValue(1); };

  // Extraction zone pulse — urgency scales with time remaining
  const startExtractPulse = (urgency = 1) => {
    if (animLoopsRef.current.extractPulse) animLoopsRef.current.extractPulse.stop();
    const dur = Math.max(200, 800 - urgency * 60);
    animLoopsRef.current.extractPulse = Animated.loop(Animated.sequence([
      Animated.timing(extractPulseAnim, { toValue: 1.3, duration: dur, useNativeDriver: false }),
      Animated.timing(extractPulseAnim, { toValue: 1.0, duration: dur, useNativeDriver: false }),
    ]));
    animLoopsRef.current.extractPulse.start();
  };
  const stopExtractPulse = () => {
    if (animLoopsRef.current.extractPulse) animLoopsRef.current.extractPulse.stop();
    extractPulseAnim.setValue(1);
  };

  // ── Load state ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadMemory = async () => {
      try {
        const savedTutorial = await AsyncStorage.getItem('@tutorial_done');
        const savedShards   = await AsyncStorage.getItem('@shards');
        const savedTokens   = await AsyncStorage.getItem('@tokens');
        const savedMuted    = await AsyncStorage.getItem('@muted');
        const savedWallet   = await AsyncStorage.getItem('@wallet_address');
        const savedAuth     = await AsyncStorage.getItem('@wallet_auth_token');
        const savedLabel    = await AsyncStorage.getItem('@wallet_label');
        const savedSeeker   = await AsyncStorage.getItem('@is_seeker');
        const savedSKR      = await AsyncStorage.getItem('@skr_balance');
        if (savedMuted === 'true') {
          isMutedRef.current = true;
          setIsMuted(true);
        }
        if (savedWallet) {
          setWalletAddress(savedWallet);
          setWalletLabel(savedLabel || truncateAddr(savedWallet));
          setAuthToken(savedAuth);
          setWalletConnected(true);
        }
        if (savedSeeker === 'true') {
          isSeekerCitizenRef.current = true;
          setIsSeekerCitizen(true);
        }
        if (savedSKR) {
          setSkrBalance(parseFloat(savedSKR));
        }
        // Kyokai Key holder — re-check fresh on connect, but persist last known
        const savedKey      = await AsyncStorage.getItem('@has_kyokai_key');
        const savedLoadout  = await AsyncStorage.getItem('@active_loadout');
        if (savedKey === 'true') {
          hasKyokaiKeyRef.current = true;
          setHasKyokaiKey(true);
        }
        if (savedLoadout) {
          try {
            const parsed = JSON.parse(savedLoadout);
            if (Array.isArray(parsed) && parsed.length === 3) {
              activeLoadoutRef.current = parsed;
              setActiveLoadout(parsed);
            }
          } catch (e) {}
        }
        if (savedTutorial === 'true') {
          setIsTutorial(false);
          setShardsBoth(savedShards ? parseInt(savedShards) : 0);
          setShadowTokens(savedTokens ? parseInt(savedTokens) : 0);
          const savedXP      = await AsyncStorage.getItem('@xp');
          const savedLevel   = await AsyncStorage.getItem('@level');
          const savedUnlocks = await AsyncStorage.getItem('@unlocked_ops');
          const xp      = savedXP      ? parseInt(savedXP)      : 0;
          const level   = savedLevel   ? parseInt(savedLevel)   : 1;
          const unlocks = savedUnlocks ? JSON.parse(savedUnlocks) : [0];
          playerXPRef.current    = xp;
          playerLevelRef.current = level;
          unlockedOpsRef.current = unlocks;
          setPlayerXP(xp); setPlayerLevel(level); setUnlockedOps(unlocks);
        } else {
          setIsTutorial(true); setShardsBoth(4);
        }
      } catch (e) { console.error('Memory Error', e); }
      finally { setIsAppReady(true); }
    };
    loadMemory();
  }, []);

  // ── Intro animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAppReady || appStage !== 'MAIN') return;
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(introTextOpacity, { toValue: 1, duration: 1000, useNativeDriver: false }),
      Animated.delay(1000),
      Animated.timing(introTextOpacity, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]).start(() => {
      setIntroActive(false); setIsLocked(false);
      setSystemMessage(isTutorialRef.current ? 'VAULT DETECTS 4 CORRUPTED SHARDS' : shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
      if (!isTutorialRef.current && shardsRef.current < 4) {
        Animated.timing(shardVisibilityAnim, { toValue: 0.15, duration: 1000, useNativeDriver: false }).start();
      }
    });
  }, [isAppReady, appStage]);

  // ── Ambient animations ─────────────────────────────────────────────────────
  useEffect(() => {
    startPulse();
    // Hoodie sync button — pulse purple when unsynced
    Animated.loop(Animated.sequence([
      Animated.timing(hoodieSyncGlowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
      Animated.timing(hoodieSyncGlowAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
    ])).start();
    Animated.loop(Animated.timing(shieldSpinAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: false })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(breathAnim, { toValue: 1.05, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(breathAnim, { toValue: 1,    duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
    ])).start();
    const flicker = () => {
      Animated.sequence([
        Animated.timing(erraticGlow, { toValue: Math.random() * 0.5 + 0.5, duration: 50 + Math.random() * 100, useNativeDriver: false }),
        Animated.timing(erraticGlow, { toValue: 1, duration: 50 + Math.random() * 100, useNativeDriver: false }),
      ]).start(({ finished }) => { if (finished) flicker(); });
    };
    flicker();
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetGame = () => {
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
    cancelAnimationFrame(forgeLoopRef.current);
    setTimeout(() => {
      setSystemMessage(isTutorialRef.current ? 'SYSTEM READY' : shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
      setIsSuccess(false); setIsLocked(false); setIsForging(false);
      setForgeReady(false); setForgeStep(0); setIsMerging(false);
      epicCoreAnim.setValue(0);
      leftBarAnim.setValue(0); rightBarAnim.setValue(0);
      leftBarRef.current = 0; rightBarRef.current = 0;
      leftHeldRef.current = false; rightHeldRef.current = false;
      forgeReadyRef.current = false; forgeStepRef.current = 0;
      forgeBtnAnim.setValue(0); shardSpinAnim.setValue(0);
      shardPulseAnim.setValue(1); whiteLightAnim.setValue(0); targetHitAnim.setValue(0);
      stopForgeGlow(); stopShake(); startPulse();
      if (!isTutorialRef.current && shardsRef.current < 4) {
        Animated.timing(shardVisibilityAnim, { toValue: 0.15, duration: 1000, useNativeDriver: false }).start();
      } else {
        Animated.timing(shardVisibilityAnim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
      }
    }, RESET_DELAY_MS);
  };

  const handleDevReset = async () => {
    if (isHunting || isForging) return;
    await AsyncStorage.clear();
    setShardsBoth(0); setShadowTokens(0);
    isTutorialRef.current = true; setIsTutorial(true);
    setIsSuccess(false); setIsLocked(false); setWalletConnected(false);
    setWalletAddress(null); setWalletLabel(null); setAuthToken(null);
    setIsSeekerCitizen(false); isSeekerCitizenRef.current = false;
    setSkrBalance(0);
    setIsForging(false); setForgeReady(false); setForgeStep(0); setIsMerging(false); setBriefing(null);
    leftBarAnim.setValue(0); rightBarAnim.setValue(0);
    forgeBtnAnim.setValue(0); epicCoreAnim.setValue(0);
    whiteLightAnim.setValue(0); shardSpinAnim.setValue(0); targetHitAnim.setValue(0);
    forgeStepRef.current = 0;
    stopForgeGlow(); stopShake();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Vibration.vibrate([0, 100, 50, 100, 50, 400]);
    setSystemMessage('DEV OVERRIDE: VAULT PURGED. READY FOR DEMO.');
    Animated.timing(shardVisibilityAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
    startPulse();
  };

  // Parses the `collection` field out of a Metaplex Token Metadata account.
  // Walks the borsh-serialised layout step by step rather than scanning bytes,
  // which avoids false matches inside creator addresses or update authorities.
  // Returns { verified: bool, key: string } or null if no collection is set.
  const parseMetadataCollection = (data) => {
    try {
      let o = 0; // offset cursor
      o += 1;          // key (account discriminator: 1 byte)
      o += 32;         // updateAuthority (Pubkey)
      o += 32;         // mint (Pubkey)
      // data: Data
      //   name: String (4-byte LE length + bytes)
      const nameLen = data.readUInt32LE(o); o += 4 + nameLen;
      //   symbol: String
      const symLen = data.readUInt32LE(o); o += 4 + symLen;
      //   uri: String
      const uriLen = data.readUInt32LE(o); o += 4 + uriLen;
      //   sellerFeeBasisPoints: u16
      o += 2;
      //   creators: Option<Vec<Creator>>
      const creatorsOption = data[o]; o += 1;
      if (creatorsOption === 1) {
        const creatorsLen = data.readUInt32LE(o); o += 4;
        // Each Creator = Pubkey (32) + verified (1) + share (1) = 34 bytes
        o += creatorsLen * 34;
      }
      // primarySaleHappened: bool
      o += 1;
      // isMutable: bool
      o += 1;
      // editionNonce: Option<u8>
      const editionNonceOpt = data[o]; o += 1;
      if (editionNonceOpt === 1) o += 1;
      // tokenStandard: Option<u8>
      const tokenStandardOpt = data[o]; o += 1;
      if (tokenStandardOpt === 1) o += 1;
      // collection: Option<Collection>
      const collectionOpt = data[o]; o += 1;
      if (collectionOpt !== 1) return null;
      // Collection { verified: bool, key: Pubkey }
      const verified = data[o] === 1; o += 1;
      const keyBytes = data.slice(o, o + 32);
      const key = new PublicKey(keyBytes).toBase58();
      return { verified, key };
    } catch (e) {
      // Some accounts may be older format / missing fields — skip silently
      return null;
    }
  };

  // ── Kyokai Key NFT holder check ───────────────────────────────────────────
  // For regular Metaplex NFTs (not cNFTs). Properly decodes the Metadata account
  // instead of scanning for byte patterns — pattern scans can false-match on
  // creator addresses or update authorities that happen to equal the collection.
  const checkKyokaiKeyHolder = async (publicKeyStr) => {
    const COLLECTION_ADDRESS = 'AMnjFWcPSWArm3CUbumLJnyuhd3CKJYcpU66fochxp97';
    const HELIUS_RPC         = RPC_URL;  // uses the top-level Helius RPC constant

    try {
      console.log('[KyokaiKey]', `Scanning: ${publicKeyStr.slice(0,8)}...`);
      console.log('[KyokaiKey]', `Collection: ${COLLECTION_ADDRESS.slice(0,8)}...`);

      // Use Helius DAS API (getAssetsByOwner) — stable v1 replacement for the
      // deprecated /v0/addresses/{wallet}/nfts endpoint which returns 500 errors.
      console.log('[KyokaiKey]', 'Calling getAssetsByOwner...');
      const response = await fetch(HELIUS_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'kyokai-key-check',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: publicKeyStr,
            page: 1,
            limit: 1000,
            displayOptions: { showFungible: false },
          },
        }),
      });

      if (!response.ok) {
        console.log('[KyokaiKey]', `Helius HTTP error: ${response.status}`);
        return false;
      }

      const json = await response.json();
      if (json.error) {
        console.log('[KyokaiKey]', `DAS error: ${JSON.stringify(json.error).slice(0,50)}`);
        return false;
      }

      const assets = json.result?.items || [];
      console.log('[KyokaiKey]', `Assets returned: ${assets.length}`);

      if (assets.length === 0) {
        console.log('[KyokaiKey]', 'No assets found');
        return false;
      }

      // Log first few for diagnostics
      assets.slice(0, 3).forEach((asset, i) => {
        const col = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
        const ua  = asset.creators?.[0]?.address;
        console.log('[KyokaiKey]', `Asset${i}: ${asset.content?.metadata?.name || '?'} col=${col?.slice(0,8) || 'none'} ua=${ua?.slice(0,8) || 'none'}`);
      });

      // Check every possible field — LaunchMyNFT collections are inconsistent.
      // From debug output: PUSHY KEY has col=none, ua=31wetAk3 (varies per wallet)
      //                    NFT #268 has col=H3Log8Gz (the original collection address)
      // So we check collection grouping against BOTH known addresses.
      const KNOWN_COLLECTION_ADDRESSES = [
        'AMnjFWcPSWArm3CUbumLJnyuhd3CKJYcpU66fochxp97', // update_authority / launchmynft address
        'H3Log8GzqgM2xCEwMaVvdYMHDXgvqjHENUi9shD6bXaE', // on-chain collection field address
      ];

      const isHolder = assets.some(asset => {
        const colGroup     = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
        const authority    = asset.authorities?.[0]?.address;
        const firstCreator = asset.creators?.[0]?.address;
        const name         = asset.content?.metadata?.name || '';

        // Also match by name as last resort — "PUSHY KEY" is unambiguous
        const nameMatch = name.toUpperCase().includes('PUSHY KEY');

        return (
          KNOWN_COLLECTION_ADDRESSES.includes(colGroup) ||
          KNOWN_COLLECTION_ADDRESSES.includes(authority) ||
          KNOWN_COLLECTION_ADDRESSES.includes(firstCreator) ||
          nameMatch
        );
      });

      console.log('[KyokaiKey]', isHolder ? 'MATCH ✓ Key found!' : 'No match');
      return isHolder;

    } catch (e) {
      console.log('[KyokaiKey]', `ERROR: ${e.message?.slice(0,60)}`);
      console.warn('[KyokaiKey] check failed:', e);
      return false;
    }
  };

  // Handler — invoked by the KYOKAI KEY button on the home screen
  // Run the actual on-chain check against a specific address.
  // Used by all three picker options: connected wallet, fresh wallet session, manual paste.
  const runKyokaiKeyCheck = async (publicKeyStr, sourceLabel) => {
    if (!publicKeyStr) {
      setKeyResult({ success: false, message: 'NO ADDRESS PROVIDED' });
      return;
    }
    // Validate it's a real base58 PublicKey before hitting RPC
    try {
      new PublicKey(publicKeyStr);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setKeyResult({ success: false, message: 'INVALID WALLET ADDRESS' });
      return;
    }
    setIsCheckingKey(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSystemMessage(`SCANNING ${sourceLabel || 'WALLET'} FOR KYOKAI KEY...`);
    try {
      const isHolder = await checkKyokaiKeyHolder(publicKeyStr);
      if (isHolder) {
        hasKyokaiKeyRef.current = true;
        setHasKyokaiKey(true);
        await AsyncStorage.setItem('@has_kyokai_key', 'true');
        if (!unlockedOpsRef.current.includes(3)) {
          const newUnlocks = [...unlockedOpsRef.current, 3];
          unlockedOpsRef.current = newUnlocks;
          setUnlockedOps(newUnlocks);
          await AsyncStorage.setItem('@unlocked_ops', JSON.stringify(newUnlocks));
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate([0, 200, 100, 200, 100, 400]);
        setKeyResult({ success: true, message: 'WELCOME, KEY HOLDER' });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setKeyResult({ success: false, message: 'NO KEY DETECTED IN THIS WALLET' });
      }
    } catch (e) {
      console.warn('[KyokaiKey] Check failed:', e);
      setKeyResult({ success: false, message: 'KEY CHECK FAILED — TRY AGAIN' });
    } finally {
      setIsCheckingKey(false);
      setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
    }
  };

  // Open a fresh MWA session purely to grab the user's currently-selected wallet's address.
  // We don't keep the session — we just need the public key for the on-chain scan.
  // This lets the user pick a different default wallet at the OS level (Phantom vs Solflare vs Seed Vault)
  // before the prompt appears.
  const checkViaFreshWalletSession = async () => {
    setShowKeyPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSystemMessage('CHOOSE A WALLET TO SCAN...');
    try {
      const result = await transact(async (wallet) => {
        const auth = await wallet.authorize({
          chain: SOLANA_CLUSTER === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet',
          identity: APP_IDENTITY,
        });
        return auth;
      });
      const account = result.accounts[0];
      const pk = new PublicKey(Buffer.from(account.address, 'base64'));
      const pkStr = pk.toBase58();
      const label = account.label || truncateAddr(pkStr);
      await runKyokaiKeyCheck(pkStr, label);
    } catch (e) {
      console.warn('[KyokaiKey] Fresh session failed:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setKeyResult({ success: false, message: 'WALLET SELECTION CANCELLED' });
      setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
    }
  };

  // Top-level handler — opens the wallet picker modal so the user can choose which
  // wallet to scan. This solves the problem where some wallets (Solflare, Seed Vault)
  // index Metaplex collections inconsistently — let the user pick the one that knows
  // about their key NFT.
  const handleCheckKyokaiKey = async () => {
    if (isCheckingKey || isHunting || isForging) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowKeyPicker(true);
  };

  // ── Solana Mobile Wallet Adapter helpers ──────────────────────────────────

  // Truncate "Eky7...9mXp" style from a base58 address
  const truncateAddr = (addr) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  // Check if the connected wallet holds the Seeker Genesis Token (soulbound NFT).
  // Real implementation would query the RPC for token accounts matching SEEKER_GENESIS_MINT.
  // For now this is a stub that returns true on devnet/Seeker devices.
  const checkSeekerIdentity = async (publicKeyStr) => {
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const ownerPk = new PublicKey(publicKeyStr);
      // Check both legacy SPL Token and Token-2022 program accounts
      const [legacy, t2022] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] })),
      ]);
      const allAccounts = [...legacy.value, ...t2022.value];
      const hasGenesis = allAccounts.some(acc => {
        const info = acc.account.data.parsed.info;
        return info.mint === SEEKER_GENESIS_MINT && Number(info.tokenAmount.uiAmount) > 0;
      });
      return hasGenesis;
    } catch (e) {
      console.warn('[Seeker] Genesis check failed:', e);
      return false;
    }
  };

  // Fetch the user's on-chain $SKR token balance.
  // Checks BOTH legacy SPL Token program AND Token-2022 program.
  const fetchSKRBalance = async (publicKeyStr) => {
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const ownerPk = new PublicKey(publicKeyStr);
      const [legacy, t2022] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_PROGRAM_ID }),
        connection.getParsedTokenAccountsByOwner(ownerPk, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] })),
      ]);
      const allAccounts = [...legacy.value, ...t2022.value];
      let total = 0;
      allAccounts.forEach(acc => {
        const info = acc.account.data.parsed.info;
        if (info.mint === SKR_TOKEN_MINT) {
          total += Number(info.tokenAmount.uiAmount || 0);
        }
      });
      return total;
    } catch (e) {
      console.warn('[SKR] Balance fetch failed:', e);
      return 0;
    }
  };

  const handleWalletConnect = async () => {
    if (walletConnected || isConnectingWallet || isLocked || introActive || isHunting) return;
    setIsConnectingWallet(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSystemMessage('AWAITING SEED VAULT AUTHORIZATION...');
    try {
      const result = await transact(async (wallet) => {
        const auth = await wallet.authorize({
          chain: SOLANA_CLUSTER === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet',
          identity: APP_IDENTITY,
        });
        return auth;
      });

      const account = result.accounts[0];
      // MWA returns address as base64 — convert to base58 PublicKey
      const pk = new PublicKey(Buffer.from(account.address, 'base64'));
      const pkStr = pk.toBase58();
      const label = account.label || truncateAddr(pkStr);

      setWalletAddress(pkStr);
      setWalletLabel(label);
      setAuthToken(result.auth_token);
      setWalletConnected(true);
      await AsyncStorage.setItem('@wallet_address',    pkStr);
      await AsyncStorage.setItem('@wallet_label',      label);
      await AsyncStorage.setItem('@wallet_auth_token', result.auth_token);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSystemMessage('WALLET LINKED. CHECKING CITIZEN STATUS...');

      // Genesis check — grants the Seeker Citizen buff
      const isCitizen = await checkSeekerIdentity(pkStr);
      if (isCitizen) {
        isSeekerCitizenRef.current = true;
        setIsSeekerCitizen(true);
        await AsyncStorage.setItem('@is_seeker', 'true');
        setSystemMessage('⬢ SEEKER CITIZEN VERIFIED — 1.15× XP ACTIVE');
        Vibration.vibrate([0, 200, 100, 200]);
      } else {
        setSystemMessage('WALLET LINKED. PHYGITAL BRIDGE SECURE.');
      }

      // Fetch on-chain $SKR balance (runs after citizen check, doesn't block UI)
      const skr = await fetchSKRBalance(pkStr);
      setSkrBalance(skr);
      await AsyncStorage.setItem('@skr_balance', skr.toString());

      // Background re-check the Kyokai Key — if a holder reconnected we want Kyokazi unlocked
      // without forcing them to tap the button. No modal here — silent check.
      checkKyokaiKeyHolder(pkStr).then(async (isHolder) => {
        if (isHolder) {
          hasKyokaiKeyRef.current = true;
          setHasKyokaiKey(true);
          await AsyncStorage.setItem('@has_kyokai_key', 'true');
          if (!unlockedOpsRef.current.includes(3)) {
            const newUnlocks = [...unlockedOpsRef.current, 3];
            unlockedOpsRef.current = newUnlocks;
            setUnlockedOps(newUnlocks);
            await AsyncStorage.setItem('@unlocked_ops', JSON.stringify(newUnlocks));
          }
        } else if (hasKyokaiKeyRef.current) {
          // Wallet no longer holds the key (sold/transferred) — revoke
          hasKyokaiKeyRef.current = false;
          setHasKyokaiKey(false);
          await AsyncStorage.setItem('@has_kyokai_key', 'false');
        }
      }).catch(() => {});

      setTimeout(() => {
        setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
      }, 3000);
    } catch (e) {
      console.warn('[MWA] Connect failed:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSystemMessage('WALLET CONNECTION CANCELLED OR FAILED');
      setTimeout(() => setSystemMessage('SYSTEM READY'), 2500);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  // ── Wallet disconnect — revoke session, clear all wallet-derived state ──
  const handleWalletDisconnect = async () => {
    if (!walletConnected || isHunting || isForging) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Vibration.vibrate(120);
    // Clear AsyncStorage
    await AsyncStorage.removeItem('@wallet_address');
    await AsyncStorage.removeItem('@wallet_auth_token');
    await AsyncStorage.removeItem('@wallet_label');
    await AsyncStorage.removeItem('@is_seeker');
    await AsyncStorage.removeItem('@skr_balance');
    await AsyncStorage.removeItem('@has_kyokai_key');
    // Reset all wallet-related state
    setWalletConnected(false);
    setWalletAddress(null);
    setWalletLabel(null);
    setAuthToken(null);
    setIsSeekerCitizen(false);
    isSeekerCitizenRef.current = false;
    setSkrBalance(0);
    // Revoke Kyokazi access (key is wallet-bound)
    hasKyokaiKeyRef.current = false;
    setHasKyokaiKey(false);
    // Remove Kyokazi from unlocked ops
    if (unlockedOpsRef.current.includes(3)) {
      const filtered = unlockedOpsRef.current.filter(i => i !== 3);
      unlockedOpsRef.current = filtered;
      setUnlockedOps(filtered);
      await AsyncStorage.setItem('@unlocked_ops', JSON.stringify(filtered));
    }
    // If active loadout had Kyokazi, swap them out for a default
    if (activeLoadoutRef.current.includes(3)) {
      const fallback = [0, 1, 2];
      activeLoadoutRef.current = fallback;
      setActiveLoadout(fallback);
      await AsyncStorage.setItem('@active_loadout', JSON.stringify(fallback));
    }
    setSystemMessage('[ SESSION REVOKED: SIGNAL LOST ]');
    setTimeout(() => {
      setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
    }, 2500);
  };

  // ── Sign a leaderboard authorization message — DISABLED FOR SEASON 1 ──
  // Re-enable in Season 2 when the leaderboard infrastructure is live.
  // To restore: uncomment, plus uncomment the isSyncing/syncComplete state declarations
  // above, plus restore the JSX in the extract result screen.
  /*
  const handleSyncLeaderboard = async () => {
    if (!walletConnected || !walletAddress || isSyncing) return;
    setIsSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const tokenCount = extractResult?.tokens ?? 0;
      const message = `Authorize Pushy Signal Sync: ${tokenCount} Shadow Tokens for ${walletAddress}`;
      const messageBytes = new TextEncoder().encode(message);

      await transact(async (wallet) => {
        if (authToken) {
          await wallet.reauthorize({ auth_token: authToken, identity: APP_IDENTITY });
        }
        const signedPayloads = await wallet.signMessages({
          addresses: [Buffer.from(new PublicKey(walletAddress).toBytes()).toString('base64')],
          payloads: [Buffer.from(messageBytes).toString('base64')],
        });
        console.log('[Sync] Signed authorization:', signedPayloads);
        return signedPayloads;
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate([0, 100, 50, 200]);
      setSyncComplete(true);
    } catch (e) {
      console.warn('[Sync] Failed:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSyncing(false);
    }
  };
  */

  // ── Forge cNFT — sign a Memo transaction representing the shard burn ──
  // ── Forge: log the action on-chain via the Memo program ───────────────────
  // This signs a permanent transaction recording that this wallet forged a Core.
  // It does NOT mint an NFT — that arrives in v1.1 via Metaplex Bubblegum cNFTs.
  // The Memo serves as cryptographic proof of the forge that survives on Solana
  // forever, and gives the player a transaction in their wallet history.
  const handleForgeCNFT = async () => {
    if (!walletConnected || !walletAddress) return false;
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const { blockhash } = await connection.getLatestBlockhash();
      const feePayer = new PublicKey(walletAddress);
      // Memo data — encodes the forge action + a unique timestamp per Core
      const memoText = `KYOKAI_CORE_FORGED|wallet:${walletAddress.slice(0, 8)}|ts:${Date.now()}|action:burn_4_shards`;
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoText, 'utf8'),
      });
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer }).add(memoInstruction);

      const result = await transact(async (wallet) => {
        if (authToken) {
          await wallet.reauthorize({ auth_token: authToken, identity: APP_IDENTITY });
        }
        const signed = await wallet.signAndSendTransactions({ transactions: [tx] });
        return signed;
      });
      console.log('[Forge] On-chain log signature:', result);
      return true;
    } catch (e) {
      console.warn('[Forge] On-chain log failed:', e);
      return false;
    }
  };

  // ── Burn tokens for a shard ───────────────────────────────────────────────
  const handleBurnTokens = async () => {
    if (shadowTokensRef.current < BURN_COST || shardsRef.current >= 4 || isHunting || isForging) return;
    const newTokens = shadowTokensRef.current - BURN_COST;
    const newShards = shardsRef.current + 1;
    setShadowTokens(newTokens);
    shadowTokensRef.current = newTokens;
    await AsyncStorage.setItem('@tokens', newTokens.toString());
    setShardsBoth(newShards);
    await AsyncStorage.setItem('@shards', newShards.toString());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate([0, 100, 50, 200]);
    // Purple flash for burn effect
    Animated.sequence([
      Animated.timing(purpleFlashAnim, { toValue: 0.85, duration: 120, useNativeDriver: false }),
      Animated.timing(purpleFlashAnim, { toValue: 0,    duration: 700, useNativeDriver: false }),
    ]).start();
    setSystemMessage(`SHARD STABILISED. ${newShards}/4 LOADED.`);
    if (newShards >= 4) {
      Animated.timing(shardVisibilityAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
      setTimeout(() => setSystemMessage('SYSTEM READY'), 2000);
    }
  };

  // ── FORGE ──────────────────────────────────────────────────────────────────
  const enterForge = () => {
    setIsForging(true); setIsLocked(false);
    leftBarRef.current = 0; rightBarRef.current = 0;
    forgeReadyRef.current = false; forgeStepRef.current = 0;
    leftBarAnim.setValue(0); rightBarAnim.setValue(0); forgeBtnAnim.setValue(0);
    targetHitAnim.setValue(0);
    setForgeStep(0); setForgeReady(false);
    startForgeGlow();
    setSystemMessage('HOLD LEFT BAR TO FIRST TARGET');
    runForgeLoop();
  };

  const runForgeLoop = () => {
    const tick = async () => {
      if (forgeReadyRef.current) {
        // Sequence complete — just keep ticking so loop stays alive but do nothing
        forgeLoopRef.current = requestAnimationFrame(tick);
        return;
      }

      const step     = FORGE_SEQUENCE[forgeStepRef.current];
      const isLeft   = step.side === 'L';
      const heldRef  = isLeft ? leftHeldRef : rightHeldRef;
      const barRef   = isLeft ? leftBarRef  : rightBarRef;
      const barAnim  = isLeft ? leftBarAnim : rightBarAnim;

      // Only the active bar moves; the other stays locked at its last value
      if (heldRef.current) {
        barRef.current = Math.min(FORGE_MAX, barRef.current + FORGE_FILL_RATE);
      } else {
        barRef.current = Math.max(0, barRef.current - FORGE_DRAIN_RATE);
      }
      barAnim.setValue(barRef.current);

      // Haptic feedback as bar fills
      if (heldRef.current && Math.random() < 0.02) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Check if current step's target reached
      if (barRef.current >= step.target) {
        // Lock bar at target value — it won't drain anymore this step
        barRef.current = step.target;
        barAnim.setValue(step.target);

        const nextStep = forgeStepRef.current + 1;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        // Quick green flash
        Animated.sequence([
          Animated.timing(targetHitAnim, { toValue: 1, duration: 80,  useNativeDriver: false }),
          Animated.timing(targetHitAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
        ]).start();

        if (nextStep >= FORGE_SEQUENCE.length) {
          // All targets hit — forge ready
          forgeReadyRef.current = true;
          setForgeReady(true);
          setForgeStep(nextStep);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Vibration.vibrate([0, 100, 50, 200]);
          // Triumphant chime when all 4 steps complete
          try {
            if (sndCollect.current && !isMutedRef.current) {
              await sndCollect.current.setRateAsync(1.5, true);
              await sndCollect.current.replayAsync();
              setTimeout(() => sndCollect.current?.setRateAsync(1.0, true).catch(() => {}), 600);
            }
          } catch (e) {}
          setSystemMessage('FORGE READY — TAP THE CORE TO MERGE');
          Animated.loop(Animated.sequence([
            Animated.timing(forgeBtnAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
            Animated.timing(forgeBtnAnim, { toValue: 0.4, duration: 500, useNativeDriver: false }),
          ])).start();
        } else {
          // Advance to next step
          forgeStepRef.current = nextStep;
          setForgeStep(nextStep);
          const next = FORGE_SEQUENCE[nextStep];
          const side = next.side === 'L' ? 'LEFT' : 'RIGHT';
          const tgt  = next.target === 100 ? 'FULL' : `${next.target}%`;
          setSystemMessage(`HOLD ${side} BAR TO ${tgt}`);
          Vibration.vibrate(80);
          // Step-complete pip sound — collect SFX at higher pitch
          try {
            if (sndCollect.current && !isMutedRef.current) {
              await sndCollect.current.setRateAsync(1.2, true);
              await sndCollect.current.replayAsync();
              setTimeout(() => sndCollect.current?.setRateAsync(1.0, true).catch(() => {}), 400);
            }
          } catch (e) {}
        }
      }

      forgeLoopRef.current = requestAnimationFrame(tick);
    };
    forgeLoopRef.current = requestAnimationFrame(tick);
  };

  const handleForgeTap = async () => {
    if (!forgeReadyRef.current || isMerging) return;
    cancelAnimationFrame(forgeLoopRef.current);
    setIsMerging(true); setIsLocked(true); stopForgeGlow();

    // If wallet is connected, log the forge action on-chain as a Memo transaction.
    // This signs a permanent record of the forge — Core cNFT minting comes in v1.1.
    if (walletConnected) {
      setSystemMessage('LOGGING FORGE TO CHAIN...');
      const txOk = await handleForgeCNFT();
      if (txOk) {
        setSystemMessage('FORGE LOGGED ON-CHAIN — MERGING SHARDS...');
        // Flag that an on-chain log was written so the success screen can confirm it
        setRwaMinted(true);
      } else {
        setSystemMessage('SIGNATURE DECLINED — MERGING OFFLINE...');
      }
    } else {
      setSystemMessage('MERGING SHARDS...');
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate([0, 200, 100, 200, 100, 500]);

    // Start the looping forge sound for the duration of the merge
    try {
      if (sndForging.current && !isMutedRef.current) {
        await sndForging.current.setPositionAsync(0);
        await sndForging.current.playAsync();
      }
    } catch (e) {}

    Animated.loop(Animated.timing(shardSpinAnim, { toValue: 1, duration: 400, easing: Easing.linear, useNativeDriver: false })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(shardPulseAnim, { toValue: 1.5, duration: 300, useNativeDriver: false }),
      Animated.timing(shardPulseAnim, { toValue: 0.7, duration: 300, useNativeDriver: false }),
    ])).start();

    let pulseCount = 0;
    const pulseInterval = setInterval(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); if (++pulseCount >= 6) clearInterval(pulseInterval); }, 250);

    setTimeout(() => {
      shardSpinAnim.stopAnimation(); shardPulseAnim.stopAnimation();
      // Stop forging loop now that the merge is complete
      try { sndForging.current?.stopAsync(); } catch (e) {}
      Animated.sequence([
        Animated.timing(whiteLightAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.delay(200),
        Animated.timing(whiteLightAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]).start();
      Animated.timing(shardVisibilityAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
      setTimeout(() => {
        Animated.timing(epicCoreAnim, { toValue: 1, duration: 800, easing: Easing.out(Easing.elastic(1.1)), useNativeDriver: false }).start();
        setIsSuccess(true); setSystemMessage('KYOKAI CORE FORGED');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate([0, 300, 100, 300]);
        // Triumphant Kyōkai Core chime
        playSFX(sndShardForged);
      }, 500);
      if (!walletConnected) {
        // No auto-return — user uses the [ RETURN TO BASE ] button to leave the success screen
      }
    }, 1800);
  };

  const executePostGameSave = async () => {
    const newShards = Math.max(0, shardsRef.current - 4);
    setShardsBoth(newShards); await AsyncStorage.setItem('@shards', newShards.toString());
    if (isTutorialRef.current) {
      isTutorialRef.current = false; setIsTutorial(false);
      await AsyncStorage.setItem('@tutorial_done', 'true');
    }
  };

  // ── EMP ────────────────────────────────────────────────────────────────────
  const triggerEMP = () => {
    const state = physicsRef.current;
    if (state.empCharge < 100) return;
    state.empCharge = 0;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Vibration.vibrate(400);
    playSFX(sndEMP);
    state.enemies.forEach(e => { if (!e.dead) { e.dead = true; e.respawnTimer = 300; } });
    Animated.sequence([
      Animated.timing(purpleFlashAnim, { toValue: 1, duration: 100, useNativeDriver: false }),
      Animated.timing(purpleFlashAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
    ]).start();
  };

  // ── Special weapons ────────────────────────────────────────────────────────
  const triggerSpecial = () => {
    const opIdx = activeOperatorRef.current;
    if (specialChargeRef.current[opIdx] < 100 || specialActiveRef.current) return;

    // Drain charge
    const newCharges = [...specialChargeRef.current];
    newCharges[opIdx] = 0;
    specialChargeRef.current = newCharges;
    setSpecialCharge([...newCharges]);
    specialChargeAnim[opIdx].setValue(0);

    specialActiveRef.current = true;
    setSpecialActive(true);
    specialReadyAnim.stopAnimation(); specialReadyAnim.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (opIdx === 0) {
      // VEKT — EMP: zap all enemies
      triggerEMP();
      specialActiveRef.current = false;
      setSpecialActive(false);
    } else if (opIdx === 1) {
      // SHOKU — Tornado Blast: stop player, spin, fire 360° for 3s
      const state = physicsRef.current;
      state.velocity.x = 0; state.velocity.y = 0;
      Vibration.vibrate([0, 100, 50, 100, 50, 100]);
      let angle = 0;
      const TORNADO_DURATION = 3000; // ms
      const startTime = Date.now();
      const spinInterval = setInterval(() => {
        if (!physicsRef.current) { clearInterval(spinInterval); return; }
        const s = physicsRef.current;
        const elapsed = Date.now() - startTime;
        if (elapsed >= TORNADO_DURATION) {
          clearInterval(spinInterval);
          tornadoTimerRef.current = null;
          specialActiveRef.current = false;
          setSpecialActive(false);
          return;
        }
        // Fire 8 bullets in a ring every 100ms
        const pCX = s.player.x + PLAYER_SIZE / 2;
        const pCY = s.player.y + PLAYER_SIZE / 2;
        for (let i = 0; i < 8; i++) {
          const a = (angle + i * 45) * (Math.PI / 180);
          s.bullets.push({ x: pCX - 5, y: pCY - 5, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, color: '#FF00FF' });
        }
        angle = (angle + 15) % 360;
        s.facingAngle = angle * (Math.PI / 180);
        // Keep player stationary during tornado
        s.velocity.x = 0; s.velocity.y = 0;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playSFX(sndHeavyShot);
      }, 100);
      tornadoTimerRef.current = spinInterval;
    } else if (opIdx === 2) {
      // GHOST — Phase Shift: invincibility for 3s + visible opacity drop
      const state = physicsRef.current;
      state.isShielded = true;
      if (state.shieldTimer) clearTimeout(state.shieldTimer);
      Vibration.vibrate([0, 200, 100, 200]);
      // Fade player to 0.3 opacity for visible "ghost" state
      Animated.timing(playerOpacityAnim, {
        toValue: 0.3,
        duration: 250,
        useNativeDriver: true,
      }).start();
      state.shieldTimer = setTimeout(() => {
        if (physicsRef.current) physicsRef.current.isShielded = false;
        specialActiveRef.current = false;
        setSpecialActive(false);
        // Snap back to full opacity
        Animated.timing(playerOpacityAnim, {
          toValue: 1.0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }, 3000);
      ghostTimerRef.current = state.shieldTimer;
    } else if (opIdx === 3) {
      // KYOKAZI — Time Freeze: pauses all enemies (and their bullets) for 5 seconds
      const FREEZE_MS = 5000;
      enemyFreezeRef.current = Date.now() + FREEZE_MS;
      Vibration.vibrate([0, 100, 50, 100, 50, 100, 50, 400]);
      // Brief white flash to telegraph the freeze
      Animated.sequence([
        Animated.timing(damageFlashAnim, { toValue: 0.4, duration: 80, useNativeDriver: true }),
        Animated.timing(damageFlashAnim, { toValue: 0,   duration: 600, useNativeDriver: true }),
      ]).start();
      setTimeout(() => {
        enemyFreezeRef.current = 0;
        specialActiveRef.current = false;
        setSpecialActive(false);
      }, FREEZE_MS);
    }
  };

  // Charge special over time — called in game loop per token + per extract
  const chargeSpecial = (opIdx, amount) => {
    const prev   = specialChargeRef.current[opIdx];
    const newVal = Math.min(100, prev + amount);
    specialChargeRef.current[opIdx] = newVal;
    specialChargeAnim[opIdx].setValue(newVal);
    setSpecialCharge(p => { const n = [...p]; n[opIdx] = newVal; return n; });
    // Trigger ready pulse the moment it hits 100
    if (prev < 100 && newVal >= 100) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.loop(Animated.sequence([
        Animated.timing(specialReadyAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(specialReadyAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])).start();
    }
  };
  const spawnExtractZone = () => {
    const zone = {
      x: 60 + Math.random() * (MAX_X - 180),
      y: 40 + Math.random() * (MAX_Y - 120),
    };
    extractZoneRef.current = zone;
    extractTimerRef.current = EXTRACT_OPEN_SEC;
    setExtractZone({ ...zone });
    setExtractSecsLeft(EXTRACT_OPEN_SEC);
    startExtractPulse(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Vibration.vibrate([0, 100, 80, 100]);
    setSystemMessage('⚡ EXTRACTION ZONE OPEN — RUN OR STAY!');

    // Full-screen green alert flash
    setShowZoneAlert(true);
    zoneAlertAnim.setValue(0);
    Animated.sequence([
      Animated.timing(zoneAlertAnim, { toValue: 0.7,  duration: 120, useNativeDriver: true }),
      Animated.timing(zoneAlertAnim, { toValue: 0.3,  duration: 100, useNativeDriver: true }),
      Animated.timing(zoneAlertAnim, { toValue: 0.65, duration: 100, useNativeDriver: true }),
      Animated.timing(zoneAlertAnim, { toValue: 0,    duration: 500, useNativeDriver: true }),
    ]).start(() => setShowZoneAlert(false));

    // Animate timer bar from 1→0 over EXTRACT_OPEN_SEC seconds
    extractTimerAnim.setValue(1);
    Animated.timing(extractTimerAnim, {
      toValue: 0,
      duration: EXTRACT_OPEN_SEC * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  const closeExtractZone = () => {
    extractZoneRef.current = null;
    extractTimerRef.current = 0;
    setExtractZone(null);
    stopExtractPulse();
    extractTimerAnim.stopAnimation();
    setSystemMessage('ZONE CLOSED. KEEP MOVING.');
  };

  const extractSuccess = async () => {
    cancelAnimationFrame(gameLoopRef.current);
    if (secondTickRef.current) { clearInterval(secondTickRef.current); secondTickRef.current = null; }
    if (tornadoTimerRef.current) { clearInterval(tornadoTimerRef.current); tornadoTimerRef.current = null; }
    if (physicsRef.current?.shieldTimer) clearTimeout(physicsRef.current.shieldTimer);
    stopExtractPulse();
    // NOTE: keep isHunting=true so the hunt screen stays mounted and shows the overlay
    setExtractZone(null); specialActiveRef.current = false;
    // Reset spree on extract
    spreeCountRef.current = 0; setSpreeCount(0); setSpreeLabel('');
    if (spreeTimerRef.current) { clearTimeout(spreeTimerRef.current); spreeTimerRef.current = null; }

    // Stop extract loop, play success chime
    await stopExtractSound();
    muffleBGM();
    try {
      if (sndCollect.current) {
        await sndCollect.current.setRateAsync(1.4, true);
        await sndCollect.current.replayAsync();
        setTimeout(() => sndCollect.current?.setRateAsync(1.0, true).catch(() => {}), 800);
      }
    } catch (e) {}

    const earned = runTokensRef.current;
    const newTotal = shadowTokensRef.current + earned;
    setShadowTokens(newTotal);
    shadowTokensRef.current = newTotal;
    await AsyncStorage.setItem('@tokens', newTotal.toString());

    await gainXP(earned * XP_PER_TOKEN + XP_PER_EXTRACT);
    const opIdx = activeOperatorRef.current;
    chargeSpecial(opIdx, SPECIAL_CHARGE_PER_EXTRACT);

    extractRunCountRef.current++;
    extractThresholdRef.current = EXTRACT_BASE_TOKENS * Math.pow(2, extractRunCountRef.current);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate([0, 100, 100, 200, 100, 400]);

    setExtractResult({ tokens: earned });
    setRunTokens(0); runTokensRef.current = 0;
  };

  const triggerDeathGlitch = () => {
    const glitchStep = () => {
      if (!isDead) return; // stop when death screen dismissed — checked at call time
      const target = (Math.random() * 10) - 5; // -5 to 5
      Animated.timing(deathGlitchAnim, {
        toValue: target,
        duration: 50 + Math.random() * 80,
        useNativeDriver: true,
      }).start(() => glitchStep());
    };
    glitchStep();
  };

  const loseHunt = async () => {
    cancelAnimationFrame(gameLoopRef.current);
    if (secondTickRef.current) { clearInterval(secondTickRef.current); secondTickRef.current = null; }
    if (tornadoTimerRef.current) { clearInterval(tornadoTimerRef.current); tornadoTimerRef.current = null; }
    if (spreeTimerRef.current) { clearTimeout(spreeTimerRef.current); spreeTimerRef.current = null; }
    if (physicsRef.current?.shieldTimer) clearTimeout(physicsRef.current.shieldTimer);
    stopExtractPulse();
    setIsHunting(false); isHuntingRef.current = false;
    setExtractZone(null); specialActiveRef.current = false;
    stopExtractSound(); muffleBGM();

    // Bank 50% of run tokens
    const earned  = runTokensRef.current;
    const penalty = Math.floor(earned * DEATH_PENALTY);
    const banked  = earned - penalty;
    bankedAmountRef.current = banked;
    const newTotal = shadowTokensRef.current + banked;
    setShadowTokens(newTotal); shadowTokensRef.current = newTotal;
    await AsyncStorage.setItem('@tokens', newTotal.toString());
    setRunTokens(0); runTokensRef.current = 0;
    await gainXP(banked * XP_PER_TOKEN);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Vibration.vibrate([0, 200, 100, 400]);

    // Show death screen with 5s countdown
    setIsDead(true);
    setDeathCountdown(5);
    deathGlitchAnim.setValue(0);
    Animated.timing(deathScreenAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
      triggerDeathGlitch();
    });

    // Pulse the Hunt Again button
    Animated.loop(Animated.sequence([
      Animated.timing(deathBtnPulseAnim, { toValue: 1.12, duration: 600, useNativeDriver: true }),
      Animated.timing(deathBtnPulseAnim, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
    ])).start();

    let count = 5;
    deathTimerRef.current = setInterval(() => {
      count--;
      setDeathCountdown(count);
      if (count <= 0) {
        clearInterval(deathTimerRef.current);
        deathTimerRef.current = null;
        deathBtnPulseAnim.stopAnimation();
        deathGlitchAnim.stopAnimation(); deathGlitchAnim.setValue(0);
        setIsDead(false);
        deathScreenAnim.setValue(0);
        setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
      }
    }, 1000);
  };

  const startHunt = () => {
    setIsHunting(true); isHuntingRef.current = true;
    setRunTokens(0); runTokensRef.current = 0;
    totalSecondsRef.current = 0;
    extractZoneRef.current = null; extractTimerRef.current = 0;
    tankSpawnedRef.current = false; bossSpawnedRef.current = false; sniperSpawnedRef.current = false; extractUnlockedRef.current = false;
    setExtractZone(null); setExtractSecsLeft(0);
    // Reset health + spree
    playerHealthRef.current = MAX_HEALTH;
    hitInvincibleRef.current = 0;
    spreeCountRef.current = 0;
    setPlayerHealth(MAX_HEALTH);
    setSpreeCount(0); setSpreeLabel('');
    setIsDead(false);
    healthBarAnim.setValue(1);
    deathScreenAnim.setValue(0);
    explosionsRef.current = [];
    setSystemMessage(`ENDLESS TRENCHES. COLLECT ${extractThresholdRef.current} TOKENS TO UNLOCK EXTRACT.`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Vibration.vibrate(200);
    unmuffleBGM();
    joystickPan.setValue({ x: 0, y: 0 });
    heatRef.current = [0, 0, 0, 0]; overheatRef.current = [0, 0, 0, 0];
    heatAnims.forEach(a => a.setValue(0));

    // ── HOODIE SYNC BUFF — start with 100% Special Charge on all operators ──
    if (isHoodieSyncedRef.current) {
      specialChargeRef.current = [100, 100, 100, 100];
      setSpecialCharge([100, 100, 100, 100]);
      specialChargeAnim.forEach(a => a.setValue(100));
      // Flash the "Signal Boost" HUD message
      hoodieBuffTextAnim.setValue(0);
      Animated.sequence([
        Animated.timing(hoodieBuffTextAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(hoodieBuffTextAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate([0, 80, 40, 80, 40, 200]);
      // Consume the buff — one-shot
      isHoodieSyncedRef.current = false;
      setIsHoodieSynced(false);
    } else {
      specialChargeRef.current = [0, 0, 0, 0];
      setSpecialCharge([0, 0, 0, 0]);
      specialChargeAnim.forEach(a => a.setValue(0));
    }

    // Difficulty scales with how many extracts you've already banked in this session
    const runIdx       = extractRunCountRef.current; // 0 on first hunt, 1 after first extract, etc.
    const extraEnemies = Math.min(5, runIdx);        // up to +5 by run 6
    const speedBoost   = 0.25 * runIdx;              // each successful run adds +0.25 base speed

    const baseEnemies = [
      { x: 20,         y: 100,        vx: 2,    vy: 2.2,  dead: false, respawnTimer: 0, isTank: false, hp: 1 },
      { x: MAX_X - 20, y: MAX_Y - 20, vx: -2.2, vy: -1.8, dead: false, respawnTimer: 0, isTank: false, hp: 1 },
      { x: MAX_X / 2,  y: 50,         vx: -1.5, vy: 2.4,  dead: false, respawnTimer: 0, isTank: false, hp: 1 },
    ];
    // Add extras spread across the arena
    for (let i = 0; i < extraEnemies; i++) {
      baseEnemies.push({
        x: 60 + (i * 73) % (MAX_X - 120),
        y: 80 + (i * 91) % (MAX_Y - 160),
        vx: (Math.random() > 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.2),
        vy: (Math.random() > 0.5 ? 1 : -1) * (1.6 + Math.random() * 1.2),
        dead: false, respawnTimer: 0, isTank: false, hp: 1,
      });
    }

    physicsRef.current = {
      player: { x: width / 2, y: height / 2 }, velocity: { x: 0, y: 0 },
      enemies: baseEnemies,
      bullets: [], tokens: [], pulses: [], sniperBullets: [],
      tilt: { x: 0, y: 0 }, facingAngle: 0,
      lastHeartbeat: Date.now(), isShielded: false, shieldTimer: null,
      empCharge: 0, baseEnemySpeed: 2.2 + speedBoost,
    };

    // ── Second-tick: speed scaling + extraction zone countdown ──
    secondTickRef.current = setInterval(() => {
      // Skip ticks entirely while paused — extract timer / speed scaling / splitter spawns all freeze
      if (isPausedRef.current) return;
      totalSecondsRef.current++;
      const secs = totalSecondsRef.current;

      // Scale enemy speed — every 20s normally, every 15s once we're on run 3+
      const speedScaleSec = extractRunCountRef.current >= 2 ? 15 : ENEMY_SPEED_SCALE_SEC;
      if (secs % speedScaleSec === 0) {
        physicsRef.current.baseEnemySpeed += 0.3;
        physicsRef.current.enemies.forEach(e => {
          if (!e.dead) {
            e.vx = Math.sign(e.vx) * (Math.abs(e.vx) + 0.3);
            e.vy = Math.sign(e.vy) * (Math.abs(e.vy) + 0.3);
          }
        });
      }

      // Extraction zone countdown (once spawned)
      if (extractZoneRef.current) {
        extractTimerRef.current--;
        setExtractSecsLeft(extractTimerRef.current);
        const urgency = EXTRACT_OPEN_SEC - extractTimerRef.current;
        startExtractPulse(urgency);
        if (extractTimerRef.current <= 0) closeExtractZone();
      }

      // Splitter spawn — every SPLITTER_SPAWN_RATE seconds, 60% chance, only if level 2+
      if (
        secs > 0 &&
        secs % SPLITTER_SPAWN_RATE === 0 &&
        playerLevelRef.current >= SPLITTER_MIN_LEVEL &&
        Math.random() < 0.6
      ) {
        const corner = Math.floor(Math.random() * 4);
        const spawnX = (corner === 0 || corner === 2) ? 20 : MAX_X - SPLITTER_SIZE - 20;
        const spawnY = (corner === 0 || corner === 1) ? 20 : MAX_Y - SPLITTER_SIZE - 20;
        physicsRef.current.enemies.push({
          x: spawnX, y: spawnY,
          vx: (Math.random() > 0.5 ? 1 : -1) * SPLITTER_SPEED,
          vy: (Math.random() > 0.5 ? 1 : -1) * SPLITTER_SPEED,
          dead: false, respawnTimer: 0,
          isSplitter: true, hp: 1,
        });
      }
    }, 1000);

    const ACCELERATION = 0.65;
    const FRICTION     = 0.78;
    const DEADZONE     = 0.08;

    const loop = () => {
      // Pause gate — keep the RAF alive but skip all simulation/movement so the player
      // can resume exactly where they left off when they tap RESUME.
      if (isPausedRef.current) {
        gameLoopRef.current = requestAnimationFrame(loop);
        return;
      }
      const state = physicsRef.current;
      const op    = operators[activeOperatorRef.current];
      if (state.empCharge < 100) state.empCharge = Math.min(100, state.empCharge + 0.15);

      // Heat cooldown
      for (let i = 0; i < 4; i++) {
        if (overheatRef.current[i] > 0) {
          overheatRef.current[i]--;
          if (overheatRef.current[i] === 0) { heatRef.current[i] = 0; heatAnims[i].setValue(0); }
        } else if (heatRef.current[i] > 0) {
          const cooled = Math.max(0, heatRef.current[i] - HEAT_COOLDOWN);
          heatRef.current[i] = cooled; heatAnims[i].setValue(cooled);
        }
      }

      // Movement
      let tiltX = Math.abs(state.tilt.x) < DEADZONE ? 0 : state.tilt.x;
      let tiltY = Math.abs(state.tilt.y) < DEADZONE ? 0 : state.tilt.y;
      state.velocity.x = (state.velocity.x + tiltX * ACCELERATION * op.speedMult) * FRICTION;
      state.velocity.y = (state.velocity.y + tiltY * ACCELERATION * op.speedMult) * FRICTION;
      state.player.x += state.velocity.x;
      state.player.y += state.velocity.y;
      if (Math.abs(state.velocity.x) > 0.1 || Math.abs(state.velocity.y) > 0.1) {
        state.facingAngle = Math.atan2(state.velocity.y, state.velocity.x) + (Math.PI / 2);
      }
      if (state.player.x < 0)     { state.player.x = 0;     state.velocity.x = 0; }
      if (state.player.x > MAX_X) { state.player.x = MAX_X; state.velocity.x = 0; }
      if (state.player.y < 0)     { state.player.y = 0;     state.velocity.y = 0; }
      if (state.player.y > MAX_Y) { state.player.y = MAX_Y; state.velocity.y = 0; }

      // Bullets — multi-hit + explosions + spree
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.x += b.vx; b.y += b.vy;
        if (b.x < 0 || b.x > width || b.y < 0 || b.y > height) { state.bullets.splice(i, 1); continue; }
        let hit = false;
        for (const e of state.enemies) {
          if (e.dead) continue;
          const hitRadius = e.isTank ? TANK_SIZE : (e.isBoss ? e.size : (e.isSniper ? SNIPER_SIZE : (e.isSplitter ? SPLITTER_SIZE : (e.isMiniSplitter ? SPLITTER_MINI_SIZE : ENEMY_SIZE))));
          if (Math.hypot(b.x - e.x, b.y - e.y) < hitRadius) {
            e.hp--;
            hit = true;
            if (e.hp <= 0) {
              // Splitter parents split into 2 minis instead of just dying
              if (e.isSplitter && !e.isMiniSplitter) {
                e.dead = true;
                e.respawnTimer = 99999; // never respawn — replaced by minis
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                playSFX(sndDeath);
                const exCX = e.x + SPLITTER_SIZE / 2;
                const exCY = e.y + SPLITTER_SIZE / 2;
                // Quick yellow shatter burst on split
                explosionsRef.current.push({
                  x: exCX, y: exCY, color: '#FFD700',
                  frame: 0, maxFrame: 18, isBlast: true,
                  vx: 0, vy: 0, baseSize: SPLITTER_SIZE * 0.6,
                });
                // Spawn 2 mini splitters flying in opposite directions
                for (let m = 0; m < 2; m++) {
                  const ang = m === 0 ? Math.random() * Math.PI : Math.random() * Math.PI + Math.PI;
                  state.enemies.push({
                    x: exCX - SPLITTER_MINI_SIZE / 2,
                    y: exCY - SPLITTER_MINI_SIZE / 2,
                    vx: Math.cos(ang) * 2.5,
                    vy: Math.sin(ang) * 2.5,
                    dead: false, respawnTimer: 0,
                    isMiniSplitter: true, hp: 1,
                  });
                }
                break;
              }
              e.dead = true;
              e.respawnTimer = e.isBoss ? 500 : e.isTank ? 300 : 180;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              playSFX(sndDeath);
              // Spawn shrapnel — 8 fragments fly outward + central blast
              const eSize = e.isBoss ? e.size
                          : e.isSniper ? SNIPER_SIZE
                          : e.isTank ? TANK_SIZE
                          : (e.isMiniSplitter ? SPLITTER_MINI_SIZE : ENEMY_SIZE);
              const exColor = e.isBoss ? '#FF6600'
                            : e.isSniper ? '#00BFFF'
                            : e.isTank ? '#FF4444'
                            : (e.isMiniSplitter ? '#FFD700' : '#FF2200');
              const exCX = e.x + eSize / 2;
              const exCY = e.y + eSize / 2;
              // Central blast
              explosionsRef.current.push({
                x: exCX, y: exCY, color: exColor,
                frame: 0, maxFrame: 22, isBlast: true,
                vx: 0, vy: 0, baseSize: eSize * 0.7,
              });
              // 8 shrapnel fragments
              const fragCount = e.isBoss ? 12 : e.isTank ? 10 : 8;
              for (let f = 0; f < fragCount; f++) {
                const ang = (f / fragCount) * Math.PI * 2 + Math.random() * 0.3;
                const speed = 3 + Math.random() * 4;
                explosionsRef.current.push({
                  x: exCX, y: exCY,
                  vx: Math.cos(ang) * speed,
                  vy: Math.sin(ang) * speed,
                  color: exColor,
                  frame: 0, maxFrame: 30 + Math.floor(Math.random() * 10),
                  baseSize: 3 + Math.random() * 4,
                  isBlast: false,
                });
              }
              // Token drops
              const drops = e.isSniper ? 8 : e.isBoss ? 6 : e.isTank ? 3 : 1;
              for (let d = 0; d < drops; d++) {
                state.tokens.push({
                  x: e.x + eSize / 2 - TOKEN_SIZE / 2 + (Math.random() - 0.5) * 30,
                  y: e.y + eSize / 2 - TOKEN_SIZE / 2 + (Math.random() - 0.5) * 30,
                  spawnTime: Date.now(),
                });
              }
              // Spree logic
              spreeCountRef.current++;
              const sc = spreeCountRef.current;
              if (spreeTimerRef.current) clearTimeout(spreeTimerRef.current);
              spreeTimerRef.current = setTimeout(() => { spreeCountRef.current = 0; setSpreeCount(0); }, SPREE_WINDOW_MS);
              if (sc >= 5) {
                const label = sc >= 10 ? `STATIC RAMPAGE ×${sc}!` : sc >= 7 ? `STATIC DOMINATION ×${sc}!` : `STATIC SPREE ×${sc}!`;
                setSpreeLabel(label); setSpreeCount(sc);
                gainXP(XP_PER_SPREE * sc);
                Animated.sequence([
                  Animated.timing(spreeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                  Animated.delay(900),
                  Animated.timing(spreeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
                ]).start();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            break;
          }
        }
        if (hit) state.bullets.splice(i, 1);
      }

      // Advance explosion particles — shrapnel flies outward, blast just fades
      explosionsRef.current = explosionsRef.current
        .map(ex => ({
          ...ex,
          x: ex.x + (ex.vx || 0),
          y: ex.y + (ex.vy || 0),
          vx: (ex.vx || 0) * 0.92, // friction
          vy: (ex.vy || 0) * 0.92,
          frame: ex.frame + 1,
        }))
        .filter(ex => ex.frame < ex.maxFrame);

      // ── Ghost pulse waves — expand each frame, hit any enemy in their path ──
      for (let pi = state.pulses.length - 1; pi >= 0; pi--) {
        const pulse = state.pulses[pi];
        pulse.radius += pulse.speed;
        if (pulse.radius >= pulse.maxRadius) {
          state.pulses.splice(pi, 1);
          continue;
        }
        // Check enemies — if center distance is within (radius ± 30) the pulse front sweeps them
        const PULSE_THICKNESS = 30;
        for (const e of state.enemies) {
          if (e.dead) continue;
          if (pulse.hitEnemies.has(e)) continue;
          const eSize    = e.isBoss ? BOSS_SIZE : e.isSniper ? SNIPER_SIZE : e.isTank ? TANK_SIZE : (e.isSplitter ? SPLITTER_SIZE : (e.isMiniSplitter ? SPLITTER_MINI_SIZE : ENEMY_SIZE));
          const eCX      = e.x + eSize / 2;
          const eCY      = e.y + eSize / 2;
          const dist     = Math.hypot(eCX - pulse.x, eCY - pulse.y);
          if (Math.abs(dist - pulse.radius) <= PULSE_THICKNESS) {
            pulse.hitEnemies.add(e);
            e.hp--;
            if (e.hp <= 0) {
              // Splitter parents split into 2 minis instead of dying
              if (e.isSplitter && !e.isMiniSplitter) {
                e.dead = true;
                e.respawnTimer = 99999;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                playSFX(sndDeath);
                explosionsRef.current.push({
                  x: eCX, y: eCY, color: '#FFD700',
                  frame: 0, maxFrame: 18, isBlast: true,
                  vx: 0, vy: 0, baseSize: SPLITTER_SIZE * 0.6,
                });
                for (let m = 0; m < 2; m++) {
                  const ang = m === 0 ? Math.random() * Math.PI : Math.random() * Math.PI + Math.PI;
                  state.enemies.push({
                    x: eCX - SPLITTER_MINI_SIZE / 2,
                    y: eCY - SPLITTER_MINI_SIZE / 2,
                    vx: Math.cos(ang) * 2.5,
                    vy: Math.sin(ang) * 2.5,
                    dead: false, respawnTimer: 0,
                    isMiniSplitter: true, hp: 1,
                  });
                }
                continue;
              }
              e.dead = true;
              e.respawnTimer = e.isBoss ? 500 : e.isTank ? 300 : 180;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              playSFX(sndDeath);
              const exColor = e.isBoss ? '#FF6600' : e.isSniper ? '#00BFFF' : e.isTank ? '#FF4444' : (e.isMiniSplitter ? '#FFD700' : '#FF2200');
              explosionsRef.current.push({
                x: eCX, y: eCY, color: exColor,
                frame: 0, maxFrame: 22, isBlast: true,
                vx: 0, vy: 0, baseSize: eSize * 0.7,
              });
              const fragCount = e.isBoss ? 12 : e.isTank ? 10 : 8;
              for (let f = 0; f < fragCount; f++) {
                const ang = (f / fragCount) * Math.PI * 2 + Math.random() * 0.3;
                const speed = 3 + Math.random() * 4;
                explosionsRef.current.push({
                  x: eCX, y: eCY,
                  vx: Math.cos(ang) * speed,
                  vy: Math.sin(ang) * speed,
                  color: exColor,
                  frame: 0, maxFrame: 30 + Math.floor(Math.random() * 10),
                  baseSize: 3 + Math.random() * 4,
                  isBlast: false,
                });
              }
              const drops = e.isBoss ? 6 : e.isTank ? 3 : 1;
              for (let d = 0; d < drops; d++) {
                state.tokens.push({
                  x: e.x + eSize / 2 - TOKEN_SIZE / 2 + (Math.random() - 0.5) * 30,
                  y: e.y + eSize / 2 - TOKEN_SIZE / 2 + (Math.random() - 0.5) * 30,
                  spawnTime: Date.now(),
                });
              }
              spreeCountRef.current++;
              const sc = spreeCountRef.current;
              if (spreeTimerRef.current) clearTimeout(spreeTimerRef.current);
              spreeTimerRef.current = setTimeout(() => { spreeCountRef.current = 0; setSpreeCount(0); }, SPREE_WINDOW_MS);
              if (sc >= 5) {
                const label = sc >= 10 ? `STATIC RAMPAGE ×${sc}!` : sc >= 7 ? `STATIC DOMINATION ×${sc}!` : `STATIC SPREE ×${sc}!`;
                setSpreeLabel(label); setSpreeCount(sc);
                gainXP(XP_PER_SPREE * sc);
                Animated.sequence([
                  Animated.timing(spreeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                  Animated.delay(900),
                  Animated.timing(spreeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
                ]).start();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }
        }
      }

      // Token collection — expire after 5s, count toward run total + check milestones
      const TOKEN_LIFETIME_MS = 5000;
      const TOKEN_FADE_MS     = 1500; // last 1.5s the token fades
      const pCX = state.player.x + PLAYER_SIZE / 2;
      const pCY = state.player.y + PLAYER_SIZE / 2;
      const nowMs = Date.now();
      for (let i = state.tokens.length - 1; i >= 0; i--) {
        const t = state.tokens[i];
        const age = nowMs - (t.spawnTime || nowMs);

        // Expire if too old
        if (age >= TOKEN_LIFETIME_MS) { state.tokens.splice(i, 1); continue; }

        // Compute opacity for render (1.0 → 0.0 over last TOKEN_FADE_MS)
        const fadeStart = TOKEN_LIFETIME_MS - TOKEN_FADE_MS;
        t.opacity = age > fadeStart ? 1 - (age - fadeStart) / TOKEN_FADE_MS : 1;

        if (Math.hypot(pCX - (t.x + TOKEN_SIZE / 2), pCY - (t.y + TOKEN_SIZE / 2)) < (PLAYER_SIZE / 2 + TOKEN_SIZE)) {
          state.tokens.splice(i, 1);
          runTokensRef.current++;
          setRunTokens(r => {
            const newCount = r + 1;

            // Charge active operator's special per token
            chargeSpecial(activeOperatorRef.current, SPECIAL_CHARGE_PER_TOKEN);

            // Milestone 1: spawn first tank at 10 tokens
            if (newCount >= TANK_SPAWN_TOKENS && !tankSpawnedRef.current) {
              tankSpawnedRef.current = true;
              const spawnX = Math.random() > 0.5 ? 20 : MAX_X - TANK_SIZE - 20;
              const spawnY = Math.random() > 0.5 ? 20 : MAX_Y - TANK_SIZE - 20;
              state.enemies.push({
                x: spawnX, y: spawnY,
                vx: (Math.random() > 0.5 ? 1 : -1) * TANK_SPEED,
                vy: (Math.random() > 0.5 ? 1 : -1) * TANK_SPEED,
                dead: false, respawnTimer: 0,
                isTank: true, hp: TANK_HP,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              Vibration.vibrate([0, 200, 100, 200]);
              setSystemMessage('⚠ HEAVY STATIC DETECTED — MULTIPLE HITS REQUIRED');
              setTimeout(() => setSystemMessage('STAY ALIVE. COLLECT TOKENS.'), 2500);
            }

            // Milestone 2: spawn boss at 30 tokens — only if player level 5+
            if (newCount >= BOSS_SPAWN_TOKENS && !bossSpawnedRef.current && playerLevelRef.current >= BOSS_MIN_LEVEL) {
              bossSpawnedRef.current = true;
              const spawnX = Math.random() > 0.5 ? 20 : MAX_X - BOSS_SIZE - 20;
              const spawnY = Math.random() > 0.5 ? 20 : MAX_Y - BOSS_SIZE - 20;
              state.enemies.push({
                x: spawnX, y: spawnY,
                vx: (Math.random() > 0.5 ? 1 : -1) * BOSS_SPEED,
                vy: (Math.random() > 0.5 ? 1 : -1) * BOSS_SPEED,
                dead: false, respawnTimer: 0,
                isBoss: true, size: BOSS_SIZE, hp: BOSS_HP,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Vibration.vibrate([0, 300, 100, 300, 100, 500]);
              setSystemMessage('☠ APEX STATIC INBOUND — HIT IT 8 TIMES!');
              setTimeout(() => setSystemMessage('STAY ALIVE. COLLECT TOKENS.'), 3000);
            }

            // Milestone 2b: SNIPER BOSS — only on resumed-hunt #3+, at 20 tokens
            if (newCount >= 20 && !sniperSpawnedRef.current && extractRunCountRef.current >= SNIPER_MIN_RUN) {
              sniperSpawnedRef.current = true;
              // Spawn at the corner farthest from the player
              const pX = state.player.x;
              const pY = state.player.y;
              const corners = [
                { x: 30,                      y: 30 },
                { x: MAX_X - SNIPER_SIZE - 30, y: 30 },
                { x: 30,                      y: MAX_Y - SNIPER_SIZE - 30 },
                { x: MAX_X - SNIPER_SIZE - 30, y: MAX_Y - SNIPER_SIZE - 30 },
              ];
              const farthest = corners.reduce((best, c) => {
                const d = Math.hypot(c.x - pX, c.y - pY);
                return d > best.d ? { x: c.x, y: c.y, d } : best;
              }, { x: 30, y: 30, d: 0 });
              state.enemies.push({
                x: farthest.x, y: farthest.y,
                vx: (Math.random() > 0.5 ? 1 : -1) * SNIPER_SPEED,
                vy: (Math.random() > 0.5 ? 1 : -1) * SNIPER_SPEED,
                dead: false, respawnTimer: 0,
                isSniper: true, hp: SNIPER_HP, size: SNIPER_SIZE,
                lastShotMs: Date.now(),
                flashFrame: 0,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Vibration.vibrate([0, 400, 100, 400, 100, 600]);
              setSystemMessage('⊚ WARDEN STATIC — DODGE ITS PROJECTILES!');
              setTimeout(() => setSystemMessage('STAY ALIVE. COLLECT TOKENS.'), 3500);
            }

            // Milestone 3: spawn extraction zone at threshold tokens (escalates each run)
            if (newCount >= extractThresholdRef.current && !extractUnlockedRef.current) {
              extractUnlockedRef.current = true;
              spawnExtractZone();
            }

            return newCount;
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          playSFX(sndCollect);
        }
      }

      // Enemies — use correct size for each type
      const isFrozen = enemyFreezeRef.current > Date.now();
      state.enemies.forEach(e => {
        const eSize = e.isBoss ? BOSS_SIZE
                    : e.isSniper ? SNIPER_SIZE
                    : e.isTank ? TANK_SIZE
                    : e.isSplitter ? SPLITTER_SIZE
                    : e.isMiniSplitter ? SPLITTER_MINI_SIZE
                    : ENEMY_SIZE;
        if (e.dead) {
          // Mini splitters and splitters that have split don't respawn
          if (e.isMiniSplitter || (e.isSplitter && e.respawnTimer >= 99999)) {
            return;
          }
          // Sniper boss doesn't respawn — once dead it's gone for the run
          if (e.isSniper) return;
          e.respawnTimer--;
          if (e.respawnTimer <= 0) {
            e.dead = false; e.hp = e.isBoss ? BOSS_HP : e.isTank ? TANK_HP : 1;
            e.x = Math.random() > 0.5 ? 20 : MAX_X - eSize - 20;
            e.y = Math.random() > 0.5 ? 20 : MAX_Y - eSize - 20;
          }
          return;
        }
        // KYOKAZI Time Freeze — skip movement and shooting while frozen, but
        // enemies remain shootable (collision + bullet hits still process normally).
        if (isFrozen) return;
        e.x += e.vx; e.y += e.vy;
        if (e.x <= 0 || e.x >= MAX_X - eSize) e.vx *= -1;
        if (e.y <= 0 || e.y >= MAX_Y - eSize) e.vy *= -1;

        // Sniper-specific: increment flash counter + fire at player on cadence
        if (e.isSniper) {
          e.flashFrame = (e.flashFrame + 1) % 60;
          const nowSnipe = Date.now();
          if (nowSnipe - e.lastShotMs > SNIPER_SHOT_INTERVAL_MS) {
            e.lastShotMs = nowSnipe;
            const sCX = e.x + SNIPER_SIZE / 2;
            const sCY = e.y + SNIPER_SIZE / 2;
            const tdx = (state.player.x + PLAYER_SIZE / 2) - sCX;
            const tdy = (state.player.y + PLAYER_SIZE / 2) - sCY;
            const tmag = Math.hypot(tdx, tdy) || 1;
            state.sniperBullets.push({
              x: sCX, y: sCY,
              vx: (tdx / tmag) * SNIPER_BULLET_SPEED,
              vy: (tdy / tmag) * SNIPER_BULLET_SPEED,
              spawnMs: nowSnipe,
            });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }
        }
      });
      // Clean up dead mini-splitters, split parents, and dead snipers
      state.enemies = state.enemies.filter(e =>
        !(e.dead && (e.isMiniSplitter || (e.isSplitter && e.respawnTimer >= 99999) || e.isSniper))
      );

      // ── Sniper bullets — straight-line movement, expire after lifetime, collide with player ──
      const nowMsSniper = Date.now();
      const bulletsFrozen = enemyFreezeRef.current > nowMsSniper;
      for (let bi = state.sniperBullets.length - 1; bi >= 0; bi--) {
        const sb = state.sniperBullets[bi];
        // KYOKAZI Time Freeze — bullets pause in flight too
        if (!bulletsFrozen) { sb.x += sb.vx; sb.y += sb.vy; }
        // Expire on lifetime or off-arena
        if (
          nowMsSniper - sb.spawnMs > SNIPER_BULLET_LIFE_MS ||
          sb.x < -50 || sb.x > MAX_X + 50 ||
          sb.y < -50 || sb.y > MAX_Y + 50
        ) {
          state.sniperBullets.splice(bi, 1);
        }
      }

      // Heartbeat haptic (proximity to nearest enemy, not to target)
      const now = Date.now();
      const hbInterval = Math.max(120, Math.min(1200, 500));
      if (now - state.lastHeartbeat > hbInterval) {
        state.lastHeartbeat = now;
        huntPulseAnim.setValue(1);
        Animated.timing(huntPulseAnim, { toValue: 0, duration: hbInterval - 20, useNativeDriver: false }).start();
      }

      // ── Extraction zone — stand in it for 3 seconds (180 frames) ──
      const zone = extractZoneRef.current;
      if (zone) {
        const zCX = zone.x + EXTRACT_SIZE / 2;
        const zCY = zone.y + EXTRACT_SIZE / 2;
        if (Math.hypot(pCX - zCX, pCY - zCY) < (PLAYER_SIZE / 2 + EXTRACT_SIZE / 2)) {
          zone.captureFrames = (zone.captureFrames || 0) + 1;
          extractCaptureAnim.setValue(zone.captureFrames / 180);

          // Start extract sound on first frame in zone
          if (zone.captureFrames === 1) startExtractSound();

          // Escalate pitch every 60 frames (~1 second): 1.0 → 1.17 → 1.33 → 1.5
          if (zone.captureFrames % 60 === 0) updateExtractPitch(zone.captureFrames);

          // Green flash + haptic every 30 frames
          if (zone.captureFrames % 30 === 0) {
            Animated.sequence([
              Animated.timing(extractFlashAnim, { toValue: 0.3, duration: 80, useNativeDriver: false }),
              Animated.timing(extractFlashAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
            ]).start();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }

          if (zone.captureFrames >= 180) {
            extractSuccess();
            return;
          }
        } else {
          if (zone.captureFrames > 0) {
            // Player left zone — stop extract sound and reset progress
            stopExtractSound();
            zone.captureFrames = Math.max(0, zone.captureFrames - 2);
            extractCaptureAnim.setValue(zone.captureFrames / 180);
          }
        }
      }

      // Tick hit invincibility
      if (hitInvincibleRef.current > 0) hitInvincibleRef.current--;

      // Enemy collision with player — uses health bar
      if (!state.isShielded && hitInvincibleRef.current === 0) {
        let hitEnemy = false;
        state.enemies.forEach(e => {
          if (e.dead) return;
          const eSize    = e.isBoss ? e.size
                         : e.isSniper ? SNIPER_SIZE
                         : e.isTank ? TANK_SIZE
                         : e.isSplitter ? SPLITTER_SIZE
                         : e.isMiniSplitter ? SPLITTER_MINI_SIZE
                         : ENEMY_SIZE;
          const eCenterX = e.x + eSize / 2;
          const eCenterY = e.y + eSize / 2;
          if (Math.hypot(pCX - eCenterX, pCY - eCenterY) < (PLAYER_SIZE / 2 + eSize / 2 - 5)) hitEnemy = true;
        });

        // Sniper bullets — separate collision check, removes the offending bullet
        for (let bi = state.sniperBullets.length - 1; bi >= 0; bi--) {
          const sb = state.sniperBullets[bi];
          if (Math.hypot(pCX - sb.x, pCY - sb.y) < (PLAYER_SIZE / 2 + SNIPER_BULLET_SIZE / 2)) {
            hitEnemy = true;
            state.sniperBullets.splice(bi, 1);
          }
        }

        if (hitEnemy) {
          playerHealthRef.current--;
          hitInvincibleRef.current = HIT_INVINCIBLE_FRAMES;
          // Reset spree on hit
          spreeCountRef.current = 0; setSpreeCount(0); setSpreeLabel('');
          if (spreeTimerRef.current) { clearTimeout(spreeTimerRef.current); spreeTimerRef.current = null; }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          Vibration.vibrate(120);
          playSFX(sndDamage);
          // Flash player red + full-screen glitch
          Animated.sequence([
            Animated.timing(hitFlashAnim,    { toValue: 1,   duration: 60,  useNativeDriver: true }),
            Animated.timing(hitFlashAnim,    { toValue: 0,   duration: 60,  useNativeDriver: true }),
            Animated.timing(hitFlashAnim,    { toValue: 1,   duration: 60,  useNativeDriver: true }),
            Animated.timing(hitFlashAnim,    { toValue: 0,   duration: 60,  useNativeDriver: true }),
          ]).start();
          // Full-screen red glitch
          setShowDamageText(true);
          Animated.sequence([
            Animated.timing(damageFlashAnim, { toValue: 0.55, duration: 60,  useNativeDriver: true }),
            Animated.timing(damageFlashAnim, { toValue: 0.15, duration: 50,  useNativeDriver: true }),
            Animated.timing(damageFlashAnim, { toValue: 0.45, duration: 50,  useNativeDriver: true }),
            Animated.timing(damageFlashAnim, { toValue: 0,    duration: 200, useNativeDriver: true }),
          ]).start(() => setShowDamageText(false));
          // Animate health bar — flash orange then settle
          const hFrac = Math.max(0, playerHealthRef.current / MAX_HEALTH);
          setPlayerHealth(playerHealthRef.current);
          Animated.sequence([
            Animated.timing(healthBarAnim, { toValue: hFrac + 0.05, duration: 80, useNativeDriver: false }),
            Animated.timing(healthBarAnim, { toValue: hFrac, duration: 200, useNativeDriver: false }),
          ]).start();

          if (playerHealthRef.current <= 0) {
            loseHunt();
            return;
          }
        }
      }

      setTick(t => t + 1);
      gameLoopRef.current = requestAnimationFrame(loop);
    };
    gameLoopRef.current = requestAnimationFrame(loop);
  };

  const handleNFCSync = () => {
    if (isLocked || isScanning || isHunting || isForging || isTutorial || briefing) return;
    setIsScanning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // NOTE: If react-native-nfc-manager is installed, replace the timeout below with:
    //   NfcManager.start();
    //   NfcManager.requestTechnology(NfcTech.Ndef);
    //   const tag = await NfcManager.getTag();
    //   NfcManager.cancelTechnologyRequest();
    if (animLoopsRef.current.scan) animLoopsRef.current.scan.stop();
    animLoopsRef.current.scan = Animated.loop(
      Animated.timing(scanPulseAnim, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    );
    animLoopsRef.current.scan.start();
    setTimeout(async () => {
      if (animLoopsRef.current.scan) animLoopsRef.current.scan.stop();
      Animated.timing(scanPulseAnim, { toValue: 0, duration: 10, useNativeDriver: false }).start();

      // ── Alpha gate: ritual visual completes but buff is locked ──
      // The actual buff (setIsHoodieSynced + isHoodieSyncedRef) is intentionally NOT applied.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Vibration.vibrate([0, 80, 60, 80]);

      // 'Encrypted' two-tone chime — quieter version of the original sync chime
      try {
        if (sndCollect.current && !isMutedRef.current) {
          await sndCollect.current.setRateAsync(0.7, true);
          await sndCollect.current.replayAsync();
          setTimeout(async () => {
            try {
              await sndCollect.current.setRateAsync(0.9, true);
              await sndCollect.current.replayAsync();
              setTimeout(() => sndCollect.current?.setRateAsync(1.0, true).catch(() => {}), 600);
            } catch (e) {}
          }, 250);
        }
      } catch (e) {}

      // Subtle purple flash so the ritual still feels like something happened
      Animated.sequence([
        Animated.timing(purpleFlashAnim, { toValue: 0.5, duration: 100, useNativeDriver: false }),
        Animated.timing(purpleFlashAnim, { toValue: 0,   duration: 600, useNativeDriver: false }),
      ]).start();

      setSystemMessage('NFC ENCRYPTION DETECTED. PUSHY HARDWARE SYNC COMING IN ALPHA 1.1.');
      setTimeout(() => {
        setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
      }, 4000);

      setIsScanning(false);
    }, 2500);
  };

  // ── Interpolations ─────────────────────────────────────────────────────────
  const radarScale     = scanPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 4] });
  const radarOpacity   = scanPulseAnim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.2, 0] });
  const coreFade       = epicCoreAnim.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] });
  const coreScale      = epicCoreAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const shieldRotation = shieldSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const leftBarHeight  = leftBarAnim.interpolate({ inputRange: [0, FORGE_MAX], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  const rightBarHeight = rightBarAnim.interpolate({ inputRange: [0, FORGE_MAX], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  const leftBarColor   = leftBarAnim.interpolate({ inputRange: [0, 60, 100], outputRange: ['#3a0060', '#B026FF', '#FFFFFF'], extrapolate: 'clamp' });
  const rightBarColor  = rightBarAnim.interpolate({ inputRange: [0, 60, 100], outputRange: ['#3a0060', '#B026FF', '#FFFFFF'], extrapolate: 'clamp' });
  const shardMergeSpin = shardSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (!isAppReady) return <View style={styles.container} />;

  // ── INTRO ──────────────────────────────────────────────────────────────────
  if (appStage === 'INTRO') {
    return (
      <ImageBackground source={require('../assets/images/intro-bg.png')} style={styles.introContainer} resizeMode="cover">
        <View style={styles.introButtonWrapper}>
          <Animated.View style={[styles.introButtonGlow, { opacity: buttonFlashAnim }]} />
          <Pressable
            onPress={() => { playBtn(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setAppStage('MAIN'); }}
            style={styles.introButton}
          >
            <Text style={styles.introButtonText}>[ ENTER KYŌKAI ]</Text>
          </Pressable>
          <Pressable
            onPress={() => { playBtn(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTutorialStep(0); tutorialPanelAnim.setValue(0); setAppStage('TUTORIAL'); }}
            style={styles.introInfoButton}
          >
            <Text style={styles.introInfoButtonText}>[ GAME INFO ]</Text>
          </Pressable>
        </View>
      </ImageBackground>
    );
  }

  // ── TUTORIAL SEQUENCE ──────────────────────────────────────────────────────
  if (appStage === 'TUTORIAL') {
    const PANELS = [
      {
        icon:  '◈',
        color: '#00FFFF',
        title: 'PICK YOUR OPERATOR',
        body:  'VEKT — balanced. Single shot.\nSHOKU — 3-way spread. Slow but deadly.\nGHOST — lightning fast bullets.\n\nShoot to move. Each weapon builds HEAT.\nSwap operators to keep firing.',
      },
      {
        icon:  '◆',
        color: '#B026FF',
        title: 'COLLECT SHADOW TOKENS',
        body:  'Destroy The Static to drop\npurple Shadow Tokens.\nWalk over them to bank.\n\nKill 5 in a row? STATIC SPREE.\nBonus XP. Keep the streak alive.',
      },
      {
        icon:  '❤',
        color: '#FF2200',
        title: 'YOU HAVE 5 LIVES',
        body:  'Each Static hit costs one life.\nYou flash red when hit —\nyou\'re briefly invincible. Use it.\n\nLose all 5 and it\'s game over.\nDie before extracting? Keep 50% only.',
      },
      {
        icon:  '⚡',
        color: '#FFD700',
        title: 'SPECIAL WEAPONS',
        body:  'Collect tokens to charge your SPECIAL.\nWhen it glows — tap to fire.\n\nVEKT: EMP wipes all enemies.\nSHOKU: Tornado Blast — 360° fire.\nGHOST: Phase Shift — go invincible.',
      },
      {
        icon:  '▣',
        color: '#39FF14',
        title: 'EXTRACT TO WIN',
        body:  'Hit 5 tokens and the green\nEXTRACT ZONE appears.\n\nStand in it for 3 seconds\nto bank everything and escape.\n\nStay longer = more tokens.\nBut the longer you wait, the harder it gets.',
      },
    ];

    const panel = PANELS[tutorialStep];
    const isLast = tutorialStep === PANELS.length - 1;

    const advancePanel = () => {
      playBtn();
      Animated.parallel([
        Animated.timing(tutorialPanelAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }),
        Animated.timing(tutorialSlideAnim,  { toValue: -30, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        if (isLast) {
          setAppStage('MAIN');
          return;
        }
        tutorialSlideAnim.setValue(40);
        setTutorialStep(s => s + 1);
        Animated.parallel([
          Animated.timing(tutorialPanelAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(tutorialSlideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start();
      });
    };

    // Auto-start first panel fade-in
    if (tutorialPanelAnim._value === 0 && tutorialStep === 0) {
      tutorialSlideAnim.setValue(40);
      Animated.parallel([
        Animated.timing(tutorialPanelAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(tutorialSlideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }

    return (
      <Pressable style={styles.tutorialContainer} onPress={advancePanel}>
        {/* Step dots */}
        <View style={styles.tutorialDots}>
          {PANELS.map((_, i) => (
            <View key={i} style={[styles.tutorialDot, i === tutorialStep && styles.tutorialDotActive, i < tutorialStep && styles.tutorialDotDone]} />
          ))}
        </View>

        <Animated.View style={[styles.tutorialPanel, { opacity: tutorialPanelAnim, transform: [{ translateY: tutorialSlideAnim }] }]}>
          {/* Big icon */}
          <Text style={[styles.tutorialIcon, { color: panel.color }]}>{panel.icon}</Text>

          {/* Title */}
          <Text style={[styles.tutorialTitle, { color: panel.color }]}>{panel.title}</Text>

          {/* Divider */}
          <View style={[styles.tutorialDivider, { backgroundColor: panel.color }]} />

          {/* Body */}
          <Text style={styles.tutorialBody}>{panel.body}</Text>
        </Animated.View>

        {/* Tap prompt */}
        <Animated.Text style={[styles.tutorialTap, { opacity: tutorialPanelAnim }]}>
          {isLast ? '[ TAP TO ENTER KYŌKAI ]' : '[ TAP TO CONTINUE ]'}
        </Animated.Text>

        {/* Step counter */}
        <Text style={styles.tutorialCounter}>{tutorialStep + 1} / {PANELS.length}</Text>
      </Pressable>
    );
  }
  if (isForging) {
    // Work out which bar is active and what the current target % is
    const currentStep   = forgeStep < FORGE_SEQUENCE.length ? FORGE_SEQUENCE[forgeStep] : null;
    const leftActive    = currentStep?.side === 'L';
    const rightActive   = currentStep?.side === 'R';

    // Target line positions for each bar (% height from bottom)
    const leftTargets  = FORGE_SEQUENCE.filter(s => s.side === 'L').map(s => s.target);
    const rightTargets = FORGE_SEQUENCE.filter(s => s.side === 'R').map(s => s.target);

    // Which left/right targets are already completed
    const leftDone  = FORGE_SEQUENCE.slice(0, forgeStep).filter(s => s.side === 'L').length;
    const rightDone = FORGE_SEQUENCE.slice(0, forgeStep).filter(s => s.side === 'R').length;

    return (
      <View style={styles.forgeContainer}>

        {/* ── Left bar ── */}
        <View
          style={[styles.forgeBarSide, leftActive && styles.forgeBarSideActive]}
          onTouchStart={() => { leftHeldRef.current = true; playBtn(); }}
          onTouchEnd={() => { leftHeldRef.current = false; }}
          onTouchCancel={() => { leftHeldRef.current = false; }}
        >
          <Text style={[styles.forgeBarLabel, leftActive && styles.forgeBarLabelActive]}>
            {leftActive ? '◀ HOLD' : 'LEFT'}
          </Text>
          <View style={styles.forgeBarTrack}>
            {/* Target marker lines */}
            {leftTargets.map((tgt, i) => (
              <View
                key={i}
                style={[
                  styles.forgeTargetLine,
                  { bottom: `${tgt}%` },
                  i < leftDone && styles.forgeTargetLineDone,
                  leftActive && FORGE_SEQUENCE[forgeStep]?.target === tgt && styles.forgeTargetLineActive,
                ]}
              />
            ))}
            <Animated.View style={[
              styles.forgeBarFill,
              {
                height: leftBarHeight,
                backgroundColor: leftActive
                  ? leftBarColor
                  : leftBarAnim.interpolate({ inputRange: [0, FORGE_MAX], outputRange: ['#1a0030', '#3a0060'], extrapolate: 'clamp' }),
                shadowColor: '#B026FF',
                shadowOpacity: leftActive ? forgeBarPulse.interpolate({ inputRange: [1, 1.4], outputRange: [0.6, 1] }) : 0.2,
                shadowRadius:  leftActive ? forgeBarPulse.interpolate({ inputRange: [1, 1.4], outputRange: [10, 24] }) : 4,
              },
            ]} />
          </View>
          <View style={[styles.forgeHoldBtn, leftActive && styles.forgeHoldBtnActive]}>
            <Text style={[styles.forgeHoldBtnText, leftActive && styles.forgeHoldBtnTextActive]}>
              {leftActive ? 'HOLD' : leftDone >= leftTargets.length ? '✓' : '—'}
            </Text>
          </View>
        </View>

        {/* ── Centre ── */}
        <View style={styles.forgeCentre}>
          {/* Step dots */}
          <View style={styles.forgeStepDots}>
            {FORGE_SEQUENCE.map((s, i) => (
              <View
                key={i}
                style={[
                  styles.forgeStepDot,
                  i < forgeStep  && styles.forgeStepDotDone,
                  i === forgeStep && styles.forgeStepDotActive,
                ]}
              />
            ))}
          </View>

          <Text style={styles.forgeTitle}>STATIC FORGE</Text>

          <Animated.View style={[styles.forgeShardsRing, { transform: [{ rotate: isMerging ? shardMergeSpin : '0deg' }, { scale: isMerging ? shardPulseAnim : breathAnim }], opacity: shardVisibilityAnim }]}>
            {shards >= 1 && <Image source={require('../assets/images/shard-1.png')} style={[styles.forgeShard, { top: -70, left: -18 }]} />}
            {shards >= 2 && <Image source={require('../assets/images/shard-2.png')} style={[styles.forgeShard, { bottom: -70, left: -18 }]} />}
            {shards >= 3 && <Image source={require('../assets/images/shard-3.png')} style={[styles.forgeShard, { top: -18, left: -80 }]} />}
            {shards >= 4 && <Image source={require('../assets/images/shard-4.png')} style={[styles.forgeShard, { top: -18, right: -80 }]} />}
          </Animated.View>

          {/* Green flash on each target hit */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#39FF14', opacity: targetHitAnim, zIndex: 10 }]} />

          <Animated.View style={[styles.whiteLight, { opacity: whiteLightAnim, transform: [{ scale: whiteLightAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3] }) }] }]} pointerEvents="none" />
          {isSuccess && (<Animated.Image source={require('../assets/images/forged-core.png')} style={[styles.epicCoreForge, { opacity: coreFade, transform: [{ scale: coreScale }] }]} />)}

          {!isSuccess && !isMerging && (
            <Animated.View style={[styles.forgeBtnWrapper, { opacity: forgeReady ? forgeBtnAnim : 0.15 }]}>
              <Pressable onPress={() => { playBtn(); handleForgeTap(); }} disabled={!forgeReady} style={[styles.forgeBtn, forgeReady && styles.forgeBtnReady]}>
                <Text style={[styles.forgeBtnText, forgeReady && styles.forgeBtnTextReady]}>
                  {forgeReady ? '[ FORGE CORE ]' : '[ CHARGE SEQUENCE ]'}
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {isSuccess && (
            <View style={styles.forgeBtnWrapper}>
              {/* The cNFT was already minted as part of the forge tap flow.
                  No badge here — keep the screen clean so the player can screenshot the core. */}
              <Pressable
                onPress={async () => {
                  playBtn();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  epicCoreAnim.setValue(0);
                  setIsMintingRWA(false);
                  setRwaMinted(false);
                  await executePostGameSave();
                  resetGame();
                }}
                style={[styles.forgeBtn, styles.forgeBtnReturn]}
              >
                <Text style={styles.forgeBtnTextReturn}>[ ⏎ RETURN TO BASE ]</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.forgeStatusMsg}>{systemMessage}</Text>
        </View>

        {/* ── Right bar ── */}
        <View
          style={[styles.forgeBarSide, rightActive && styles.forgeBarSideActive]}
          onTouchStart={() => { rightHeldRef.current = true; playBtn(); }}
          onTouchEnd={() => { rightHeldRef.current = false; }}
          onTouchCancel={() => { rightHeldRef.current = false; }}
        >
          <Text style={[styles.forgeBarLabel, rightActive && styles.forgeBarLabelActive]}>
            {rightActive ? 'HOLD ▶' : 'RIGHT'}
          </Text>
          <View style={styles.forgeBarTrack}>
            {rightTargets.map((tgt, i) => (
              <View
                key={i}
                style={[
                  styles.forgeTargetLine,
                  { bottom: `${tgt}%` },
                  i < rightDone && styles.forgeTargetLineDone,
                  rightActive && FORGE_SEQUENCE[forgeStep]?.target === tgt && styles.forgeTargetLineActive,
                ]}
              />
            ))}
            <Animated.View style={[
              styles.forgeBarFill,
              {
                height: rightBarHeight,
                backgroundColor: rightActive
                  ? rightBarColor
                  : rightBarAnim.interpolate({ inputRange: [0, FORGE_MAX], outputRange: ['#1a0030', '#3a0060'], extrapolate: 'clamp' }),
                shadowColor: '#B026FF',
                shadowOpacity: rightActive ? forgeBarPulse.interpolate({ inputRange: [1, 1.4], outputRange: [0.6, 1] }) : 0.2,
                shadowRadius:  rightActive ? forgeBarPulse.interpolate({ inputRange: [1, 1.4], outputRange: [10, 24] }) : 4,
              },
            ]} />
          </View>
          <View style={[styles.forgeHoldBtn, rightActive && styles.forgeHoldBtnActive]}>
            <Text style={[styles.forgeHoldBtnText, rightActive && styles.forgeHoldBtnTextActive]}>
              {rightActive ? 'HOLD' : rightDone >= rightTargets.length ? '✓' : '—'}
            </Text>
          </View>
        </View>

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: whiteLightAnim, zIndex: 200 }]} />
      </View>
    );
  }

  // ── HUNT ARENA ─────────────────────────────────────────────────────────────
  if (isHunting) {
    const { player, enemies, isShielded, bullets, tokens, empCharge, pulses } = physicsRef.current;
    const SIDEBAR_WIDTH = 110;
    return (
      <View
        style={styles.huntContainer}
        onTouchStart={(evt) => {
          // Fire toward touched position. Subtract sidebar width to get arena-local coords.
          const touch = evt.nativeEvent.touches[0];
          if (touch) fireBullet(touch.pageX - SIDEBAR_WIDTH, touch.pageY);
        }}
      >

        {/* Operator sidebar */}
        <View style={styles.rosterSidebar}>
          <Text style={styles.rosterTitle}>OPS</Text>
          {operators.map((op, idx) => {
            // Only show operators that are in the active loadout (default [0,1,2] for backward compat)
            if (!activeLoadoutRef.current.includes(idx)) return null;
            const isActive   = activeOperatorRef.current === idx;
            const isOverheat = overheatRef.current[idx] > 0;
            // Dynamic Ghost lock: Citizens and Hoodie-synced players unlock Ghost regardless of level
            const ghostBypass = idx === 2 && (isSeekerCitizen || isHoodieSynced);
            const isLocked   = !ghostBypass && !unlockedOpsRef.current.includes(idx);
            const heatPct    = heatRef.current[idx] / MAX_HEAT;
            const barColor   = isOverheat ? '#FF0000' : heatPct > 0.7 ? '#FF5E00' : '#39FF14';
            return (
              <Pressable
                key={idx}
                onPress={() => {
                  if (isLocked) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
                  playBtn();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setActiveOperator(idx);
                }}
                style={[styles.rosterCard, isActive && { borderColor: op.color, borderWidth: 2 }, isLocked && styles.rosterCardLocked]}
              >
                <View style={[styles.rosterDot, { backgroundColor: isLocked ? '#222' : isOverheat ? '#FF0000' : op.color, opacity: isActive ? 1 : 0.4 }]} />
                <Text style={[styles.rosterName, isActive && { color: op.color }, isLocked && { color: '#333' }]}>
                  {isLocked ? `LVL ${op.unlockLevel}` : op.name}
                </Text>
                {!isLocked && (
                  <View style={styles.heatBarBg}>
                    <Animated.View style={[styles.heatBarFill, { width: heatAnims[idx].interpolate({ inputRange: [0, MAX_HEAT], outputRange: ['0%', '100%'], extrapolate: 'clamp' }), backgroundColor: barColor }]} />
                  </View>
                )}
                {isLocked
                  ? <Text style={styles.lockedLabel}>🔒</Text>
                  : isOverheat ? <Text style={styles.overheatLabel}>OVERHEAT</Text>
                  : <Text style={styles.heatLabel}>HEAT</Text>
                }
              </Pressable>
            );
          })}

          {/* XP Bar */}
          <View style={styles.xpBox}>
            <View style={styles.xpLabelRow}>
              <Text style={styles.xpLabel}>LVL {playerLevel}</Text>
              {isSeekerCitizen && (
                <View style={styles.seekerBadge}>
                  <Text style={styles.seekerBadgeText}>S</Text>
                </View>
              )}
            </View>
            <View style={styles.xpBarBg}>
              <Animated.View style={[styles.xpBarFill, {
                width: xpBarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
              }]} />
            </View>
            {isSeekerCitizen && (
              <Text style={styles.seekerLabel}>CITIZEN · 1.15× XP</Text>
            )}
          </View>

          {/* Run stats */}
          <View style={styles.runStatsBox}>
            <Text style={styles.runStatLabel}>THIS RUN</Text>
            <Text style={styles.runStatValue}>{runTokens}</Text>
            <Text style={styles.runStatLabel}>TOKENS</Text>
          </View>
        </View>

        {/* Arena */}
        <View style={{ flex: 1, position: 'relative' }}>
          {/* Radar bg */}
          <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]} pointerEvents="none">
            <View style={styles.radarRingLarge} /><View style={styles.radarRingMedium} /><View style={styles.radarRingSmall} />
            <View style={styles.radarCrosshairV} /><View style={styles.radarCrosshairH} />
          </View>

          {/* HUD */}
          <View style={styles.huntHUD} pointerEvents="none">
            <Text style={styles.huntScore}>⬡ {runTokens} TOKENS</Text>
            {/* Health bar */}
            <View style={styles.healthBarRow}>
              {Array.from({ length: MAX_HEALTH }).map((_, i) => (
                <View key={i} style={[styles.healthPip, i < playerHealth ? styles.healthPipFull : styles.healthPipEmpty]} />
              ))}
            </View>
            {extractZone && (
              <View style={styles.extractHUDBox}>
                <Text style={styles.extractHUDText}>ZONE OPEN: {extractSecsLeft}s</Text>
                <View style={styles.extractTimerTrack}>
                  <Animated.View style={[styles.extractTimerFill, { width: extractTimerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
                </View>
              </View>
            )}
          </View>

          {/* Mute toggle — top-right corner of arena, tappable */}
          <Pressable style={styles.muteButtonHunt} onPress={toggleMute}>
            <Text style={styles.muteIcon}>{isMuted ? '🔇' : '🔊'}</Text>
          </Pressable>

          {/* Quit / pause button — sits next to mute */}
          <Pressable
            style={styles.quitButtonHunt}
            onPress={() => {
              playBtn();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              isPausedRef.current = true;
              setIsPaused(true);
            }}
          >
            <Text style={styles.quitButtonHuntText}>QUIT</Text>
          </Pressable>

          {/* Spree text — flashes centre screen */}
          {spreeCount >= 5 && (
            <Animated.Text style={[styles.spreeText, { opacity: spreeAnim, transform: [{ scale: spreeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} pointerEvents="none">
              {spreeLabel}
            </Animated.Text>
          )}

          {/* Special ready prompt */}
          {specialCharge[activeOperatorRef.current] >= 100 && !specialActive && (
            <Animated.Text style={[styles.specialReadyText, { opacity: specialReadyAnim, color: operators[activeOperatorRef.current].color }]} pointerEvents="none">
              ⚡ {operators[activeOperatorRef.current].special} READY!
            </Animated.Text>
          )}

          {/* Hoodie Sync buff banner — shown briefly at start of hunt */}
          <Animated.Text style={[styles.hoodieBuffText, { opacity: hoodieBuffTextAnim }]} pointerEvents="none">
            [ SIGNAL BOOST: HOODIE SYNC ACTIVE ]
          </Animated.Text>

          {/* Extraction zone with capture progress */}
          {extractZone && (
            <Animated.View style={[styles.extractZone, { left: extractZone.x, top: extractZone.y, transform: [{ scale: extractPulseAnim }] }]} pointerEvents="none">
              <Text style={styles.extractZoneText}>EXTRACT</Text>
              <Text style={styles.extractZoneText}>STAND HERE</Text>
              {/* Capture progress bar */}
              <View style={styles.extractCaptureBarBg}>
                <Animated.View style={[styles.extractCaptureBarFill, {
                  width: extractCaptureAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }),
                }]} />
              </View>
            </Animated.View>
          )}

          {tokens.map((t, idx) => (
            <View
              key={`t-${idx}`}
              style={[styles.shadowToken, { left: t.x, top: t.y, opacity: t.opacity ?? 1 }]}
              pointerEvents="none"
            />
          ))}
          {enemies.map((e, idx) => {
            if (e.dead) return null;
            if (e.isBoss) {
              return (
                <View key={idx} style={[styles.huntBoss, { left: e.x, top: e.y }]} pointerEvents="none">
                  <View style={styles.tankHpRow}>
                    {Array.from({ length: BOSS_HP }).map((_, p) => (
                      <View key={p} style={[styles.tankHpPip, p < e.hp && styles.bossHpPipFull]} />
                    ))}
                  </View>
                  <Text style={styles.bossLabel}>APEX</Text>
                </View>
              );
            }
            if (e.isTank) {
              return (
                <View key={idx} style={[styles.huntTank, { left: e.x, top: e.y }]} pointerEvents="none">
                  {/* HP pips */}
                  <View style={styles.tankHpRow}>
                    {Array.from({ length: TANK_HP }).map((_, p) => (
                      <View key={p} style={[styles.tankHpPip, p < e.hp && styles.tankHpPipFull]} />
                    ))}
                  </View>
                </View>
              );
            }
            if (e.isSniper) {
              const flashOn = e.flashFrame < 30;
              return (
                <View
                  key={idx}
                  style={[
                    styles.huntSniper,
                    { left: e.x, top: e.y, borderColor: flashOn ? '#FFFFFF' : '#00BFFF', shadowColor: flashOn ? '#FFFFFF' : '#00BFFF' },
                  ]}
                  pointerEvents="none"
                >
                  <View style={[styles.huntSniperCore, { backgroundColor: flashOn ? '#00BFFF' : '#0066AA' }]} />
                  <View style={[styles.tankHpRow, { marginTop: 4 }]}>
                    {Array.from({ length: SNIPER_HP }).map((_, p) => (
                      <View key={p} style={[styles.tankHpPip, p < e.hp && styles.sniperHpPipFull]} />
                    ))}
                  </View>
                  <Text style={styles.sniperLabel}>WARDEN</Text>
                </View>
              );
            }
            if (e.isSplitter) {
              return <View key={idx} style={[styles.huntSplitter, { left: e.x, top: e.y }]} pointerEvents="none" />;
            }
            if (e.isMiniSplitter) {
              return <View key={idx} style={[styles.huntMiniSplitter, { left: e.x, top: e.y }]} pointerEvents="none" />;
            }
            return <View key={idx} style={[styles.huntEnemy, { left: e.x, top: e.y }]} pointerEvents="none" />;
          })}
          {/* Sniper boss bullets */}
          {(physicsRef.current.sniperBullets || []).map((sb, idx) => (
            <View
              key={`sb-${idx}`}
              style={[styles.sniperBullet, { left: sb.x - SNIPER_BULLET_SIZE / 2, top: sb.y - SNIPER_BULLET_SIZE / 2 }]}
              pointerEvents="none"
            />
          ))}
          {bullets.map((b, idx) => (<View key={`b-${idx}`} style={[styles.plasmaRound, { left: b.x, top: b.y, backgroundColor: b.color, shadowColor: b.color }]} pointerEvents="none" />))}

          {/* Ghost pulse waves — expanding ring */}
          {pulses.map((p, idx) => {
            const progress = p.radius / p.maxRadius;
            return (
              <View
                key={`pulse-${idx}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: p.x - p.radius,
                  top:  p.y - p.radius,
                  width:  p.radius * 2,
                  height: p.radius * 2,
                  borderRadius: p.radius,
                  borderWidth: 4,
                  borderColor: p.color,
                  opacity: 1 - progress * 0.7,
                  shadowColor: p.color,
                  shadowOpacity: 1,
                  shadowRadius: 18,
                }}
              />
            );
          })}

          {/* Explosion particles — central blast + flying shrapnel fragments */}
          {explosionsRef.current.map((ex, idx) => {
            const progress = ex.frame / ex.maxFrame;
            const opacity  = 1 - progress;
            if (ex.isBlast) {
              // Central expanding ball
              const radius = (ex.baseSize || 35) * (0.3 + progress * 0.9);
              return (
                <View key={`ex-${idx}`} pointerEvents="none" style={{
                  position: 'absolute',
                  left: ex.x - radius, top: ex.y - radius,
                  width: radius * 2, height: radius * 2,
                  borderRadius: radius,
                  backgroundColor: ex.color,
                  opacity: opacity * 0.85,
                  shadowColor: ex.color,
                  shadowOpacity: 1,
                  shadowRadius: 14,
                }} />
              );
            }
            // Shrapnel fragment — small square that shrinks slightly as it travels
            const size = (ex.baseSize || 4) * (1 - progress * 0.4);
            return (
              <View key={`ex-${idx}`} pointerEvents="none" style={{
                position: 'absolute',
                left: ex.x - size / 2, top: ex.y - size / 2,
                width: size, height: size,
                backgroundColor: ex.color,
                opacity,
                shadowColor: ex.color,
                shadowOpacity: 1,
                shadowRadius: 4,
                transform: [{ rotate: `${ex.frame * 18}deg` }],
              }} />
            );
          })}

          {/* Player hit flash — red tint over player */}
          <Animated.View pointerEvents="none" style={{
            position: 'absolute',
            left: player.x - 5, top: player.y - 5,
            width: PLAYER_SIZE + 10, height: PLAYER_SIZE + 10,
            borderRadius: (PLAYER_SIZE + 10) / 2,
            backgroundColor: '#FF0000',
            opacity: hitFlashAnim,
          }} />
          <Animated.View
            style={[
              styles.huntPlayerBase,
              {
                left: player.x,
                top: player.y,
                opacity: playerOpacityAnim,
                transform: [{ rotate: `${physicsRef.current.facingAngle}rad` }],
              },
            ]}
            pointerEvents="none"
          >
            {/* Outer triangle via border trick */}
            {/* For Kyokazi (idx 3) the colour cycles black→white. For other ops uses the static op colour. */}
            <Animated.View style={[
              styles.playerTriangle,
              {
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: isShielded
                  ? '#FFFFFF'
                  : activeOperatorRef.current === 3
                    ? kyokaziFlashAnim.interpolate({ inputRange: [0, 1], outputRange: ['#000000', '#FFFFFF'] })
                    : operators[activeOperatorRef.current].color,
                shadowColor: isShielded ? '#FFFFFF' : operators[activeOperatorRef.current].color,
              },
            ]} />
            {/* Inner cutout — dark triangle sitting on top */}
            <View style={styles.playerTriangleCutout} />
          </Animated.View>
          {isShielded && (
            <Animated.View style={[styles.shieldAura, { left: player.x - 15, top: player.y - 15, transform: [{ rotate: shieldRotation }] }]} pointerEvents="none" />
          )}
        </View>

        {/* Joystick */}
        <View style={styles.joystickBase} {...panResponder.panHandlers}>
          <Animated.View style={[styles.joystickKnob, { transform: joystickPan.getTranslateTransform() }]} />
        </View>

        {/* Fire button — bottom right */}
        <Pressable
          style={styles.fireButton}
          onPress={() => {
            // Fire toward current facing direction
            const state = physicsRef.current;
            const pCX = state.player.x + PLAYER_SIZE / 2;
            const pCY = state.player.y + PLAYER_SIZE / 2;
            const angle = state.facingAngle - Math.PI / 2;
            const opIdx = activeOperatorRef.current;
            if (overheatRef.current[opIdx] > 0) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
            const op = operators[opIdx];
            if (opIdx === 2) {
              // GHOST — circular pulse wave
              state.pulses.push({
                x: pCX, y: pCY, radius: 12, maxRadius: 220, speed: 8,
                hitEnemies: new Set(), color: op.color,
              });
            } else if (opIdx === 3) {
              // KYOKAZI — uzi-spread: 7 bullets in a ±45° arc, jittered speed
              const ARC_HALF = Math.PI / 4;
              const NUM = 7;
              for (let i = 0; i < NUM; i++) {
                const t = NUM === 1 ? 0 : (i / (NUM - 1)) - 0.5;
                const a = angle + t * ARC_HALF * 2 + (Math.random() - 0.5) * 0.12;
                const speed = op.bulletSpeed * (0.85 + Math.random() * 0.4);
                state.bullets.push({ x: pCX - 5, y: pCY - 5, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, color: op.color });
              }
            } else if (op.spread) {
              [-0.2, 0, 0.2].forEach(offset => {
                state.bullets.push({ x: pCX - 5, y: pCY - 5, vx: Math.cos(angle + offset) * op.bulletSpeed, vy: Math.sin(angle + offset) * op.bulletSpeed, color: op.color });
              });
            } else {
              state.bullets.push({ x: pCX - 5, y: pCY - 5, vx: Math.cos(angle) * op.bulletSpeed, vy: Math.sin(angle) * op.bulletSpeed, color: op.color });
            }
            const newHeat = Math.min(MAX_HEAT, heatRef.current[opIdx] + HEAT_PER_SHOT[opIdx]);
            heatRef.current[opIdx] = newHeat; heatAnims[opIdx].setValue(newHeat);
            if (newHeat >= MAX_HEAT) { overheatRef.current[opIdx] = OVERHEAT_FRAMES; Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
            else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const sfxRef = opIdx === 1 ? sndHeavyShot : opIdx === 2 ? sndGhostShot : sndFire;
              playSFX(sfxRef);
            }
          }}
          pointerEvents="auto"
        >
          <Text style={[styles.fireButtonText, { color: operators[activeOperatorRef.current].color }]}>FIRE</Text>
        </Pressable>

        {/* Special weapon button — above fire button */}
        <Pressable
          style={[
            styles.specialButton,
            specialCharge[activeOperatorRef.current] >= 100 && !specialActive && styles.specialButtonReady,
            { borderColor: operators[activeOperatorRef.current].color },
          ]}
          onPress={() => { playBtn(); triggerSpecial(); }}
          pointerEvents="auto"
        >
          <View style={styles.specialChargeRing}>
            <Animated.View style={[
              styles.specialChargeFill,
              {
                width: specialChargeAnim[activeOperatorRef.current].interpolate({
                  inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp',
                }),
                backgroundColor: operators[activeOperatorRef.current].color,
              },
            ]} />
          </View>
          <Text style={[
            styles.specialButtonText,
            { color: specialCharge[activeOperatorRef.current] >= 100 ? operators[activeOperatorRef.current].color : '#333' },
          ]}>
            {operators[activeOperatorRef.current].special.split(' ')[0]}
          </Text>
        </Pressable>

        {/* Full-screen damage glitch */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FF0000', opacity: damageFlashAnim, zIndex: 160 }]} />
        {showDamageText && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', zIndex: 161, opacity: damageFlashAnim }]}>
            <Text style={styles.damageText}>DAMAGE</Text>
          </Animated.View>
        )}

        {/* Extraction zone spawn alert */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#39FF14', opacity: zoneAlertAnim, zIndex: 162 }]} />
        {showZoneAlert && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', zIndex: 163, opacity: zoneAlertAnim }]}>
            <Text style={styles.zoneAlertText}>EXTRACTION ZONE</Text>
            <Text style={styles.zoneAlertSub}>ACTIVE!</Text>
          </Animated.View>
        )}

        {/* Extraction capture flash overlay */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#39FF14', opacity: extractFlashAnim, zIndex: 150 }]} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#B026FF', opacity: purpleFlashAnim, zIndex: 200 }]} />

        {/* Next Round flash */}
        {nextRoundVisible && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 600, opacity: nextRoundAnim }]}>
            <Text style={styles.nextRoundText}>NEXT ROUND</Text>
            <Text style={styles.nextRoundSubText}>LET'S HUNT!</Text>
          </Animated.View>
        )}

        {/* Pause / quit modal */}
        {isPaused && (
          <View style={styles.pauseOverlay}>
            <View style={styles.pauseBox}>
              <Text style={styles.pauseTitle}>PAUSED</Text>
              <View style={styles.pauseDivider} />
              <Text style={styles.pauseSub}>Quit back to base or resume your hunt?</Text>
              <View style={styles.pauseButtonRow}>
                <Pressable
                  style={({ pressed }) => [styles.pauseBtn, styles.pauseBtnResume, pressed && { backgroundColor: '#0a3a0a' }]}
                  onPress={() => {
                    playBtn();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    isPausedRef.current = false;
                    setIsPaused(false);
                  }}
                >
                  <Text style={styles.pauseBtnTextResume}>[ ▶ RESUME ]</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.pauseBtn, styles.pauseBtnQuit, pressed && { backgroundColor: '#330000' }]}
                  onPress={async () => {
                    playBtn();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    Vibration.vibrate(150);
                    // Bank any tokens earned this run at full value (no death penalty — they didn't die)
                    const earned = runTokensRef.current;
                    if (earned > 0) {
                      const newTotal = shadowTokensRef.current + earned;
                      setShadowTokens(newTotal);
                      shadowTokensRef.current = newTotal;
                      await AsyncStorage.setItem('@tokens', newTotal.toString());
                      await gainXP(earned * XP_PER_TOKEN);
                    }
                    setRunTokens(0); runTokensRef.current = 0;
                    // Tear down the hunt the same way extractSuccess/quit does
                    cancelAnimationFrame(gameLoopRef.current);
                    if (secondTickRef.current) { clearInterval(secondTickRef.current); secondTickRef.current = null; }
                    if (tornadoTimerRef.current) { clearInterval(tornadoTimerRef.current); tornadoTimerRef.current = null; }
                    if (spreeTimerRef.current) { clearTimeout(spreeTimerRef.current); spreeTimerRef.current = null; }
                    if (physicsRef.current?.shieldTimer) clearTimeout(physicsRef.current.shieldTimer);
                    stopExtractPulse();
                    stopExtractSound();
                    muffleBGM();
                    isPausedRef.current = false;
                    setIsPaused(false);
                    setExtractZone(null);
                    specialActiveRef.current = false;
                    setIsHunting(false); isHuntingRef.current = false;
                    setSystemMessage(
                      earned > 0
                        ? `RETURNED TO BASE. +${earned} TOKENS BANKED.`
                        : (shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY')
                    );
                    setTimeout(() => {
                      setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
                    }, 3500);
                  }}
                >
                  <Text style={styles.pauseBtnTextQuit}>[ ⏎ QUIT TO BASE ]</Text>
                </Pressable>
              </View>
              <Text style={styles.pauseHint}>Quitting banks your run tokens at full value.</Text>
            </View>
          </View>
        )}

        {/* Death screen */}
        {isDead && (
          <Animated.View style={[styles.deathOverlay, { opacity: deathScreenAnim }]}>
            <Text style={styles.deathTitle}>SIGNAL CORRUPTED</Text>
            <Animated.View style={{ transform: [{ translateX: deathGlitchAnim }], alignItems: 'center', marginTop: 12 }}>
              <Text style={styles.deathGlitchLeaked}>— 50% LEAKED —</Text>
              <Text style={styles.deathGlitchRecovery}>RECOVERY: {bankedAmountRef.current} TOKENS</Text>
            </Animated.View>
            <Text style={styles.deathCountdownText}>{deathCountdown}s</Text>
            <Animated.View style={{ transform: [{ scale: deathBtnPulseAnim }] }}>
              <Pressable
                style={styles.huntAgainBtn}
                onPress={() => {
                  playBtn();
                  if (deathTimerRef.current) { clearInterval(deathTimerRef.current); deathTimerRef.current = null; }
                  deathBtnPulseAnim.stopAnimation();
                  deathGlitchAnim.stopAnimation(); deathGlitchAnim.setValue(0);
                  setIsDead(false);
                  deathScreenAnim.setValue(0);
                  startHunt();
                }}
              >
                <Text style={styles.huntAgainText}>HUNT AGAIN</Text>
              </Pressable>
            </Animated.View>
            <Text style={styles.deathReturnText}>or wait to return to base</Text>
          </Animated.View>
        )}

        {/* Extract result overlay */}
        {extractResult && (
          <View style={styles.extractResultOverlay}>
            <Text style={styles.extractResultTitle}>✓ EXTRACTED</Text>
            <Text style={styles.extractResultSub}>SHADOW TOKENS BANKED</Text>
            <Text style={styles.extractResultTokens}>+{extractResult.tokens}</Text>
            <View style={styles.extractResultButtons}>
              {/* Leaderboard sync removed — coming in Season 2.
                  The handleSyncLeaderboard function is still defined for future re-enabling. */}
              <Pressable
                style={styles.extractResultBtn}
                onPress={() => {
                  playBtn();
                  setExtractResult(null);
                  setNextRoundVisible(true);
                  nextRoundAnim.setValue(0);
                  Animated.sequence([
                    Animated.timing(nextRoundAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                    Animated.delay(300),
                    Animated.timing(nextRoundAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                    Animated.timing(nextRoundAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                    Animated.delay(300),
                    Animated.timing(nextRoundAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                  ]).start(() => { setNextRoundVisible(false); startHunt(); });
                }}
              >
                <Text style={styles.extractResultBtnText}>[ RESUME HUNT ]</Text>
              </Pressable>
              <Pressable
                style={[styles.extractResultBtn, styles.extractResultBtnQuit]}
                onPress={() => {
                  playBtn();
                  setExtractResult(null);
                  setIsHunting(false); isHuntingRef.current = false;
                  setSystemMessage(shardsRef.current < 4 ? 'VAULT LOW: HUNT OR BURN TOKENS' : 'SYSTEM READY');
                }}
              >
                <Text style={[styles.extractResultBtnText, { color: '#888' }]}>[ QUIT TO BASE ]</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Operator unlock reward modal */}
        {pendingUnlock !== null && (
          <View style={styles.unlockOverlay}>
            <View style={styles.unlockBox}>
              <Text style={styles.unlockLevel}>LEVEL {operators[pendingUnlock].unlockLevel} REACHED</Text>
              <Text style={[styles.unlockName, { color: operators[pendingUnlock].color }]}>
                {operators[pendingUnlock].name} UNLOCKED
              </Text>
              <View style={[styles.unlockDivider, { backgroundColor: operators[pendingUnlock].color }]} />
              <Text style={styles.unlockSpecialTitle}>SPECIAL: {operators[pendingUnlock].special}</Text>
              <Text style={styles.unlockDesc}>{operators[pendingUnlock].specialDesc}</Text>
              <Pressable
                style={[styles.unlockBtn, { borderColor: operators[pendingUnlock].color }]}
                onPress={() => { playBtn(); confirmUnlock(pendingUnlock); }}
              >
                <Text style={[styles.unlockBtnText, { color: operators[pendingUnlock].color }]}>
                  [ UNLOCK {operators[pendingUnlock].name} ]
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── MAIN SCREEN ────────────────────────────────────────────────────────────
  return (
    <ImageBackground source={require('../assets/images/base-bg.png')} style={styles.container} resizeMode="cover">
      {/* Tinted dark overlay so UI stays readable over the busy background */}
      <View pointerEvents="none" style={styles.bgTint} />

      {/* Mute toggle — top right */}
      <Pressable style={styles.muteButton} onPress={toggleMute}>
        <Text style={styles.muteIcon}>{isMuted ? '🔇' : '🔊'}</Text>
      </Pressable>

      {/* ── VAULT BOX (top center) ── */}
      <Pressable onLongPress={handleDevReset} delayLongPress={2500} style={styles.vaultBox}>
        <View style={styles.vaultCornerTL} />
        <View style={styles.vaultCornerTR} />
        <View style={styles.vaultCornerBL} />
        <View style={styles.vaultCornerBR} />
        <Text style={styles.vaultLabel}>◤ VAULT ◥</Text>
        <View style={styles.vaultRow}>
          <View style={styles.vaultStat}>
            <Text style={styles.vaultStatNum}>{shards}/4</Text>
            <Text style={styles.vaultStatLabel}>⬡ SHARDS</Text>
          </View>
          <View style={styles.vaultDivider} />
          <View style={styles.vaultStat}>
            <Text style={[styles.vaultStatNum, { color: '#B026FF' }]}>{shadowTokens}</Text>
            <Text style={[styles.vaultStatLabel, { color: '#B026FF' }]}>◆ TOKENS</Text>
          </View>
          {walletConnected && (
            <>
              <View style={styles.vaultDivider} />
              <View style={styles.vaultStat}>
                <Text style={[styles.vaultStatNum, { color: '#FFD700', fontSize: 16 }]}>
                  {isSeekerCitizen && skrBalance === 0 ? '—' : skrBalance.toFixed(skrBalance < 10 ? 2 : 0)}
                </Text>
                <Text style={[styles.vaultStatLabel, { color: '#FFD700' }]}>💰 $SKR</Text>
              </View>
            </>
          )}
        </View>
        <Text style={[styles.systemMsg, isLocked && !introActive && styles.systemMsgLocked, isSuccess && styles.systemMsgSuccess]}>
          {systemMessage}
        </Text>
      </Pressable>

      {/* ── LEFT COLUMN: SKULL + MARKET ── */}
      <View style={styles.leftColumn}>
        <Text style={styles.skullLogo}>☠</Text>
        <Pressable
          onPress={() => {
            playBtn();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setComingSoonMsg({ title: 'BLACK MARKET', subtitle: 'COMING SOON' });
          }}
          style={({ pressed }) => [styles.cornerButton, pressed && styles.cornerButtonPressed]}
        >
          <Text style={styles.cornerButtonText}>MARKET</Text>
        </Pressable>
      </View>

      {/* ── RIGHT COLUMN: SCAN PUSHY ARMOR + KYOKAI KEY ── */}
      <View style={styles.rightColumn}>
        <Text style={styles.armorIcon}>📡</Text>
        <Pressable
          onPress={() => {
            playBtn();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setComingSoonMsg({ title: 'PUSHY ARMOR SYNC', subtitle: 'COMING IN ALPHA 1.1' });
          }}
          style={({ pressed }) => [styles.cornerButton, styles.cornerButtonPurple, pressed && styles.cornerButtonPressed]}
        >
          <Text style={[styles.cornerButtonText, { color: '#DDAAFF' }]}>SCAN PUSHY{'\n'}ARMOR</Text>
        </Pressable>

        {/* KYOKAI KEY — cyber-digital key icon + button */}
        <Text style={[styles.keyIcon, hasKyokaiKey && styles.keyIconHolder]}>🔑</Text>
        <Pressable
          onPress={() => { playBtn(); handleCheckKyokaiKey(); }}
          disabled={isCheckingKey}
          style={({ pressed }) => [
            styles.cornerButton, styles.cornerButtonKey,
            pressed && styles.cornerButtonPressed,
            hasKyokaiKey && styles.cornerButtonKeyHolder,
          ]}
        >
          <Text style={[
            styles.cornerButtonText,
            { color: hasKyokaiKey ? '#FFD700' : '#00FFFF' },
          ]}>
            {isCheckingKey ? 'CHECKING...' : hasKyokaiKey ? 'KEY HOLDER' : 'KYOKAI KEY'}
          </Text>
        </Pressable>
      </View>

      {/* ── CENTER: SHARD DISPLAY + ENTER TRENCHES BUTTON ── */}
      <View style={styles.centerColumn}>
        <Animated.View style={[styles.centerStage, { transform: [{ scale: breathAnim }, { translateX: shakeAnim }] }]}>
          <Animated.View style={{ opacity: shardVisibilityAnim, justifyContent: 'center', alignItems: 'center' }}>
            {shards >= 1 && <Image source={require('../assets/images/shard-1.png')} style={styles.mainShard} />}
          </Animated.View>
          <Animated.Text style={[styles.staticForgeText, { opacity: introTextOpacity }]}>STATIC{'\n'}FORGE</Animated.Text>
        </Animated.View>

        {/* Primary action — ENTER TRENCHES */}
        <View style={styles.buttonWrapper}>
          <Animated.View style={[styles.buttonGlow, { opacity: buttonFlashAnim }]} />
          <Pressable
            onPress={() => {
              if (isLocked || introActive || isScanning) return;
              playBtn();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (shardsRef.current < 4) {
                // Open operator-select before the briefing
                // Pre-fill pending loadout from current active so the user sees their current pick
                setPendingLoadout([...activeLoadoutRef.current]);
                setShowOperatorSelect(true);
              } else {
                setBriefing('FORGE');
              }
            }}
            style={({ pressed }) => [styles.sensorButton, pressed && !isLocked && styles.sensorButtonPressed, isLocked && !introActive && styles.sensorButtonLocked, isSuccess && styles.sensorButtonSuccess]}
          >
            <Text style={[styles.sensorText, isSuccess && { color: '#000000', fontWeight: 'bold' }]}>
              {introActive ? '[ INITIALIZING... ]' : shards >= 4 ? '[ ENTER FORGE ]' : '[ ENTER TRENCHES ]'}
            </Text>
          </Pressable>
        </View>

        {/* Secondary buttons stack */}
        <View style={styles.secondaryStack}>
          {!introActive && !isSuccess && shards < 4 && shadowTokens >= BURN_COST && (
            <Pressable onPress={() => { playBtn(); handleBurnTokens(); }} style={({ pressed }) => [styles.burnButton, pressed && styles.burnButtonPressed]}>
              <Text style={styles.burnText}>[ 🔥 BURN {BURN_COST} → +1 SHARD ]</Text>
            </Pressable>
          )}

          {!introActive && !isSuccess && shards < 4 && shadowTokens < BURN_COST && (
            <View style={styles.burnButtonDim}>
              <Text style={styles.burnTextDim}>[ BURN {BURN_COST} → SHARD ] ({shadowTokens}/{BURN_COST})</Text>
            </View>
          )}

          {!introActive && !isSuccess && shards < 4 && (
            <Pressable
              onPress={async () => {
                playBtn();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Vibration.vibrate([0, 50, 30, 50]);
                setShardsBoth(4);
                await AsyncStorage.setItem('@shards', '4');
                setSystemMessage('DEMO: VAULT LOADED. ENTER THE FORGE.');
                Animated.timing(shardVisibilityAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start();
                setTimeout(() => setSystemMessage('SYSTEM READY'), 2000);
              }}
              style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
            >
              <Text style={styles.demoText}>[ ⚡ DEMO: LOAD 4 SHARDS ]</Text>
            </Pressable>
          )}

          {/* Wallet connect */}
          {!introActive && (
            <View style={styles.walletRow}>
              <Pressable
                onPress={() => { playBtn(); handleWalletConnect(); }}
                disabled={walletConnected}
                style={({ pressed }) => [
                  styles.walletButton,
                  walletConnected && styles.walletButtonRow,
                  pressed && !walletConnected && styles.walletButtonPressed,
                  walletConnected && styles.walletButtonConnected,
                  isSeekerCitizen && styles.walletButtonCitizen,
                ]}
              >
                <Text style={[
                  styles.walletText,
                  walletConnected && styles.walletTextConnected,
                  isSeekerCitizen && styles.walletTextCitizen,
                ]}>
                  {isConnectingWallet
                    ? '[ AUTHORIZING... ]'
                    : walletConnected
                      ? `[ 🟢 ${walletLabel || 'CONNECTED'}${isSeekerCitizen ? ' ⬢' : ''} ]`
                      : '[ 🔗 CONNECT WALLET ]'}
                </Text>
              </Pressable>
              {walletConnected && (
                <Pressable
                  onPress={() => { playBtn(); handleWalletDisconnect(); }}
                  style={({ pressed }) => [styles.disconnectButton, pressed && styles.disconnectButtonPressed]}
                >
                  <Text style={styles.disconnectText}>⏻</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Operator Select — shown after tapping Enter Trenches, before briefing */}
      {showOperatorSelect && (() => {
        // Determine which operators are accessible
        const accessibleIndices = operators.map((op, idx) => {
          const ghostBypass = idx === 2 && (isSeekerCitizen || isHoodieSynced);
          const keyHolder   = idx === 3 && hasKyokaiKey;
          const levelOk     = playerLevel >= op.unlockLevel;
          return (ghostBypass || keyHolder || levelOk) ? idx : -1;
        }).filter(i => i >= 0);

        const needsPick3 = accessibleIndices.length > 3;
        // pendingLoadout starts empty — user builds it up one tap at a time
        const selected = pendingLoadout;

        return (
          <View style={styles.opSelectOverlay}>
            <Text style={styles.opSelectTitle}>{needsPick3 ? 'BUILD YOUR LOADOUT' : 'SELECT OPERATOR'}</Text>
            <Text style={styles.opSelectSubtitle}>
              {needsPick3 ? `PICK 3 OPERATORS  ·  ${selected.length}/3 SELECTED` : 'CHOOSE YOUR LOADOUT'}
            </Text>

            <View style={styles.opSelectRow}>
              {operators.map((op, idx) => {
                const ghostBypass = idx === 2 && (isSeekerCitizen || isHoodieSynced);
                const keyHolder   = idx === 3 && hasKyokaiKey;
                const unlocked = ghostBypass || keyHolder || playerLevel >= op.unlockLevel;
                const isSelected = needsPick3 && selected.includes(idx);
                const lockLabel = idx === 3 ? 'KEY HOLDER ONLY' : `UNLOCK AT LVL ${op.unlockLevel}`;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => {
                      if (!unlocked) {
                        playBtn();
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        return;
                      }
                      playBtn();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (needsPick3) {
                        // Toggle this operator in the staged loadout
                        if (selected.includes(idx)) {
                          setPendingLoadout(selected.filter(i => i !== idx));
                        } else if (selected.length < 3) {
                          setPendingLoadout([...selected, idx]);
                        }
                      } else {
                        // Old single-select flow
                        setActiveOperator(idx);
                        activeOperatorRef.current = idx;
                        setShowOperatorSelect(false);
                        setBriefing('HUNT');
                      }
                    }}
                    style={({ pressed }) => [
                      styles.opCard,
                      { borderColor: unlocked ? op.color : '#333' },
                      unlocked && pressed && { backgroundColor: 'rgba(40,40,50,0.95)' },
                      !unlocked && styles.opCardLocked,
                      ((needsPick3 && isSelected) || (!needsPick3 && activeOperator === idx)) && unlocked && { borderWidth: 3, shadowColor: op.color, shadowOpacity: 1, shadowRadius: 24 },
                    ]}
                  >
                    <View style={styles.opCardPortraitWrap}>
                      <Image
                        source={op.portrait}
                        style={[
                          styles.opCardPortrait,
                          !unlocked && { opacity: 0.25, tintColor: '#444' },
                        ]}
                      />
                      {!unlocked && (
                        <View style={styles.opCardLockBadge}>
                          <Text style={styles.opCardLockIcon}>{idx === 3 ? '⌬' : '🔒'}</Text>
                        </View>
                      )}
                      {needsPick3 && isSelected && (
                        <View style={[styles.opCardLockBadge, { backgroundColor: 'rgba(255,215,0,0.95)', borderColor: '#FFD700' }]}>
                          <Text style={[styles.opCardLockIcon, { fontSize: 16 }]}>{selected.indexOf(idx) + 1}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.opCardName, { color: unlocked ? op.color : '#555' }]}>
                      {op.name}
                    </Text>
                    {unlocked ? (
                      <>
                        <Text style={[styles.opCardSpecial, { color: unlocked ? op.color : '#555' }]}>
                          {op.special}
                        </Text>
                        {!needsPick3 && activeOperator === idx && (
                          <Text style={[styles.opCardSelected, { color: op.color }]}>◆ SELECTED</Text>
                        )}
                        {needsPick3 && isSelected && (
                          <Text style={[styles.opCardSelected, { color: op.color }]}>◆ SLOT {selected.indexOf(idx) + 1}</Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.opCardLockText}>{lockLabel}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.opSelectFooter}>
              {needsPick3 && (
                <Pressable
                  disabled={selected.length !== 3}
                  onPress={() => {
                    playBtn();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    activeLoadoutRef.current = selected;
                    setActiveLoadout(selected);
                    AsyncStorage.setItem('@active_loadout', JSON.stringify(selected)).catch(() => {});
                    // Default active to the first slot
                    setActiveOperator(selected[0]);
                    activeOperatorRef.current = selected[0];
                    setShowOperatorSelect(false);
                    setPendingLoadout([]);
                    setBriefing('HUNT');
                  }}
                  style={({ pressed }) => [
                    styles.deployBtn,
                    selected.length !== 3 && styles.deployBtnDisabled,
                    pressed && selected.length === 3 && styles.deployBtnPressed,
                  ]}
                >
                  <Text style={[styles.deployBtnText, selected.length !== 3 && { color: '#444' }]}>
                    [ ⚡ DEPLOY LOADOUT ]
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { playBtn(); setShowOperatorSelect(false); setPendingLoadout([]); }}
                style={({ pressed }) => [styles.opSelectBack, pressed && { backgroundColor: 'rgba(50,50,50,0.9)' }]}
              >
                <Text style={styles.opSelectBackText}>[ ⏎ BACK ]</Text>
              </Pressable>
              <Text style={styles.opSelectHint}>
                {needsPick3 ? 'Tap to add/remove. Tap DEPLOY when 3 are chosen.' : 'Tap an unlocked operator to deploy'}
              </Text>
            </View>
          </View>
        );
      })()}

      {/* Briefing overlays */}
      {briefing && (
        <Pressable style={styles.briefingOverlay} onPress={() => {
          playBtn();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (briefing === 'HUNT')       { setBriefing(null); startHunt(); }
          else if (briefing === 'FORGE') { setBriefing(null); enterForge(); }
        }}>
          <View style={styles.briefingContent}>
            {briefing === 'HUNT' && (<>
              <Text style={styles.briefingText}>{'>'} ENDLESS TRENCHES ENGAGED.</Text>
              <Text style={styles.briefingText}>{'>'} COLLECT TOKENS. THE LONGER YOU STAY, THE MORE YOU EARN.</Text>
              <Text style={styles.briefingText}>{'>'} WHEN THE GREEN ZONE SPAWNS — RUN TO BANK YOUR LOOT.</Text>
              <Text style={styles.briefingText}>{'>'} DIE BEFORE EXTRACTING AND LOSE 50% OF YOUR RUN TOKENS.</Text>
            </>)}
            {briefing === 'FORGE' && (<>
              <Text style={styles.briefingText}>{'>'} 4 SHARDS DETECTED. CORE AT CAPACITY.</Text>
              <Text style={styles.briefingText}>{'>'} HOLD BOTH SIDE BARS SIMULTANEOUSLY TO CHARGE.</Text>
              <Text style={styles.briefingText}>{'>'} WHEN BOTH BARS FILL — TAP FORGE CORE TO MERGE.</Text>
            </>)}
            <Animated.Text style={[styles.briefingAction, { opacity: buttonFlashAnim }]}>{'>'} [ TAP ANYWHERE TO BEGIN ]</Animated.Text>
          </View>
        </Pressable>
      )}

      {/* Coming Soon modal */}
      {comingSoonMsg && (
        <Pressable style={styles.comingSoonOverlay} onPress={() => { playBtn(); setComingSoonMsg(null); }}>
          <View style={styles.comingSoonBox}>
            <Text style={styles.comingSoonTitle}>{comingSoonMsg.title}</Text>
            <View style={styles.comingSoonDivider} />
            <Text style={styles.comingSoonSubtitle}>{comingSoonMsg.subtitle}</Text>
            <Text style={styles.comingSoonHint}>tap anywhere to dismiss</Text>
          </View>
        </Pressable>
      )}

      {/* Kyokai Key wallet picker — choose how to scan */}
      {showKeyPicker && (
        <Pressable style={styles.comingSoonOverlay} onPress={() => { playBtn(); setShowKeyPicker(false); setPasteAddress(''); }}>
          <Pressable style={styles.keyPickerBox} onPress={(e) => e.stopPropagation && e.stopPropagation()}>
            <Text style={styles.keyPickerTitle}>SCAN FOR KYOKAI KEY</Text>
            <View style={styles.comingSoonDivider} />
            <Text style={styles.keyPickerHint}>
              Some wallets index NFT collections differently.{'\n'}
              Pick the wallet you minted/received the key in.
            </Text>

            {/* Option 1: scan currently connected wallet */}
            {walletConnected && (
              <Pressable
                onPress={() => {
                  playBtn();
                  setShowKeyPicker(false);
                  runKyokaiKeyCheck(walletAddress, walletLabel || 'CONNECTED WALLET');
                }}
                style={({ pressed }) => [styles.keyPickerOption, pressed && styles.keyPickerOptionPressed]}
              >
                <Text style={styles.keyPickerOptionTitle}>⬢ SCAN CONNECTED WALLET</Text>
                <Text style={styles.keyPickerOptionSub}>{walletLabel || truncateAddr(walletAddress)}</Text>
              </Pressable>
            )}

            {/* Option 2: open a fresh MWA session — user picks any wallet */}
            <Pressable
              onPress={() => { playBtn(); checkViaFreshWalletSession(); }}
              style={({ pressed }) => [styles.keyPickerOption, pressed && styles.keyPickerOptionPressed]}
            >
              <Text style={styles.keyPickerOptionTitle}>↻ CHOOSE A DIFFERENT WALLET</Text>
              <Text style={styles.keyPickerOptionSub}>Phantom, Solflare, Seed Vault, etc.</Text>
            </Pressable>

            {/* Option 3: paste an address */}
            <View style={styles.keyPickerOption}>
              <Text style={styles.keyPickerOptionTitle}>⌨ PASTE WALLET ADDRESS</Text>
              <Text style={styles.keyPickerOptionSub}>Scan any wallet you own</Text>
              <TextInput
                value={pasteAddress}
                onChangeText={setPasteAddress}
                placeholder="Paste base58 address..."
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.keyPickerInput}
              />
              <Pressable
                disabled={pasteAddress.trim().length < 32}
                onPress={() => {
                  playBtn();
                  const addr = pasteAddress.trim();
                  setShowKeyPicker(false);
                  setPasteAddress('');
                  runKyokaiKeyCheck(addr, truncateAddr(addr));
                }}
                style={({ pressed }) => [
                  styles.keyPickerScanBtn,
                  pasteAddress.trim().length < 32 && styles.keyPickerScanBtnDisabled,
                  pressed && pasteAddress.trim().length >= 32 && styles.keyPickerScanBtnPressed,
                ]}
              >
                <Text style={[
                  styles.keyPickerScanBtnText,
                  pasteAddress.trim().length < 32 && { color: '#444' },
                ]}>
                  [ SCAN THIS ADDRESS ]
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => { playBtn(); setShowKeyPicker(false); setPasteAddress(''); }}
              style={({ pressed }) => [styles.opSelectBack, pressed && { backgroundColor: 'rgba(50,50,50,0.9)' }, { marginTop: 16 }]}
            >
              <Text style={styles.opSelectBackText}>[ ⏎ CANCEL ]</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* Kyokai Key result modal */}
      {keyResult && (
        <Pressable style={styles.comingSoonOverlay} onPress={() => { playBtn(); setKeyResult(null); }}>
          <View style={[
            styles.comingSoonBox,
            keyResult.success ? styles.keyResultBoxSuccess : styles.keyResultBoxFail,
          ]}>
            <Text style={[styles.comingSoonTitle, { color: keyResult.success ? '#FFD700' : '#FF3333' }]}>
              {keyResult.success ? '⌬ KEY DETECTED' : '◌ NO KEY'}
            </Text>
            <View style={[styles.comingSoonDivider, { backgroundColor: keyResult.success ? '#FFD700' : '#FF3333' }]} />
            <Text style={[styles.comingSoonSubtitle, { color: keyResult.success ? '#FFD700' : '#FF6666' }]}>
              {keyResult.message}
            </Text>
            {keyResult.success && (
              <Text style={styles.keyResultUnlock}>KYOKAZI UNLOCKED</Text>
            )}
            <Text style={styles.comingSoonHint}>tap anywhere to dismiss</Text>
          </View>
        </Pressable>
      )}

      {isScanning && (
        <View style={styles.scanOverlay}>
          <Animated.View style={[styles.scanRadar, { transform: [{ scale: radarScale }], opacity: radarOpacity }]} />
          <View style={styles.scanCenterDot} />
          <Text style={styles.scanTitleText}>AWAITING NFC SIGNATURE</Text>
          <Text style={styles.scanSubText}>HOLD DEVICE NEAR GARMENT TAG</Text>
        </View>
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#B026FF', opacity: purpleFlashAnim, zIndex: 200 }]} />
    </ImageBackground>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────────
const mainStyles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#050505' },
  bgTint:              { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,15,0.55)' },
  particle:            { position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 50, shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10 },

  // VAULT BOX — top center
  vaultBox:            {
    position: 'absolute', top: 12, alignSelf: 'center',
    paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 2, borderColor: '#39FF14',
    backgroundColor: 'rgba(5,15,5,0.85)',
    shadowColor: '#39FF14', shadowOpacity: 0.6, shadowRadius: 18,
    alignItems: 'center', zIndex: 10,
  },
  vaultCornerTL:       { position: 'absolute', top: -3, left: -3, width: 12, height: 12, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#FFD700' },
  vaultCornerTR:       { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#FFD700' },
  vaultCornerBL:       { position: 'absolute', bottom: -3, left: -3, width: 12, height: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#FFD700' },
  vaultCornerBR:       { position: 'absolute', bottom: -3, right: -3, width: 12, height: 12, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#FFD700' },
  vaultLabel:          { color: '#FFD700', fontFamily: 'monospace', fontSize: 10, fontWeight: '900', letterSpacing: 6, marginBottom: 4 },
  vaultRow:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  vaultStat:           { alignItems: 'center', minWidth: 60 },
  vaultStatNum:        { color: '#39FF14', fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 2, textShadowColor: '#39FF14', textShadowRadius: 10 },
  vaultStatLabel:      { color: '#39FF14', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginTop: 1, opacity: 0.8 },
  vaultDivider:        { width: 1, height: 30, backgroundColor: '#444' },

  // LEFT COLUMN — skull + market
  leftColumn:          { position: 'absolute', left: 16, top: '40%', alignItems: 'center', zIndex: 10 },
  skullLogo:           { color: '#FFFFFF', fontSize: 44, textShadowColor: '#FFFFFF', textShadowRadius: 12, marginBottom: 6 },
  cornerButton:        {
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#FFFFFF',
    backgroundColor: 'rgba(10,10,15,0.85)',
    minWidth: 90, alignItems: 'center',
  },
  cornerButtonPurple:  { borderColor: '#B026FF', shadowColor: '#B026FF', shadowOpacity: 0.5, shadowRadius: 8 },
  cornerButtonKey:     { borderColor: '#00FFFF', shadowColor: '#00FFFF', shadowOpacity: 0.5, shadowRadius: 8, marginTop: 12 },
  cornerButtonKeyHolder: { borderColor: '#FFD700', shadowColor: '#FFD700', shadowOpacity: 0.8, shadowRadius: 12, backgroundColor: 'rgba(20,15,0,0.85)' },
  keyIcon:             { fontSize: 28, marginTop: 10, marginBottom: 4, color: '#00FFFF', textShadowColor: '#00FFFF', textShadowRadius: 14 },
  keyIconHolder:       { color: '#FFD700', textShadowColor: '#FFD700', textShadowRadius: 18 },
  keyResultBoxSuccess: { borderColor: '#FFD700', backgroundColor: 'rgba(40,30,0,0.95)', shadowColor: '#FFD700' },
  keyResultBoxFail:    { borderColor: '#FF3333', backgroundColor: 'rgba(40,0,0,0.95)', shadowColor: '#FF3333' },
  keyResultUnlock:     { color: '#00FFFF', fontFamily: 'monospace', fontSize: 12, fontWeight: '900', letterSpacing: 4, marginTop: 12, textShadowColor: '#00FFFF', textShadowRadius: 10 },

  // Wallet picker modal — choose which wallet to scan for the Kyokai Key
  keyPickerBox:        { paddingHorizontal: 28, paddingVertical: 22, borderWidth: 2, borderColor: '#00FFFF', backgroundColor: 'rgba(0,15,25,0.97)', shadowColor: '#00FFFF', shadowOpacity: 0.7, shadowRadius: 24, alignItems: 'stretch', minWidth: 380, maxWidth: 480 },
  keyPickerTitle:      { color: '#00FFFF', fontFamily: 'monospace', fontSize: 18, fontWeight: '900', letterSpacing: 5, textAlign: 'center', textShadowColor: '#00FFFF', textShadowRadius: 12 },
  keyPickerHint:       { color: '#888', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, lineHeight: 16, textAlign: 'center', marginBottom: 14 },
  keyPickerOption:     { borderWidth: 1, borderColor: '#00FFFF', borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: 'rgba(0,30,50,0.6)' },
  keyPickerOptionPressed: { backgroundColor: 'rgba(0,80,120,0.7)' },
  keyPickerOptionTitle:{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
  keyPickerOptionSub:  { color: '#888', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 },
  keyPickerInput:      { marginTop: 8, padding: 8, borderWidth: 1, borderColor: '#00FFFF', borderRadius: 4, color: '#FFFFFF', fontFamily: 'monospace', fontSize: 11, backgroundColor: 'rgba(0,5,10,0.8)' },
  keyPickerScanBtn:    { marginTop: 8, padding: 9, borderWidth: 1, borderColor: '#00FFFF', borderRadius: 6, backgroundColor: 'rgba(0,40,60,0.7)', alignItems: 'center' },
  keyPickerScanBtnPressed: { backgroundColor: 'rgba(0,80,120,0.8)' },
  keyPickerScanBtnDisabled: { borderColor: '#333', backgroundColor: 'rgba(15,15,15,0.7)' },
  keyPickerScanBtnText:{ color: '#00FFFF', fontFamily: 'monospace', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  deployBtn:           { paddingVertical: 14, paddingHorizontal: 36, borderWidth: 2, borderColor: '#FFD700', borderRadius: 8, backgroundColor: 'rgba(40,30,0,0.95)', shadowColor: '#FFD700', shadowOpacity: 0.8, shadowRadius: 16, marginBottom: 8 },
  deployBtnPressed:    { backgroundColor: 'rgba(80,60,0,0.95)' },
  deployBtnDisabled:   { borderColor: '#333', backgroundColor: 'rgba(20,20,20,0.85)', shadowOpacity: 0 },
  deployBtnText:       { color: '#FFD700', fontFamily: 'monospace', fontSize: 14, fontWeight: '900', letterSpacing: 4, textShadowColor: '#FFD700', textShadowRadius: 8 },
  cornerButtonPressed: { backgroundColor: 'rgba(40,40,50,0.9)' },
  cornerButtonText:    { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 11, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },

  // RIGHT COLUMN — armor scan
  rightColumn:         { position: 'absolute', right: 16, top: '22%', alignItems: 'center', zIndex: 10 },
  armorIcon:           { fontSize: 28, marginBottom: 4 },

  // CENTER COLUMN
  centerColumn:        { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 90, paddingBottom: 16, gap: 16 },
  centerStage:         { width: 140, height: 120, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  mainShard:           { width: 70, height: 100, resizeMode: 'contain' },
  staticForgeText:     { position: 'absolute', zIndex: 20, color: '#FFFFFF', fontFamily: 'monospace', fontSize: 16, fontWeight: '900', textAlign: 'center', letterSpacing: 4, textShadowColor: '#39FF14', textShadowRadius: 15 },
  secondaryStack:      { alignItems: 'center', gap: 8, zIndex: 10 },

  // System message (now inside vault box)
  systemMsg:           { color: '#FF5E00', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, textAlign: 'center', paddingHorizontal: 20, marginTop: 6 },
  systemMsgLocked:     { color: '#FF0000' },
  systemMsgSuccess:    { color: '#39FF14', fontSize: 11, fontWeight: 'bold', textShadowColor: '#39FF14', textShadowRadius: 10 },

  // Primary trenches button — bigger & bolder
  buttonWrapper:       { position: 'relative' },
  buttonGlow:          { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, backgroundColor: '#39FF14', borderRadius: 10, shadowColor: '#39FF14', shadowOpacity: 0.8, shadowRadius: 15 },
  sensorButton:        { paddingVertical: 16, paddingHorizontal: 20, borderWidth: 2, borderColor: '#39FF14', borderRadius: 6, backgroundColor: 'rgba(0,30,5,0.9)', width: 300, alignItems: 'center', shadowColor: '#39FF14', shadowOpacity: 0.6, shadowRadius: 14 },
  sensorButtonPressed: { backgroundColor: 'rgba(20,60,20,0.9)', borderColor: '#FFFFFF' },
  sensorButtonLocked:  { opacity: 0.5 },
  sensorButtonSuccess: { backgroundColor: '#39FF14', borderColor: '#39FF14' },
  sensorText:          { color: '#39FF14', fontFamily: 'monospace', fontSize: 14, letterSpacing: 4, fontWeight: '900', textShadowColor: '#39FF14', textShadowRadius: 8 },

  // Burn / demo / wallet (kept compact)
  burnButton:          { padding: 9, borderWidth: 1, borderColor: '#FF5E00', borderRadius: 6, backgroundColor: 'rgba(26,8,0,0.9)', width: 280, alignItems: 'center', shadowColor: '#FF5E00', shadowOpacity: 0.5, shadowRadius: 10 },
  burnButtonPressed:   { backgroundColor: 'rgba(42,16,0,0.9)', borderColor: '#FFFFFF' },
  burnButtonDim:       { padding: 9, borderWidth: 1, borderColor: '#333', borderRadius: 6, backgroundColor: 'rgba(5,5,5,0.85)', width: 280, alignItems: 'center', opacity: 0.5 },
  burnText:            { color: '#FF5E00', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, fontWeight: 'bold' },
  burnTextDim:         { color: '#555', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 },
  demoButton:          { padding: 11, borderWidth: 2, borderColor: '#FFFF00', borderStyle: 'dashed', borderRadius: 8, backgroundColor: '#1a1a00', width: 280, alignItems: 'center', shadowColor: '#FFFF00', shadowOpacity: 0.4, shadowRadius: 8 },
  demoButtonPressed:   { backgroundColor: '#2a2a00', borderColor: '#FFFFFF' },
  demoText:            { color: '#FFFF00', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, fontWeight: 'bold' },
  nfcButton:           { padding: 10, borderWidth: 1, borderColor: '#B026FF', borderRadius: 8, backgroundColor: '#110022', width: 280, alignItems: 'center', shadowColor: '#B026FF', shadowOpacity: 0.5, shadowRadius: 10 },
  nfcButtonPressed:    { backgroundColor: '#220044', borderColor: '#FFFFFF' },
  nfcText:             { color: '#DDAAFF', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, fontWeight: 'bold' },
  hoodieButtonWrap:    { borderRadius: 8 },
  hoodieButtonSynced:  { borderColor: '#FFD700', backgroundColor: '#1a1400' },
  hoodieTextSynced:    { color: '#FFD700' },
  walletConnectedButton: {}, walletConnectedText: {},
  walletRow:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletButton:        { padding: 11, borderWidth: 1, borderColor: '#00FFFF', borderRadius: 8, backgroundColor: '#001a1a', width: 280, alignItems: 'center', shadowColor: '#00FFFF', shadowOpacity: 0.4, shadowRadius: 8 },
  walletButtonRow:     { width: 232 },
  walletButtonPressed: { backgroundColor: '#003333', borderColor: '#FFFFFF' },
  walletButtonConnected: { borderColor: '#39FF14', backgroundColor: '#001a00', shadowColor: '#39FF14', shadowOpacity: 0.6 },
  walletButtonCitizen: { borderColor: '#FFD700', backgroundColor: '#1a1400', shadowColor: '#FFD700', shadowOpacity: 0.7, shadowRadius: 12 },
  walletText:          { color: '#00FFFF', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, fontWeight: 'bold' },
  walletTextConnected: { color: '#39FF14' },
  walletTextCitizen:   { color: '#FFD700' },
  disconnectButton:    { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#FF3333', backgroundColor: '#1a0000', justifyContent: 'center', alignItems: 'center', shadowColor: '#FF3333', shadowOpacity: 0.5, shadowRadius: 6 },
  disconnectButtonPressed: { backgroundColor: '#330000', borderColor: '#FF6666' },
  disconnectText:      { color: '#FF3333', fontFamily: 'monospace', fontSize: 16, fontWeight: '900', textShadowColor: '#FF3333', textShadowRadius: 6 },
  scanOverlay:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  scanRadar:           { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#B026FF' },
  scanCenterDot:       { width: 20, height: 20, borderRadius: 10, backgroundColor: '#B026FF', shadowColor: '#B026FF', shadowOpacity: 1, shadowRadius: 20 },
  scanTitleText:       { color: '#B026FF', fontFamily: 'monospace', fontSize: 16, fontWeight: '900', letterSpacing: 2, marginTop: 140 },
  scanSubText:         { color: '#888888', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1, marginTop: 15 },

  // Coming Soon modal
  comingSoonOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 800 },
  comingSoonBox:       {
    paddingHorizontal: 40, paddingVertical: 28,
    borderWidth: 2, borderColor: '#B026FF',
    backgroundColor: 'rgba(20,0,40,0.95)',
    shadowColor: '#B026FF', shadowOpacity: 1, shadowRadius: 30,
    alignItems: 'center', minWidth: 320,
  },
  comingSoonTitle:     { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 6, textShadowColor: '#B026FF', textShadowRadius: 12 },
  comingSoonDivider:   { width: '100%', height: 1, backgroundColor: '#B026FF', marginVertical: 14, opacity: 0.5 },
  comingSoonSubtitle:  { color: '#B026FF', fontFamily: 'monospace', fontSize: 14, fontWeight: '900', letterSpacing: 4, textShadowColor: '#B026FF', textShadowRadius: 10 },
  comingSoonHint:      { color: '#666', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginTop: 16, fontStyle: 'italic' },

  // Operator Select screen
  opSelectOverlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999, elevation: 999, paddingHorizontal: 20, paddingTop: 40 },
  opSelectTitle:       { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 24, fontWeight: '900', letterSpacing: 8, textShadowColor: '#39FF14', textShadowRadius: 14, marginBottom: 4 },
  opSelectSubtitle:    { color: '#888', fontFamily: 'monospace', fontSize: 11, letterSpacing: 4, marginBottom: 22 },
  opSelectRow:         { flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'center' },
  opCard:              {
    width: 150, height: 220,
    borderWidth: 2, borderRadius: 8,
    backgroundColor: 'rgba(8,8,16,0.95)',
    alignItems: 'center', justifyContent: 'flex-start',
    paddingTop: 14, paddingHorizontal: 8,
    shadowOpacity: 0.5, shadowRadius: 12,
  },
  opCardLocked:        { opacity: 0.7 },
  opCardPortraitWrap:  { width: 100, height: 100, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  opCardPortrait:      { width: 100, height: 100, resizeMode: 'contain' },
  opCardLockBadge:     { position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 2, borderColor: '#666', justifyContent: 'center', alignItems: 'center' },
  opCardLockIcon:      { fontSize: 18 },
  opCardName:          { fontFamily: 'monospace', fontSize: 16, fontWeight: '900', letterSpacing: 4, marginTop: 12, textShadowRadius: 8 },
  opCardSpecial:       { fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginTop: 6, opacity: 0.9 },
  opCardSelected:      { fontFamily: 'monospace', fontSize: 9, fontWeight: '900', letterSpacing: 3, marginTop: 8, textShadowRadius: 6 },
  opCardLockText:      { color: '#888', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginTop: 10, textAlign: 'center', fontWeight: '900' },
  opSelectFooter:      { marginTop: 28, alignItems: 'center', gap: 10 },
  opSelectBack:        { paddingHorizontal: 24, paddingVertical: 10, borderWidth: 1, borderColor: '#666', borderRadius: 6, backgroundColor: 'rgba(20,20,20,0.85)' },
  opSelectBackText:    { color: '#AAA', fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 3 },
  opSelectHint:        { color: '#555', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, fontStyle: 'italic' },
  muteButton:          { position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center', zIndex: 900 },
  muteIcon:            { fontSize: 20 },
});

const introStyles = StyleSheet.create({
  introContainer:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  introButtonWrapper:{ position: 'absolute', bottom: '6%', width: 280, alignSelf: 'center' },
  introButtonGlow:   { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, backgroundColor: '#39FF14', borderRadius: 8, shadowColor: '#39FF14', shadowOpacity: 0.8, shadowRadius: 20 },
  introButton:       { padding: 20, borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 8, backgroundColor: '#050505', alignItems: 'center' },
  introButtonText:   { color: '#39FF14', fontFamily: 'monospace', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  introInfoButton:   { marginTop: 12, padding: 14, borderWidth: 1, borderColor: '#666', borderRadius: 8, backgroundColor: 'rgba(5,5,5,0.7)', alignItems: 'center' },
  introInfoButtonText: { color: '#AAA', fontFamily: 'monospace', fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  briefingOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.98)', justifyContent: 'center', alignItems: 'flex-start', padding: 40, zIndex: 300 },
  briefingContent:   { gap: 16 },
  briefingText:      { color: '#39FF14', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', letterSpacing: 1, textShadowColor: '#39FF14', textShadowRadius: 5 },
  briefingAction:    { color: '#00FFFF', fontFamily: 'monospace', fontSize: 14, fontWeight: '900', letterSpacing: 2, marginTop: 24, textShadowColor: '#00FFFF', textShadowRadius: 10 },

  // Tutorial sequence
  tutorialContainer: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  tutorialDots:      { flexDirection: 'row', gap: 10, position: 'absolute', top: 30 },
  tutorialDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  tutorialDotActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', width: 24, borderRadius: 4 },
  tutorialDotDone:   { backgroundColor: '#333', borderColor: '#555' },
  tutorialPanel:     { width: '100%', alignItems: 'center', paddingVertical: 20 },
  tutorialIcon:      { fontSize: 64, marginBottom: 20, textShadowRadius: 20 },
  tutorialTitle:     { fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 4, marginBottom: 16, textShadowRadius: 12 },
  tutorialDivider:   { width: 60, height: 2, borderRadius: 1, marginBottom: 20, opacity: 0.6 },
  tutorialBody:      { color: '#AAAAAA', fontFamily: 'monospace', fontSize: 13, lineHeight: 22, textAlign: 'center', letterSpacing: 0.5 },
  tutorialTap:       { position: 'absolute', bottom: 50, color: '#FFFFFF', fontFamily: 'monospace', fontSize: 13, letterSpacing: 3, opacity: 0.6 },
  tutorialCounter:   { position: 'absolute', bottom: 28, color: '#333', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 },
});

const forgeStyles = StyleSheet.create({
  forgeContainer:      { flex: 1, backgroundColor: '#030008', flexDirection: 'row', alignItems: 'stretch' },
  forgeBarSide:        { width: 90, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 20, paddingTop: 20, backgroundColor: '#06000f', borderColor: '#1a0030', borderWidth: 1 },
  forgeBarSideActive:  { backgroundColor: '#0d0020', borderColor: '#B026FF', borderWidth: 2 },
  forgeBarLabel:       { color: '#444', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, textAlign: 'center', marginBottom: 12 },
  forgeBarLabelActive: { color: '#B026FF', fontWeight: '900', fontSize: 10, textShadowColor: '#B026FF', textShadowRadius: 8 },
  forgeBarTrack:       { width: 28, flex: 1, backgroundColor: '#0d0020', borderRadius: 14, borderWidth: 1, borderColor: '#3a0060', overflow: 'visible', justifyContent: 'flex-end', marginBottom: 12, position: 'relative' },
  forgeBarFill:        { width: '100%', borderRadius: 14 },
  forgeTargetLine:     { position: 'absolute', left: -6, right: -6, height: 2, backgroundColor: '#3a0060', zIndex: 5 },
  forgeTargetLineActive:{ backgroundColor: '#FFFFFF', shadowColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 6 },
  forgeTargetLineDone: { backgroundColor: '#39FF14', shadowColor: '#39FF14', shadowOpacity: 0.8, shadowRadius: 4 },
  forgeHoldBtn:        { width: 70, height: 70, borderRadius: 35, backgroundColor: '#0d0020', borderWidth: 1, borderColor: '#2a0050', justifyContent: 'center', alignItems: 'center' },
  forgeHoldBtnActive:  { backgroundColor: '#1a0030', borderWidth: 2, borderColor: '#B026FF', shadowColor: '#B026FF', shadowOpacity: 0.7, shadowRadius: 14 },
  forgeHoldBtnText:    { color: '#333', fontFamily: 'monospace', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  forgeHoldBtnTextActive: { color: '#FFFFFF', textShadowColor: '#B026FF', textShadowRadius: 8 },
  forgeCentre:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  forgeStepDots:       { flexDirection: 'row', gap: 10, marginBottom: 14 },
  forgeStepDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1a0030', borderWidth: 1, borderColor: '#3a0060' },
  forgeStepDotActive:  { backgroundColor: '#B026FF', borderColor: '#B026FF', shadowColor: '#B026FF', shadowOpacity: 1, shadowRadius: 8 },
  forgeStepDotDone:    { backgroundColor: '#39FF14', borderColor: '#39FF14' },
  forgeTitle:          { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 14, fontWeight: '900', letterSpacing: 4, marginBottom: 16, textShadowColor: '#B026FF', textShadowRadius: 10 },
  forgeShardsRing:     { width: 140, height: 140, justifyContent: 'center', alignItems: 'center', position: 'relative', marginBottom: 16 },
  forgeShard:          { position: 'absolute', width: 50, height: 70, resizeMode: 'contain' },
  epicCoreForge:       { position: 'absolute', width: 220, height: 220, resizeMode: 'contain', zIndex: 50, shadowColor: '#39FF14', shadowOpacity: 1, shadowRadius: 30 },
  whiteLight:          { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#FFFFFF', zIndex: 40 },
  forgeBtnWrapper:     { marginTop: 8 },
  forgeBtn:            { paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: '#3a0060', borderRadius: 8, backgroundColor: '#0a0018', alignItems: 'center' },
  forgeBtnReady:       { borderColor: '#B026FF', backgroundColor: '#1a0030', shadowColor: '#B026FF', shadowOpacity: 0.8, shadowRadius: 20 },
  forgeBtnText:        { color: '#333', fontFamily: 'monospace', fontSize: 12, letterSpacing: 2 },
  forgeBtnTextReady:   { color: '#FFFFFF', fontWeight: '900', textShadowColor: '#B026FF', textShadowRadius: 8 },
  forgeBtnMint:        { borderColor: '#39FF14', backgroundColor: '#39FF14' },
  forgeBtnMintDone:    { borderColor: '#225522', backgroundColor: '#0a3a0a', opacity: 0.6 },
  forgeBtnTextMint:    { color: '#000000', fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  mintConfirmBadge:    { borderColor: '#39FF14', backgroundColor: 'rgba(0,30,5,0.6)', alignItems: 'center', paddingVertical: 16 },
  mintConfirmText:     { color: '#39FF14', fontFamily: 'monospace', fontSize: 14, fontWeight: '900', letterSpacing: 3, textShadowColor: '#39FF14', textShadowRadius: 8 },
  mintConfirmSub:      { color: '#888', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginTop: 4, fontStyle: 'italic' },
  forgeBtnReturn:      { marginTop: 10, borderColor: '#666', backgroundColor: 'rgba(20,20,20,0.8)' },
  forgeBtnTextReturn:  { color: '#AAA', fontFamily: 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  forgeStatusMsg:      { color: '#B026FF', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, marginTop: 10, textAlign: 'center', paddingHorizontal: 16 },
});

const huntStyles = StyleSheet.create({
  huntContainer:     { flex: 1, backgroundColor: '#020202', flexDirection: 'row' },
  huntHUD:           { position: 'absolute', top: 10, right: 10, alignItems: 'flex-end', zIndex: 10 },
  muteButtonHunt:    { position: 'absolute', top: 10, left: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(10,10,10,0.8)', borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center', zIndex: 900 },
  quitButtonHunt:    { position: 'absolute', top: 10, left: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(40,5,5,0.92)', borderWidth: 2, borderColor: '#FF5555', justifyContent: 'center', alignItems: 'center', zIndex: 900, shadowColor: '#FF5555', shadowOpacity: 0.8, shadowRadius: 10 },
  quitButtonHuntText:{ color: '#FF5555', fontFamily: 'monospace', fontSize: 12, fontWeight: '900', letterSpacing: 2, textShadowColor: '#FF5555', textShadowRadius: 6 },

  // Pause / quit modal
  pauseOverlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 750 },
  pauseBox:          { paddingHorizontal: 40, paddingVertical: 30, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'rgba(10,10,15,0.97)', shadowColor: '#FFFFFF', shadowOpacity: 0.6, shadowRadius: 24, alignItems: 'center', minWidth: 380 },
  pauseTitle:        { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 28, fontWeight: '900', letterSpacing: 8, textShadowColor: '#FFFFFF', textShadowRadius: 12 },
  pauseDivider:      { width: '100%', height: 1, backgroundColor: '#FFFFFF', marginVertical: 14, opacity: 0.4 },
  pauseSub:          { color: '#AAA', fontFamily: 'monospace', fontSize: 12, letterSpacing: 2, marginBottom: 22, textAlign: 'center' },
  pauseButtonRow:    { flexDirection: 'row', gap: 14 },
  pauseBtn:          { paddingVertical: 14, paddingHorizontal: 22, borderWidth: 2, borderRadius: 8, alignItems: 'center', minWidth: 170 },
  pauseBtnResume:    { borderColor: '#39FF14', backgroundColor: 'rgba(0,30,5,0.9)', shadowColor: '#39FF14', shadowOpacity: 0.6, shadowRadius: 12 },
  pauseBtnQuit:      { borderColor: '#FF5555', backgroundColor: 'rgba(30,5,5,0.9)', shadowColor: '#FF5555', shadowOpacity: 0.5, shadowRadius: 10 },
  pauseBtnTextResume:{ color: '#39FF14', fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing: 3, textShadowColor: '#39FF14', textShadowRadius: 8 },
  pauseBtnTextQuit:  { color: '#FF5555', fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing: 3 },
  pauseHint:         { color: '#666', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginTop: 18, fontStyle: 'italic' },
  huntScore:         { color: '#B026FF', fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 2, textShadowColor: '#B026FF', textShadowRadius: 12 },
  healthBarRow:      { flexDirection: 'row', gap: 4, marginTop: 5 },
  healthPip:         { width: 14, height: 14, borderRadius: 7 },
  healthPipFull:     { backgroundColor: '#39FF14', shadowColor: '#39FF14', shadowOpacity: 1, shadowRadius: 6 },
  healthPipEmpty:    { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  spreeText:         { position: 'absolute', top: '38%', alignSelf: 'center', color: '#FFD700', fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 3, textShadowColor: '#FF5E00', textShadowRadius: 16, textAlign: 'center', zIndex: 50 },
  specialReadyText:  { position: 'absolute', top: '55%', alignSelf: 'center', fontFamily: 'monospace', fontSize: 15, fontWeight: '900', letterSpacing: 2, textAlign: 'center', zIndex: 50, textShadowRadius: 12 },
  hoodieBuffText:    { position: 'absolute', top: '12%', alignSelf: 'center', color: '#B026FF', fontFamily: 'monospace', fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', zIndex: 50, textShadowColor: '#FFD700', textShadowRadius: 14, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#B026FF', borderRadius: 6, backgroundColor: 'rgba(15,0,30,0.7)' },
  deathOverlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,0,0,0.92)', justifyContent: 'center', alignItems: 'center', zIndex: 700 },
  deathTitle:        { color: '#FF0000', fontFamily: 'monospace', fontSize: 32, fontWeight: '900', letterSpacing: 4, textShadowColor: '#FF0000', textShadowRadius: 20 },
  deathGlitchLeaked: { color: '#B026FF', fontFamily: 'monospace', fontSize: 16, fontWeight: '900', letterSpacing: 3, textShadowColor: '#FF0000', textShadowRadius: 10 },
  deathGlitchRecovery:{ color: '#FF4444', fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, marginTop: 6, textShadowColor: '#FF0000', textShadowRadius: 6 },
  deathSub:          { color: '#888', fontFamily: 'monospace', fontSize: 13, letterSpacing: 2, marginTop: 10 },
  deathCountdownText:{ color: '#FF4444', fontFamily: 'monospace', fontSize: 48, fontWeight: '900', marginVertical: 20 },
  huntAgainBtn:      { paddingVertical: 18, paddingHorizontal: 50, borderWidth: 2, borderColor: '#FF0000', borderRadius: 12, backgroundColor: '#1a0000', shadowColor: '#FF0000', shadowOpacity: 0.8, shadowRadius: 20 },
  huntAgainText:     { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  deathReturnText:   { color: '#444', fontFamily: 'monospace', fontSize: 11, marginTop: 20, letterSpacing: 1 },
  nextRoundText:     { color: '#39FF14', fontFamily: 'monospace', fontSize: 36, fontWeight: '900', letterSpacing: 5, textShadowColor: '#39FF14', textShadowRadius: 24 },
  nextRoundSubText:  { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 18, fontWeight: '900', letterSpacing: 4, marginTop: 10, textShadowColor: '#FFFFFF', textShadowRadius: 10 },
  damageText:        { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 52, fontWeight: '900', letterSpacing: 8, textShadowColor: '#FF0000', textShadowRadius: 24 },
  zoneAlertText:     { color: '#050505', fontFamily: 'monospace', fontSize: 32, fontWeight: '900', letterSpacing: 4, textShadowColor: '#39FF14', textShadowRadius: 10 },
  zoneAlertSub:      { color: '#050505', fontFamily: 'monospace', fontSize: 48, fontWeight: '900', letterSpacing: 6, textShadowColor: '#39FF14', textShadowRadius: 16 },
  extractHUDBox:     { marginTop: 6, alignItems: 'flex-end' },
  extractHUDText:    { color: '#39FF14', fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, textShadowColor: '#39FF14', textShadowRadius: 6 },
  extractTimerTrack: { width: 100, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginTop: 3 },
  extractTimerFill:  { height: '100%', backgroundColor: '#39FF14' },
  extractZone:       { position: 'absolute', width: EXTRACT_SIZE, height: EXTRACT_SIZE, borderRadius: EXTRACT_SIZE / 2, borderWidth: 3, borderColor: '#39FF14', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', shadowColor: '#39FF14', shadowOpacity: 1, shadowRadius: 20, backgroundColor: 'rgba(57,255,20,0.08)' },
  extractZoneText:   { color: '#39FF14', fontFamily: 'monospace', fontSize: 9, fontWeight: '900', letterSpacing: 1, textShadowColor: '#39FF14', textShadowRadius: 6 },
  rosterSidebar:     { width: 110, backgroundColor: '#050505', borderRightWidth: 1, borderColor: '#1a1a1a', paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', zIndex: 100 },
  rosterTitle:       { color: '#444', fontFamily: 'monospace', fontSize: 9, letterSpacing: 2, marginBottom: 8 },
  rosterCard:        { width: '100%', padding: 8, backgroundColor: '#0d0d0d', borderRadius: 8, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  rosterDot:         { width: 12, height: 12, borderRadius: 6, marginBottom: 4 },
  rosterName:        { color: '#333', fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', marginBottom: 5 },
  heatBarBg:         { width: '100%', height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  heatBarFill:       { height: '100%', borderRadius: 2 },
  heatLabel:         { color: '#333', fontFamily: 'monospace', fontSize: 7, marginTop: 2, letterSpacing: 1 },
  overheatLabel:     { color: '#FF0000', fontFamily: 'monospace', fontSize: 7, fontWeight: 'bold', marginTop: 2, letterSpacing: 1 },
  runStatsBox:       { marginTop: 'auto', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderColor: '#1a1a1a', width: '100%' },
  runStatLabel:      { color: '#B026FF', fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, textAlign: 'center' },
  runStatValue:      { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' },
  radarRingLarge:    { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 1, borderColor: 'rgba(0,255,255,0.07)', borderStyle: 'dashed' },
  radarRingMedium:   { position: 'absolute', width: 180, height: 180, borderRadius: 90,  borderWidth: 1, borderColor: 'rgba(0,255,255,0.1)' },
  radarRingSmall:    { position: 'absolute', width: 70,  height: 70,  borderRadius: 35,  borderWidth: 1, borderColor: 'rgba(0,255,255,0.15)' },
  radarCrosshairV:   { position: 'absolute', width: 1,    height: '100%', backgroundColor: 'rgba(0,255,255,0.06)' },
  radarCrosshairH:   { position: 'absolute', width: '100%', height: 1, backgroundColor: 'rgba(0,255,255,0.06)' },
  huntPlayerBase:    { position: 'absolute', width: PLAYER_SIZE, height: PLAYER_SIZE, zIndex: 10, justifyContent: 'center', alignItems: 'center' },
  huntPlayerShielded:{ opacity: 0.7 },
  playerTriangle:    { width: 0, height: 0, borderLeftWidth: PLAYER_SIZE / 2, borderRightWidth: PLAYER_SIZE / 2, borderTopWidth: PLAYER_SIZE, borderStyle: 'solid', shadowOpacity: 1, shadowRadius: 10 },
  playerTriangleCutout: { position: 'absolute', top: 4, width: 0, height: 0, borderLeftWidth: PLAYER_SIZE / 2 - 6, borderRightWidth: PLAYER_SIZE / 2 - 6, borderTopWidth: PLAYER_SIZE - 10, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#020202' },
  huntEnemy:         { position: 'absolute', width: ENEMY_SIZE, height: ENEMY_SIZE, borderRadius: ENEMY_SIZE / 2, backgroundColor: '#FF0000', shadowColor: '#FF0000', shadowOpacity: 1, shadowRadius: 15, opacity: 0.8 },
  huntSplitter:      { position: 'absolute', width: SPLITTER_SIZE, height: SPLITTER_SIZE, backgroundColor: '#FFD700', borderWidth: 2, borderColor: '#FFEC80', shadowColor: '#FFD700', shadowOpacity: 1, shadowRadius: 14, transform: [{ rotate: '45deg' }] },
  huntMiniSplitter:  { position: 'absolute', width: SPLITTER_MINI_SIZE, height: SPLITTER_MINI_SIZE, backgroundColor: '#FFC400', shadowColor: '#FFD700', shadowOpacity: 1, shadowRadius: 8, transform: [{ rotate: '45deg' }] },
  shieldAura:        { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: '#00FFFF', borderStyle: 'dashed', zIndex: 5, opacity: 0.8 },
  rosterCardLocked:  { opacity: 0.4 },
  lockedLabel:       { color: '#444', fontSize: 10, marginTop: 2 },
  xpBox:             { width: '100%', paddingHorizontal: 4, marginTop: 8, alignItems: 'center' },
  xpLabelRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 },
  xpLabel:           { color: '#FFD700', fontFamily: 'monospace', fontSize: 10, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  seekerBadge:       {
    width: 18, height: 18, borderRadius: 3,
    backgroundColor: '#FFD700', borderWidth: 1, borderColor: '#FFF2B0',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FFD700', shadowOpacity: 1, shadowRadius: 8,
    transform: [{ rotate: '45deg' }],
  },
  seekerBadgeText:   {
    color: '#050505', fontFamily: 'monospace', fontSize: 10, fontWeight: '900',
    transform: [{ rotate: '-45deg' }],
  },
  seekerLabel:       { color: '#FFD700', fontFamily: 'monospace', fontSize: 7, letterSpacing: 1, textAlign: 'center', marginTop: 3, opacity: 0.9 },
  xpBarBg:           { width: '100%', height: 5, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  xpBarFill:         { height: '100%', backgroundColor: '#FFD700', borderRadius: 3 },
  extractCaptureBarBg:  { position: 'absolute', bottom: -14, width: '90%', height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  extractCaptureBarFill:{ height: '100%', backgroundColor: '#FFFFFF' },
  fireButton:        { position: 'absolute', bottom: 58, right: 20, width: 70, height: 70, borderRadius: 35, backgroundColor: '#0a0a0a', borderWidth: 2, borderColor: '#00FFFF', justifyContent: 'center', alignItems: 'center', zIndex: 300, shadowColor: '#00FFFF', shadowOpacity: 0.6, shadowRadius: 10 },
  fireButtonText:    { fontFamily: 'monospace', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  specialButton:     { position: 'absolute', bottom: 138, right: 22, width: 66, height: 66, borderRadius: 33, backgroundColor: '#0a0a0a', borderWidth: 2, justifyContent: 'center', alignItems: 'center', zIndex: 300 },
  specialButtonReady:{ shadowOpacity: 0.9, shadowRadius: 16 },
  specialChargeRing: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
  specialChargeFill: { height: '100%', borderRadius: 2 },
  specialButtonText: { fontFamily: 'monospace', fontSize: 7, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  extractResultOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 400 },
  extractResultTitle:   { color: '#39FF14', fontFamily: 'monospace', fontSize: 28, fontWeight: '900', letterSpacing: 4, textShadowColor: '#39FF14', textShadowRadius: 16 },
  extractResultSub:     { color: '#888', fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, marginTop: 8 },
  extractResultTokens:  { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 48, fontWeight: '900', marginVertical: 20 },
  extractResultButtons: { gap: 14, alignItems: 'center' },
  extractResultBtn:     { paddingVertical: 14, paddingHorizontal: 30, borderWidth: 1, borderColor: '#39FF14', borderRadius: 8, backgroundColor: '#0a1a0a' },
  // extractResultBtnSync / extractResultBtnSyncDone removed for Season 1 — Season 2 will restore them
  extractResultBtnQuit: { borderColor: '#333', backgroundColor: '#050505' },
  extractResultBtnText: { color: '#39FF14', fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  unlockOverlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,5,0.97)', justifyContent: 'center', alignItems: 'center', zIndex: 500 },
  unlockBox:         { width: '70%', padding: 30, borderWidth: 1, borderColor: '#333', borderRadius: 12, backgroundColor: '#0a0010', alignItems: 'center', gap: 12 },
  unlockLevel:       { color: '#555', fontFamily: 'monospace', fontSize: 11, letterSpacing: 3 },
  unlockName:        { fontFamily: 'monospace', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
  unlockDivider:     { width: 50, height: 2, borderRadius: 1, opacity: 0.6 },
  unlockSpecialTitle:{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', letterSpacing: 2 },
  unlockDesc:        { color: '#888', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', lineHeight: 18 },
  unlockBtn:         { marginTop: 8, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 2, borderRadius: 8, backgroundColor: '#05000f' },
  unlockBtnText:     { fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  huntTank:          { position: 'absolute', width: TANK_SIZE, height: TANK_SIZE, borderRadius: 8, backgroundColor: '#8B0000', borderWidth: 2, borderColor: '#FF4444', shadowColor: '#FF0000', shadowOpacity: 1, shadowRadius: 20, justifyContent: 'center', alignItems: 'center' },
  huntBoss:          { position: 'absolute', width: BOSS_SIZE, height: BOSS_SIZE, borderRadius: 12, backgroundColor: '#3a0000', borderWidth: 3, borderColor: '#FF6600', shadowColor: '#FF6600', shadowOpacity: 1, shadowRadius: 30, justifyContent: 'center', alignItems: 'center' },
  bossLabel:         { color: '#FF6600', fontFamily: 'monospace', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  bossHpPipFull:     { backgroundColor: '#FF6600', shadowColor: '#FF6600', shadowOpacity: 1, shadowRadius: 6 },
  huntSniper:        { position: 'absolute', width: SNIPER_SIZE, height: SNIPER_SIZE, borderRadius: SNIPER_SIZE / 2, backgroundColor: '#001a2a', borderWidth: 4, shadowOpacity: 1, shadowRadius: 36, justifyContent: 'center', alignItems: 'center' },
  huntSniperCore:    { width: SNIPER_SIZE * 0.45, height: SNIPER_SIZE * 0.45, borderRadius: SNIPER_SIZE * 0.45 / 2 },
  sniperLabel:       { color: '#00BFFF', fontFamily: 'monospace', fontSize: 9, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  sniperHpPipFull:   { backgroundColor: '#00BFFF', shadowColor: '#00BFFF', shadowOpacity: 1, shadowRadius: 6 },
  sniperBullet:      { position: 'absolute', width: SNIPER_BULLET_SIZE, height: SNIPER_BULLET_SIZE, borderRadius: SNIPER_BULLET_SIZE / 2, backgroundColor: '#00FFFF', shadowColor: '#00FFFF', shadowOpacity: 1, shadowRadius: 12, borderWidth: 1, borderColor: '#FFFFFF' },
  tankHpRow:         { flexDirection: 'row', gap: 3, position: 'absolute', top: -14 },
  tankHpPip:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#330000', borderWidth: 1, borderColor: '#FF4444' },
  tankHpPipFull:     { backgroundColor: '#FF4444', shadowColor: '#FF4444', shadowOpacity: 1, shadowRadius: 4 },
  shadowToken:       { position: 'absolute', width: TOKEN_SIZE, height: TOKEN_SIZE, backgroundColor: '#B026FF', transform: [{ rotate: '45deg' }], shadowColor: '#B026FF', shadowOpacity: 1, shadowRadius: 5 },
  plasmaRound:       { position: 'absolute', width: 8, height: 8, borderRadius: 4, shadowOpacity: 1, shadowRadius: 10 },
  huntTargetWrapper: { position: 'absolute', width: SHARD_SIZE, height: SHARD_SIZE, justifyContent: 'center', alignItems: 'center' },
  huntShardImg:      { width: SHARD_SIZE, height: SHARD_SIZE, resizeMode: 'contain' },
  huntPulseRing:     { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: '#39FF14' },
  captureBarBg:      { position: 'absolute', top: -20, width: 80, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden' },
  captureBarFill:    { height: '100%', backgroundColor: '#39FF14' },
  empContainer:      { position: 'absolute', bottom: 14, right: 16, alignItems: 'center', zIndex: 100 },
  empBarBg:          { width: 110, height: 5, backgroundColor: '#111122', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#333366', marginBottom: 8 },
  empBarFill:        { height: '100%', backgroundColor: '#00FFFF', shadowColor: '#00FFFF', shadowOpacity: 1, shadowRadius: 10 },
  empButton:         { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: '#00FFFF', borderRadius: 6, shadowColor: '#00FFFF', shadowOpacity: 0.8, shadowRadius: 20 },
  empText:           { color: '#000000', fontFamily: 'monospace', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  joystickBase:      { position: 'absolute', bottom: 56, left: 120, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(0,255,255,0.08)', borderWidth: 2, borderColor: 'rgba(0,255,255,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 200 },
  joystickKnob:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#00FFFF', shadowColor: '#00FFFF', shadowOpacity: 0.8, shadowRadius: 10 },
});

const styles = { ...mainStyles, ...introStyles, ...forgeStyles, ...huntStyles };
