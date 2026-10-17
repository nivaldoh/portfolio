// The furthest Slay the Spire full run so far, floor by floor: Ironclad,
// Ascension 0, gpt-6-luna at low reasoning effort, scaffolding version 8
// (prompt, memory and interface), development seed RUNDEV2. It reached Act 4,
// floor 54, and lost to the Spire Shield and Spire Spear (an elite fight).
//
// Source (github.com/nivaldoh/slay_the_spire_ai, read at HEAD
// 1117518e790c3bca7383b04f6f1f646f88619441):
// - runs/fullrun/llm-luna-v8-dev-20261012/run-0001/trace.jsonl, the run's raw
//   CommunicationMod messages (job source revision f36176b; sha256
//   5b55544d4e1816e67c6557333b08da041a1aec3e4024d317db7b3adbb250fba7). runs/ is
//   local evidence ignored by Git, so this file is not in the public repository.
// - docs/spire/fullrun/results.csv and docs/spire/fullrun/log.md (committed)
//   identify it as the only Act 4 run (v8, RUNDEV2, act 4, floor 54, killed by
//   "Spire Shield, Spire Spear (elite)") and agree with every number below:
//   max HP 94 -> 47 on F29, Awakened One 47 -> 18 HP on F50, Act 4 at 50 max HP,
//   50 -> 12 HP on F54 turn 3, 10 HP on the last turn.
//
// Derivation: every trace record of kind `observation` with a `game_state`, in
// trace order, gives (floor, act, room_type, current_hp, max_hp). Readings are
// grouped by floor; within a floor, `hp` keeps the ordered [HP, max HP] pairs
// with consecutive duplicates dropped. Nothing is interpolated or edited.
// `room` is the floor's first room_type, renamed (TreasureRoomBoss -> treasure,
// VictoryRoom, the hall after the Act 3 boss, -> victory). Floor 0 (Neow)
// is left out. The Act 4 map in the trace has three rows (rest, shop, elite:
// floors 52-54) and names the act boss "The Heart"; as in the repository's
// BOSS_FLOORS (16, 33, 50), the boss is the floor after the last map row, 55.

export type Room =
  | 'monster'
  | 'elite'
  | 'boss'
  | 'rest'
  | 'shop'
  | 'event'
  | 'treasure'
  | 'victory';

export interface FloorRecord {
  floor: number;
  act: number;
  room: Room;
  /** Ordered [HP, max HP] readings on this floor, consecutive repeats removed. */
  hp: [number, number][];
}

/** The unreached Act 4 boss. */
export const NEXT_BOSS = { floor: 55, act: 4, name: 'The Heart' };

/** Bosses beaten, named as in each boss floor's combat state (minions left out). */
export const BOSSES: Record<number, string> = {
  16: 'Hexaghost',
  33: 'The Collector',
  50: 'Awakened One',
};

/** Enemies of the last fight, from the floor 54 combat state. */
export const LAST_FIGHT = 'Spire Shield and Spire Spear';

export const FLOORS: FloorRecord[] = [
  { floor: 1, act: 1, room: 'monster', hp: [[80, 80]] },
  { floor: 2, act: 1, room: 'monster', hp: [[80, 80]] },
  { floor: 3, act: 1, room: 'monster', hp: [[80, 80]] },
  { floor: 4, act: 1, room: 'monster', hp: [[80, 80], [65, 80], [71, 80]] },
  { floor: 5, act: 1, room: 'event', hp: [[71, 80], [80, 80]] },
  { floor: 6, act: 1, room: 'rest', hp: [[80, 80]] },
  { floor: 7, act: 1, room: 'monster', hp: [[80, 80], [70, 80], [76, 80]] },
  { floor: 8, act: 1, room: 'monster', hp: [[76, 80], [59, 80], [51, 80], [46, 80], [52, 80]] },
  { floor: 9, act: 1, room: 'treasure', hp: [[52, 80], [66, 94]] },
  { floor: 10, act: 1, room: 'monster', hp: [[66, 94], [72, 94], [61, 94], [57, 94], [50, 94], [45, 94], [51, 94]] },
  { floor: 11, act: 1, room: 'event', hp: [[51, 94]] },
  { floor: 12, act: 1, room: 'rest', hp: [[51, 94], [79, 94]] },
  { floor: 13, act: 1, room: 'elite', hp: [[79, 94], [73, 94], [57, 94], [63, 94]] },
  { floor: 14, act: 1, room: 'monster', hp: [[63, 94], [68, 94], [65, 94], [71, 94]] },
  { floor: 15, act: 1, room: 'rest', hp: [[71, 94]] },
  { floor: 16, act: 1, room: 'boss', hp: [[71, 94], [76, 94], [49, 94], [40, 94], [37, 94], [43, 94]] },
  { floor: 17, act: 1, room: 'treasure', hp: [[43, 94], [94, 94]] },
  { floor: 18, act: 2, room: 'monster', hp: [[94, 94], [89, 94], [93, 94], [75, 94], [63, 94], [71, 94], [66, 94], [61, 94], [67, 94]] },
  { floor: 19, act: 2, room: 'monster', hp: [[67, 94], [57, 94], [63, 94]] },
  { floor: 20, act: 2, room: 'monster', hp: [[63, 94], [64, 94], [46, 94], [36, 94], [40, 94], [22, 94], [28, 94]] },
  { floor: 21, act: 2, room: 'shop', hp: [[28, 94], [46, 94]] },
  { floor: 22, act: 2, room: 'monster', hp: [[46, 94], [56, 94], [54, 94], [69, 94], [58, 94], [53, 94], [59, 94]] },
  { floor: 23, act: 2, room: 'elite', hp: [[59, 94], [52, 94], [49, 94], [36, 94], [45, 94], [33, 94], [45, 94], [32, 94], [30, 94], [36, 94]] },
  { floor: 24, act: 2, room: 'monster', hp: [[36, 94], [34, 94], [47, 94], [37, 94], [45, 94], [42, 94], [41, 94], [47, 94]] },
  { floor: 25, act: 2, room: 'rest', hp: [[47, 94], [75, 94]] },
  { floor: 26, act: 2, room: 'treasure', hp: [[75, 94]] },
  { floor: 27, act: 2, room: 'event', hp: [[75, 94], [94, 94]] },
  { floor: 28, act: 2, room: 'rest', hp: [[94, 94]] },
  { floor: 29, act: 2, room: 'event', hp: [[94, 94], [47, 47]] },
  { floor: 30, act: 2, room: 'treasure', hp: [[47, 47]] },
  { floor: 31, act: 2, room: 'monster', hp: [[47, 47]] },
  { floor: 32, act: 2, room: 'rest', hp: [[47, 47]] },
  { floor: 33, act: 2, room: 'boss', hp: [[47, 47], [31, 47], [30, 47], [28, 47], [47, 47], [25, 47], [17, 47], [16, 47], [22, 47]] },
  { floor: 34, act: 2, room: 'treasure', hp: [[22, 47], [47, 47]] },
  { floor: 35, act: 3, room: 'monster', hp: [[47, 47]] },
  { floor: 36, act: 3, room: 'event', hp: [[47, 47], [39, 47], [30, 47], [7, 47], [31, 47], [30, 47], [36, 47]] },
  { floor: 37, act: 3, room: 'shop', hp: [[36, 47]] },
  { floor: 38, act: 3, room: 'monster', hp: [[36, 47], [47, 47], [28, 47], [34, 47]] },
  { floor: 39, act: 3, room: 'event', hp: [[34, 47]] },
  { floor: 40, act: 3, room: 'monster', hp: [[34, 47], [41, 47], [37, 47], [43, 47]] },
  { floor: 41, act: 3, room: 'treasure', hp: [[43, 47]] },
  { floor: 42, act: 3, room: 'monster', hp: [[43, 47], [47, 47]] },
  { floor: 43, act: 3, room: 'treasure', hp: [[47, 47]] },
  { floor: 44, act: 3, room: 'event', hp: [[47, 47]] },
  { floor: 45, act: 3, room: 'monster', hp: [[47, 47], [45, 47], [40, 47], [24, 47], [23, 47], [22, 47], [20, 47], [26, 47]] },
  { floor: 46, act: 3, room: 'monster', hp: [[26, 47], [42, 47], [34, 47], [44, 47], [47, 47]] },
  { floor: 47, act: 3, room: 'rest', hp: [[47, 47]] },
  { floor: 48, act: 3, room: 'monster', hp: [[47, 47]] },
  { floor: 49, act: 3, room: 'rest', hp: [[47, 47]] },
  { floor: 50, act: 3, room: 'boss', hp: [[47, 47], [27, 47], [47, 47], [44, 47], [47, 50], [50, 50], [28, 50], [12, 50], [18, 50]] },
  { floor: 51, act: 3, room: 'victory', hp: [[18, 50], [50, 50]] },
  { floor: 52, act: 4, room: 'rest', hp: [[50, 50]] },
  { floor: 53, act: 4, room: 'shop', hp: [[50, 50]] },
  { floor: 54, act: 4, room: 'elite', hp: [[50, 50], [12, 50], [10, 50], [0, 50]] },
];
