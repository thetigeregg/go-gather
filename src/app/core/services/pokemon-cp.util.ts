/** Ported from pogo-cal's src/utils/pokemonCP.ts. */

export const CPM_VALUES = {
  15: 0.51739395,
  20: 0.5974,
  25: 0.667934,
  40: 0.7903,
  50: 0.8403,
} as const;

export interface PokemonStats {
  baseStamina: number;
  baseAttack: number;
  baseDefense: number;
}

export interface CPResult {
  /** CP for level 20 perfect IVs (15/15/15) — normal raid encounters. */
  level20Max: number;
  /** CP for level 25 perfect IVs (15/15/15) — weather-boosted raid encounters. */
  level25Max: number;
}

/**
 * CP = floor((BaseAtk + AtkIV) x CPM x sqrt((BaseDef + DefIV) x CPM) x sqrt((BaseStam + StamIV) x CPM) / 10)
 */
export function calculateCP(
  baseAttack: number,
  baseDefense: number,
  baseStamina: number,
  levelCPM: number,
  ivAttack = 15,
  ivDefense = 15,
  ivStamina = 15
): number {
  const effectiveAttack = (baseAttack + ivAttack) * levelCPM;
  const effectiveDefense = (baseDefense + ivDefense) * levelCPM;
  const effectiveStamina = (baseStamina + ivStamina) * levelCPM;

  const cp = Math.floor(
    (effectiveAttack * Math.sqrt(effectiveDefense) * Math.sqrt(effectiveStamina)) / 10
  );

  return Math.max(cp, 10);
}

/** Always uses perfect IVs (15/15/15) for "Hundo" calculations. */
export function calculateRaidCP(stats: PokemonStats): CPResult {
  const { baseAttack, baseDefense, baseStamina } = stats;

  return {
    level20Max: calculateCP(baseAttack, baseDefense, baseStamina, CPM_VALUES[20], 15, 15, 15),
    level25Max: calculateCP(baseAttack, baseDefense, baseStamina, CPM_VALUES[25], 15, 15, 15),
  };
}

/** Matches the normalization used in the source data's Python fetcher. */
export function cleanPokemonName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function formatCP(cp: number): string {
  return cp.toLocaleString();
}

export function formatCPDisplay(
  level20Max: number,
  level25Max: number,
  showWeatherBoost: boolean
): string {
  if (showWeatherBoost) {
    return `${formatCP(level20Max)} / ${formatCP(level25Max)}`;
  }
  return formatCP(level20Max);
}
