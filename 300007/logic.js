/**
 * NEBULA SWARM — server rules.
 *
 * The shooter itself runs in the browser (client.js). The room only keeps a
 * shared high-score board, so these six functions manage scores: each seated
 * pilot may submit a finished run's score, and everyone sees the top list.
 */

export const meta = {
  game: "Nebula Swarm",
  minPlayers: 1,
  maxPlayers: 64,
};

const MAX_SCORE = 10000000;

export function setup(players) {
  return { best: {}, players: [...players] };
}

export function validateAction(state, playerId, action) {
  if (!action || action.type !== "score") return { ok: false, error: "unknown action" };
  const s = action.score;
  if (!Number.isInteger(s) || s < 0 || s > MAX_SCORE) return { ok: false, error: "invalid score" };
  return { ok: true };
}

export function applyAction(state, playerId, action) {
  const prev = state.best[playerId] || 0;
  if (action.score <= prev) return state;
  return { ...state, best: { ...state.best, [playerId]: action.score } };
}

export function isGameOver(state) {
  return { over: false };
}

function pilotName(id) {
  let h = 0;
  const str = String(id);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return letters[h % 24] + letters[(h >>> 5) % 24] + letters[(h >>> 10) % 24] + "-" + ((h >>> 15) % 90 + 10);
}

export function viewFor(state, playerId) {
  const top = Object.keys(state.best)
    .map((id) => ({ name: pilotName(id), score: state.best[id], you: id === playerId }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  return { top, yourBest: state.best[playerId] || 0, you: pilotName(playerId) };
}
