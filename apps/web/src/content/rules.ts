/** Rules in three layers: quick start, full rules, tips. Plain English, the exact variants Evens uses. */
export interface RuleSection {
  id: string;
  title: string;
  body: string[];
}
export interface GameRules {
  quick: { goal: string; turn: string; win: string };
  full: RuleSection[];
  tips: string[];
  tutorial: { title: string; text: string }[];
}

import type { GameKind } from '@coldcall/shared';

export const RULES: Record<GameKind, GameRules> = {
  chess: {
    quick: {
      goal: 'Trap the other king so it cannot escape. That is checkmate.',
      turn: 'White moves first. On your turn, move one piece. Tap a piece to see where it can go.',
      win: 'Checkmate the king, or win on time if your opponent\'s clock runs out.',
    },
    full: [
      { id: 'pieces', title: 'How the pieces move', body: [
        'King: one square in any direction.',
        'Queen: any number of squares in a straight line, across, up, down or diagonally.',
        'Rook: any number of squares across or up and down.',
        'Bishop: any number of squares diagonally.',
        'Knight: an L shape, two squares one way and one square to the side. It can jump over pieces.',
        'Pawn: one square forward, or two on its first move. It captures one square diagonally forward.',
      ] },
      { id: 'special', title: 'Special moves', body: [
        'Castling: move your king two squares toward a rook, and the rook jumps over to the other side. Only if neither has moved, the squares between are empty, and your king is not in check or passing through check.',
        'En passant: if a pawn moves two squares and lands next to your pawn, you may capture it as if it moved one square. Only on the very next move.',
        'Promotion: a pawn that reaches the last row becomes a queen, rook, bishop or knight. You choose.',
      ] },
      { id: 'check', title: 'Check and checkmate', body: [
        'Check means the king is under attack. You must get out of check on your next move.',
        'Checkmate means the king is in check and there is no way out. The game ends.',
      ] },
      { id: 'draws', title: 'Draws', body: [
        'Stalemate: the player to move has no legal move but is not in check.',
        'Not enough pieces left for anyone to checkmate.',
        'The same position happens three times.',
        'Fifty moves by each player with no capture and no pawn move.',
        'Against the bot, a draw returns 90% of your stake. Against people, both stakes come back and the fee is kept.',
      ] },
      { id: 'clock', title: 'Clocks', body: [
        '5+3 means each player has 5 minutes, and 3 seconds are added after every move you make.',
        'If your clock reaches zero, you lose. Closing the page does not stop your clock.',
      ] },
    ],
    tips: [
      'Control the centre squares early with pawns and pieces.',
      'Bring out knights and bishops before moving the same piece twice.',
      'Castle early to keep your king safe.',
      'Before every move, ask: what is my opponent threatening?',
      'Do not trade a piece for less than it is worth. Rough values: pawn 1, knight 3, bishop 3, rook 5, queen 9.',
      'Use your clock wisely. A good move fast beats a perfect move too late.',
    ],
    tutorial: [
      { title: 'Tap a piece', text: 'Soft dots show where it can go. Rings mean you can capture.' },
      { title: 'Tap a dot to move', text: 'You can also drag the piece. Your clock stops and your opponent\'s starts.' },
      { title: 'Watch the king', text: 'A red glow means your king is in check. Your next move must protect it.' },
    ],
  },
  backgammon: {
    quick: {
      goal: 'Move all 15 of your checkers around the board into your home, then take them off.',
      turn: 'Roll two dice and move your checkers by those numbers. Tap a checker to see where it can go.',
      win: 'The first player to take off all 15 checkers wins.',
    },
    full: [
      { id: 'moving', title: 'Moving', body: [
        'Each die is a separate move. A roll of 6 and 3 lets you move one checker 6 and another 3, or one checker 9 if the stop in between is open.',
        'Doubles are played four times. A roll of 4 and 4 gives you four moves of 4.',
        'You can land on any point that is empty, holds your own checkers, or holds just one opponent checker.',
        'A point with two or more opponent checkers is blocked.',
        'If you can use both dice, you must. If you can only use one, you must use the larger one if possible.',
        'If you cannot move at all, your turn passes automatically.',
      ] },
      { id: 'hitting', title: 'Hitting and the bar', body: [
        'Landing on a single opponent checker hits it and sends it to the bar in the middle.',
        'A checker on the bar must come back in before you move anything else. It enters in your opponent\'s home board.',
      ] },
      { id: 'bearoff', title: 'Taking checkers off', body: [
        'When all 15 of your checkers are in your home board, you can start taking them off.',
        'A die can take off a checker from the matching point. A higher die can take off your furthest checker if there are none further back.',
      ] },
      { id: 'evens', title: 'The Evens version', body: [
        'Each game is a single game. A gammon or backgammon is shown in the result but pays the same as a normal win.',
        'There is no doubling cube in this beta.',
        'You can undo your moves during your turn until the last die is used.',
        'Each turn has 45 seconds. If time runs out we play a simple move for you. After three missed turns in a game with credits, it counts as leaving.',
      ] },
      { id: 'fair', title: 'Fair dice', body: [
        'Before the game we publish a lock on the secret seed. Each roll comes from that seed and the players\' own seeds. After the game we reveal the seed so anyone can recompute every roll.',
      ] },
    ],
    tips: [
      'Make points, especially in your home board. Two checkers on a point are safe.',
      'Avoid leaving single checkers where your opponent can easily hit them.',
      'Your 5 point and 7 point (the bar point) are the most valuable to build.',
      'Six points in a row form a prime. Checkers behind it cannot pass.',
      'When the race is clearly yours, stop fighting and run home.',
      'Watch the pip count to see who is ahead in the race.',
    ],
    tutorial: [
      { title: 'Dice are rolled for you', text: 'They show on your side of the board.' },
      { title: 'Tap a checker', text: 'Glowing points show where each die takes it. Tap one to move.' },
      { title: 'Changed your mind?', text: 'Tap Undo before your last move to start the turn again.' },
    ],
  },
  seabattle: {
    quick: {
      goal: 'Find and sink all five enemy ships before they sink yours.',
      turn: 'Pick a square in enemy waters and fire. You hear if it is a miss, a hit, or a ship sunk.',
      win: 'The first player to sink the whole enemy fleet wins.',
    },
    full: [
      { id: 'fleet', title: 'Your fleet', body: [
        'Each player has a 10 by 10 grid, columns A to J and rows 1 to 10.',
        'Five ships: Carrier (5 squares), Warship (4), Destroyer (3), Submarine (3) and Patrol boat (2).',
        'Ships lie across or up and down, never diagonally.',
        'Ships may not overlap and may not touch each other, not even at the corners.',
      ] },
      { id: 'placing', title: 'Placing ships', body: [
        'Both players place their ships at the same time, in secret. Drag a ship to move it, tap it to turn it.',
        'Tap Auto place for a random, valid layout.',
        'When both players tap Ready, the battle starts. Your ships stay hidden from your opponent.',
      ] },
      { id: 'firing', title: 'Firing', body: [
        'Players take turns firing one shot. The first player fires first.',
        'A white splash is a miss. A fire is a hit. When every square of a ship is hit, it sinks and is revealed.',
        'Because ships cannot touch, the squares around a sunk ship are marked as empty for you automatically.',
        'In Evens a hit does not give an extra shot. Turns always alternate.',
      ] },
      { id: 'evens', title: 'The Evens version', body: [
        'Each turn has 45 seconds. If time runs out we fire a shot for you. After three missed turns in a game with credits, it counts as leaving.',
        'Against the bot, the house keeps a published 5% edge: you win about 47 of 100 games.',
      ] },
    ],
    tips: [
      'Spread your ships out and use the edges sometimes. Players often search the middle first.',
      'Hunt in a checkerboard pattern. Every ship covers at least two squares, so you never need to fire at every square.',
      'After a hit, fire at the squares next to it to find which way the ship lies.',
      'Remember the no touching rule: the squares around a sunk ship are always empty.',
      'Keep track of which ships are left. If only the Carrier remains, look for long open lines.',
    ],
    tutorial: [
      { title: 'Place your fleet', text: 'Drag ships onto your grid, tap to turn them, or use Auto place. Then tap Ready.' },
      { title: 'Fire in enemy waters', text: 'Tap a square to aim, then fire. Splash means miss, fire means hit.' },
      { title: 'Sink them all', text: 'Sunk ships are revealed. Sink all five to win.' },
    ],
  },
  tichu: {
    quick: {
      goal: 'With your partner, score points by winning tricks with 5s, 10s and Kings, and try to get rid of your cards first.',
      turn: 'Play a card or combination that beats what is on the table, or pass. Your partner sits opposite you.',
      win: 'The first team to reach 500 points wins.',
    },
    full: [
      { id: 'deal', title: 'Deal and Grand Tichu', body: [
        'Each player gets 8 cards first. Now you may call Grand Tichu: a bet worth 200 points that you will be the first to empty your hand. You lose 200 if you are not.',
        'Then everyone gets 6 more cards, 14 in total.',
      ] },
      { id: 'passing', title: 'Passing cards', body: [
        'Everyone passes one card to each other player: one to the left opponent, one to your partner, one to the right opponent.',
        'Give your partner something useful and your opponents something low.',
      ] },
      { id: 'combos', title: 'What you can play', body: [
        'Single card, pair, three of a kind.',
        'Full house: three of a kind plus a pair.',
        'Straight: five or more cards in a row, any suits.',
        'Steps: two or more pairs in a row, like 7 7 8 8.',
        'You must play the same kind of combination with a higher rank, or pass. Straights and steps must have the same length.',
      ] },
      { id: 'bombs', title: 'Bombs', body: [
        'Four of a kind, or a straight of five or more in one suit, is a bomb.',
        'A bomb beats anything, and you can play it even when it is not your turn, while cards are on the table.',
        'A straight bomb beats four of a kind. A longer straight bomb beats a shorter one.',
      ] },
      { id: 'specials', title: 'The four special cards', body: [
        'Mahjong (1): the lowest single. Whoever holds it leads first. When you play it you may make a wish for a rank. The next player who can play that rank must do so.',
        'Dog: can only be led. It passes the lead to your partner.',
        'Phoenix: a wild card in combinations (not in bombs). As a single it is half a rank higher than the card on the table, but cannot beat the Dragon. It is worth minus 25 points.',
        'Dragon: the highest single, worth 25 points. If you win a trick with it, you must give that trick to an opponent.',
      ] },
      { id: 'tichu', title: 'Calling Tichu', body: [
        'Before you play your first card you may call Tichu: worth 100 points if you go out first, minus 100 if you do not.',
      ] },
      { id: 'scoring', title: 'Scoring a round', body: [
        'A trick is won when everyone else passes. The winner leads the next trick.',
        'Cards are worth: 5s 5 points, 10s and Kings 10 points, Dragon 25, Phoenix minus 25. All other cards 0. There are 100 points per round.',
        'The last player still holding cards gives their hand to the opponents and their tricks to the player who went out first.',
        'If both partners go out first and second, their team scores 200 and no cards are counted.',
        'In Evens the first team to 500 points wins.',
      ] },
    ],
    tips: [
      'Lead low combinations early to get rid of awkward cards.',
      'Do not beat your partner\'s winning play unless you need the lead.',
      'Save bombs to stop an opponent from going out, especially after a Tichu call.',
      'Count the high cards: four Aces, the Dragon and the Phoenix.',
      'Give the Dragon trick to the opponent who is less likely to go out next.',
      'Call Tichu only with a strong hand: high singles, a bomb, or the Dragon and Phoenix.',
    ],
    tutorial: [
      { title: 'Tap cards to pick them', text: 'The Play button tells you what combination you made, or why it does not work yet.' },
      { title: 'Beat it or pass', text: 'Play a higher combination of the same kind, or pass.' },
      { title: 'Team up', text: 'Your partner sits opposite. Help them go out first.' },
    ],
  },
};
