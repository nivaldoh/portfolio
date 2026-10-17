// PokéAgent Challenge, Track 1 tournament brackets, transcribed from the
// official page (https://pokeagent.github.io/leaderboard.html). Slot order
// within each match and match order within each round follow that page.
// Every match was best of 99; scores are games won.

export interface Slot {
  name: string;
  score: number;
}

export type Match = [Slot, Slot];

export interface Round {
  name: string;
  matches: Match[];
}

export interface Bracket {
  format: string;
  rounds: Round[];
}

export const ENTRANT = 'MetaHorns';
export const BRACKETS_URL = 'https://pokeagent.github.io/leaderboard.html';

const m = (a: string, as: number, b: string, bs: number): Match => [
  { name: a, score: as },
  { name: b, score: bs },
];

export const brackets: Bracket[] = [
  {
    format: 'Gen 1 OU',
    rounds: [
      {
        name: 'Quarterfinals',
        matches: [
          m('PA-Agent', 50, 'FoulPlay', 12),
          m('ED-Testing', 50, 'MetaHorns', 28),
          m('4thLesson', 50, 'GCOGS', 11),
          m('srsk-1729', 50, 'Exp-05', 29),
        ],
      },
      {
        name: 'Semifinals',
        matches: [
          m('ED-Testing', 13, 'PA-Agent', 50),
          m('srsk-1729', 20, '4thLesson', 50),
        ],
      },
      { name: 'Final', matches: [m('PA-Agent', 50, '4thLesson', 28)] },
    ],
  },
  {
    format: 'Gen 9 OU',
    rounds: [
      {
        name: 'Quarterfinals',
        matches: [
          m('FoulPlay', 50, 'Porygon2AI', 12),
          m('piploop', 37, 'PA-Agent', 50),
          m('ED-Testing', 50, 'srsk-1729', 20),
          m('Q', 50, 'MetaHorns', 16),
        ],
      },
      {
        name: 'Semifinals',
        matches: [
          m('FoulPlay', 50, 'PA-Agent', 39),
          m('Q', 50, 'ED-Testing', 22),
        ],
      },
      { name: 'Final', matches: [m('Q', 14, 'FoulPlay', 50)] },
    ],
  },
];

export const hasEntrant = (match: Match) =>
  match.some((s) => s.name === ENTRANT);

/** The entrant's matches, one entry per format, with the round they were in. */
export const entrantMatches = brackets.flatMap((b) =>
  b.rounds.flatMap((r) =>
    r.matches
      .filter(hasEntrant)
      .map((match) => ({ format: b.format, round: r.name, match }))
  )
);
