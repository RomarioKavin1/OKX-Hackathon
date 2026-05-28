export type Nation =
  | "BRA" | "FRA" | "ARG" | "ENG" | "ESP" | "GER" | "POR" | "NED"
  | "ITA" | "BEL" | "CRO" | "URU";

export const NATION_NAME: Record<Nation, string> = {
  BRA: "Brazil", FRA: "France", ARG: "Argentina", ENG: "England",
  ESP: "Spain", GER: "Germany", POR: "Portugal", NED: "Netherlands",
  ITA: "Italy", BEL: "Belgium", CRO: "Croatia", URU: "Uruguay",
};

/** Unicode regional-indicator flags. Real, asset-free national identity. */
export const NATION_FLAG: Record<Nation, string> = {
  BRA: "🇧🇷", FRA: "🇫🇷", ARG: "🇦🇷", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  ESP: "🇪🇸", GER: "🇩🇪", POR: "🇵🇹", NED: "🇳🇱",
  ITA: "🇮🇹", BEL: "🇧🇪", CRO: "🇭🇷", URU: "🇺🇾",
};

/**
 * Primary kit hue per nation (OKLCH), used for card identity discs and crests.
 * Approximates each side's recognizable home-kit color.
 */
export const NATION_COLOR: Record<Nation, string> = {
  BRA: "oklch(0.82 0.16 95)",   // canary yellow
  FRA: "oklch(0.45 0.16 255)",  // bleu
  ARG: "oklch(0.74 0.10 230)",  // celeste
  ENG: "oklch(0.96 0.01 250)",  // white
  ESP: "oklch(0.55 0.20 25)",   // rojo
  GER: "oklch(0.30 0.02 265)",  // schwarz
  POR: "oklch(0.50 0.18 20)",   // vermelho
  NED: "oklch(0.66 0.20 50)",   // oranje
  ITA: "oklch(0.45 0.13 230)",  // azzurro
  BEL: "oklch(0.55 0.20 25)",   // red
  CRO: "oklch(0.58 0.21 25)",   // chequered red
  URU: "oklch(0.72 0.13 230)",  // celeste
};