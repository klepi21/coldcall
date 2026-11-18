import type { GameKind } from './money';

export interface GameMeta {
  id: GameKind;
  name: string;
  tagline: string;
  players: number;
  teams: boolean;
  /** Disclosed chance to win against the bot at the 5% house edge. */
  botTarget: string;
  length: string;
}

export const GAMES: Record<GameKind, GameMeta> = {
  chess: {
    id: 'chess',
    name: 'Chess',
    tagline: 'Pure skill. No luck at all.',
    players: 2,
    teams: false,
    botTarget: 'You win about 36 of 100 games and draw about 25.',
    length: 'About 10 minutes',
  },
  backgammon: {
    id: 'backgammon',
    name: 'Backgammon',
    tagline: 'Read the dice, race home.',
    players: 2,
    teams: false,
    botTarget: 'You win about 47 of 100 games.',
    length: 'About 8 minutes',
  },
  seabattle: {
    id: 'seabattle',
    name: 'Sea Battle',
    tagline: 'Hide your fleet. Hunt theirs.',
    players: 2,
    teams: false,
    botTarget: 'You win about 47 of 100 games.',
    length: 'About 8 minutes',
  },
  tichu: {
    id: 'tichu',
    name: 'Tichu',
    tagline: 'Team up and outplay the table.',
    players: 4,
    teams: true,
    botTarget: 'Your team wins about 47 of 100 games.',
    length: 'About 25 minutes',
  },
};
