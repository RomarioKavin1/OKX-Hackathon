/**
 * worldcup2026.ts — The real 2026 FIFA World Cup draw + schedule.
 *
 * Source: official final draw (5 Dec 2025) and FIFA match schedule.
 * Hosts: USA / Canada / Mexico. 48 teams, 12 groups (A–L), 11 Jun – 19 Jul 2026.
 *
 * This is reference content for the in-app schedule. It is self-contained (it
 * does NOT reuse the playable-card `Nation` union, which only covers the four
 * squads PANENKA ships player cards for). Teams PANENKA has cards for are marked
 * `playable` so the schedule can link a real fixture to the game.
 *
 * Group-stage fixtures are enumerated in full for the four groups containing a
 * playable nation (C, I, J, L). All twelve groups' team lists are included.
 * Kickoff times are stored in UTC (the published schedule lists US/CA/MX local).
 */

export interface WCTeam {
  name: string;
  flag: string;
  /** PANENKA ships player cards for this nation. */
  playable?: boolean;
}

export interface WCGroup {
  letter: string;
  teams: WCTeam[];
}

export interface WCMatch {
  group: string;
  /** Kickoff, ISO 8601 UTC. */
  kickoff: string;
  home: string;
  away: string;
  venue: string;
  city: string;
}

export const WC2026 = {
  hosts: "USA · Canada · Mexico",
  start: "2026-06-11",
  end: "2026-07-19",
  teams: 48,
  groups: 12,
  finalVenue: "MetLife Stadium, East Rutherford",
} as const;

const T = (name: string, flag: string, playable = false): WCTeam => ({ name, flag, playable });

export const WC_GROUPS: WCGroup[] = [
  { letter: "A", teams: [T("Mexico", "🇲🇽"), T("South Africa", "🇿🇦"), T("Korea Republic", "🇰🇷"), T("Czechia", "🇨🇿")] },
  { letter: "B", teams: [T("Canada", "🇨🇦"), T("Bosnia & Herz.", "🇧🇦"), T("Qatar", "🇶🇦"), T("Switzerland", "🇨🇭")] },
  { letter: "C", teams: [T("Brazil", "🇧🇷", true), T("Morocco", "🇲🇦"), T("Haiti", "🇭🇹"), T("Scotland", "🏴󠁧󠁢󠁳󠁣󠁴󠁿")] },
  { letter: "D", teams: [T("United States", "🇺🇸"), T("Paraguay", "🇵🇾"), T("Australia", "🇦🇺"), T("Türkiye", "🇹🇷")] },
  { letter: "E", teams: [T("Germany", "🇩🇪"), T("Curaçao", "🇨🇼"), T("Ivory Coast", "🇨🇮"), T("Ecuador", "🇪🇨")] },
  { letter: "F", teams: [T("Netherlands", "🇳🇱"), T("Japan", "🇯🇵"), T("Sweden", "🇸🇪"), T("Tunisia", "🇹🇳")] },
  { letter: "G", teams: [T("Belgium", "🇧🇪"), T("Egypt", "🇪🇬"), T("Iran", "🇮🇷"), T("New Zealand", "🇳🇿")] },
  { letter: "H", teams: [T("Spain", "🇪🇸"), T("Cape Verde", "🇨🇻"), T("Saudi Arabia", "🇸🇦"), T("Uruguay", "🇺🇾")] },
  { letter: "I", teams: [T("France", "🇫🇷", true), T("Senegal", "🇸🇳"), T("Iraq", "🇮🇶"), T("Norway", "🇳🇴")] },
  { letter: "J", teams: [T("Argentina", "🇦🇷", true), T("Algeria", "🇩🇿"), T("Austria", "🇦🇹"), T("Jordan", "🇯🇴")] },
  { letter: "K", teams: [T("Portugal", "🇵🇹"), T("DR Congo", "🇨🇩"), T("Uzbekistan", "🇺🇿"), T("Colombia", "🇨🇴")] },
  { letter: "L", teams: [T("England", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", true), T("Croatia", "🇭🇷"), T("Ghana", "🇬🇭"), T("Panama", "🇵🇦")] },
];

/** Full group-stage fixtures for the four groups with a playable nation. */
export const WC_FIXTURES: WCMatch[] = [
  // Group C — Brazil
  { group: "C", kickoff: "2026-06-13T22:00:00Z", home: "Brazil", away: "Morocco", venue: "MetLife Stadium", city: "East Rutherford" },
  { group: "C", kickoff: "2026-06-14T01:00:00Z", home: "Haiti", away: "Scotland", venue: "Gillette Stadium", city: "Foxborough" },
  { group: "C", kickoff: "2026-06-19T22:00:00Z", home: "Scotland", away: "Morocco", venue: "Gillette Stadium", city: "Foxborough" },
  { group: "C", kickoff: "2026-06-20T00:30:00Z", home: "Brazil", away: "Haiti", venue: "Lincoln Financial Field", city: "Philadelphia" },
  { group: "C", kickoff: "2026-06-24T22:00:00Z", home: "Scotland", away: "Brazil", venue: "Hard Rock Stadium", city: "Miami Gardens" },
  { group: "C", kickoff: "2026-06-24T22:00:00Z", home: "Morocco", away: "Haiti", venue: "Mercedes-Benz Stadium", city: "Atlanta" },

  // Group I — France
  { group: "I", kickoff: "2026-06-16T19:00:00Z", home: "France", away: "Senegal", venue: "MetLife Stadium", city: "East Rutherford" },
  { group: "I", kickoff: "2026-06-16T22:00:00Z", home: "Iraq", away: "Norway", venue: "Gillette Stadium", city: "Foxborough" },
  { group: "I", kickoff: "2026-06-22T21:00:00Z", home: "France", away: "Iraq", venue: "Lincoln Financial Field", city: "Philadelphia" },
  { group: "I", kickoff: "2026-06-23T00:00:00Z", home: "Norway", away: "Senegal", venue: "MetLife Stadium", city: "East Rutherford" },
  { group: "I", kickoff: "2026-06-26T19:00:00Z", home: "Norway", away: "France", venue: "Gillette Stadium", city: "Foxborough" },
  { group: "I", kickoff: "2026-06-26T19:00:00Z", home: "Senegal", away: "Iraq", venue: "BMO Field", city: "Toronto" },

  // Group J — Argentina
  { group: "J", kickoff: "2026-06-17T01:00:00Z", home: "Argentina", away: "Algeria", venue: "Arrowhead Stadium", city: "Kansas City" },
  { group: "J", kickoff: "2026-06-17T04:00:00Z", home: "Austria", away: "Jordan", venue: "Levi's Stadium", city: "Santa Clara" },
  { group: "J", kickoff: "2026-06-22T17:00:00Z", home: "Argentina", away: "Austria", venue: "AT&T Stadium", city: "Arlington" },
  { group: "J", kickoff: "2026-06-23T03:00:00Z", home: "Jordan", away: "Algeria", venue: "Levi's Stadium", city: "Santa Clara" },
  { group: "J", kickoff: "2026-06-28T02:00:00Z", home: "Algeria", away: "Austria", venue: "Arrowhead Stadium", city: "Kansas City" },
  { group: "J", kickoff: "2026-06-28T02:00:00Z", home: "Jordan", away: "Argentina", venue: "AT&T Stadium", city: "Arlington" },

  // Group L — England
  { group: "L", kickoff: "2026-06-17T20:00:00Z", home: "England", away: "Croatia", venue: "AT&T Stadium", city: "Arlington" },
  { group: "L", kickoff: "2026-06-17T23:00:00Z", home: "Ghana", away: "Panama", venue: "BMO Field", city: "Toronto" },
  { group: "L", kickoff: "2026-06-23T20:00:00Z", home: "England", away: "Ghana", venue: "Gillette Stadium", city: "Foxborough" },
  { group: "L", kickoff: "2026-06-23T23:00:00Z", home: "Panama", away: "Croatia", venue: "BMO Field", city: "Toronto" },
  { group: "L", kickoff: "2026-06-27T21:00:00Z", home: "Panama", away: "England", venue: "MetLife Stadium", city: "East Rutherford" },
  { group: "L", kickoff: "2026-06-27T21:00:00Z", home: "Croatia", away: "Ghana", venue: "Lincoln Financial Field", city: "Philadelphia" },
];

/** Flag lookup for a team name (across all groups). */
export const WC_FLAG: Record<string, string> = Object.fromEntries(
  WC_GROUPS.flatMap((g) => g.teams.map((t) => [t.name, t.flag])),
);