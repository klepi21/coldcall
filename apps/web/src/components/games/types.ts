/** Contract every game board component implements. The server is the authority. Boards only send intents. */
export interface BoardSettings {
  sound: boolean;
  confirmMoves: boolean;
  boardTheme: 'marble' | 'night';
  hints: boolean;
  /** Use the WebGL 3D board when available. Falls back to 2D on weak devices or reduced motion. */
  render3d?: boolean;
}

export interface BoardProps<V, M> {
  /** engine publicView(state, mySeat) as sent by the server */
  view: V;
  /** legal moves for mySeat right now (server computed; may be a sample for Tichu) */
  legal: M[];
  /** null when spectating */
  mySeat: number | null;
  toAct: number[];
  seatNames: string[];
  lastMove: { seat: number; move: unknown } | null;
  /** send a move intent; resolve/reject is not awaited, the next view is the truth */
  onMove: (move: M) => void;
  /** true while a move is in flight */
  busy?: boolean;
  settings: BoardSettings;
  /** optional highlighted suggestion in practice mode */
  hint?: M | null;
  /** short plain English error from the server for the last attempted move */
  error?: string | null;
}
