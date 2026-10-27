/**
 * Rainbrew Sky — verified leaderboard backend
 * Google Apps Script web app + Google Sheet. See SETUP.md.
 *
 * How scores are verified
 *  1. The game asks this server for a signed session (token + random seed) before every ranked run.
 *  2. The seed decides every item that will fall (kind, timing). The client cannot choose its own items.
 *  3. On submit the client sends its event log (what it caught / hit / missed, and when).
 *  4. This script replays the log against the same seed and rules. The score must match exactly,
 *     every event must refer to a real item at a possible time, and the run cannot be longer than the
 *     real time elapsed since the session was issued.
 *  5. Each accepted run gets a verification code (RB-XXXX-XXXX) that staff can look up in verify.html.
 * Scores can never exceed a "perfect game" for that seed; runs close to perfect are flagged REVIEW.
 */
var CONFIG = {
  SHEET: 'Scores',
  AUTO_SEASON: 'weekly',           // 'weekly' | 'monthly' | 'none'. The season name is picked automatically unless staff set one by hand.
  DEFAULT_SEASON: 'Season 1',      // used when AUTO_SEASON is 'none'
  SITE_URL: '',                    // optional: where verify.html lives, e.g. 'https://yourname.github.io/rainbrew-sky/' (used by showStaffLink)
  TOKEN_TTL_MS: 7 * 24 * 3600 * 1000,   // a ranked session can be played offline and uploaded up to 7 days later
  MAX_TOKENS_PER_CALL: 4,
  MAX_TOKENS_PER_HOUR: 60,         // per device
  LB_PAGE: 100,                    // players returned per leaderboard request (the game loads more on demand)
  LB_CHUNK: 500,                   // players per cache chunk
  LB_FRESH_S: 75,                  // a leaderboard is rebuilt at most once per this many seconds (the 1-minute refresh keeps it always ready)
  COMP_GRACE_MIN: 15,              // minutes after a competition ends during which late (offline) uploads still count
  RANK_SHARED_COURSE: true,        // Rank: everyone plays the SAME course during a season, so nobody can shop for an easy seed
  RISK_REVIEW: 0.6,                // score / perfect-game score at or above this is flagged REVIEW
  TIMEZONE: 'Asia/Manila',
  TZ_OFFSET_H: 8                   // Philippine time (UTC+8, no daylight saving): weekly boards run Monday 12:00 AM to Sunday 11:59 PM
};

/* ===== SIM v31 — Rainbrew Sky: the whole game world. The SAME code runs in the game (index.html) and on the server (Code.gs), so every score can be re-played and verified. Change both or neither. ===== */
var SIM_VERSION = 36;
var W = 360, H = 640, SPS = 30;                                   // the field is always 360 x 640 "units"; 30 steps a second
var MAXBEAMS = 5;                                                // no matter how they stack (shop, power-ups), you never fire more than 5 beams
var MAXSTEP = 46;                                                 // the fastest the unicorn can move in one step: nobody can teleport
var LEVEL_STEPS = 660, BOSS_EVERY = 5, BOSS_MAX = 3900;           // a level lasts 22 s; every 5th level is a boss; a boss not beaten in 130 s flies away
var OC_STEPS = 240, POWER_STEPS = 300, COFFEE_STEPS = 240, PR = 12;
var RB_DMG = 0.22;                                               // RAINBREW POWER (the fixed button, boss fights only, once per boss): one tap = an instant, huge hit (22% of the boss's health), then a fast surge
var ELEM_MAX = 100, ELEM_KILL = 0.5;                                // every defeated creature charges Rainbrew Power by 0.5%: 200 defeats = a full bar
var MODES = {
  rank:    { ranked: 1, lives: 3, maxSec: 10800, diff: 1.5, boss: 1, ramp: 1, hype: 1, fair: 1 },   // fair: every unicorn uses its equal base kit and no upgrades, because gems live on each phone and the server cannot check what was bought   // the weekly ranked flight: the same course for everyone; it gets harder with time and builds a hype before every boss
  classic: { ranked: 1, lives: 5, maxSec: 10800, diff: 0.75, boss: 1, ramp: 0, hype: 0, easy: 1 }    // casual: smooth, even waves; a new course every flight
};
var BASE = {                                                      // the equal "base kit" of each unicorn: its own beam style and skill, about 11-15 damage a second (used in Ranked, so prizes are fair)
  frost:   { cd: 5, lanes: 2, dmg: 1, pierce: 0 },                // twin beams
  solar:   { cd: 3, lanes: 1, dmg: 1, pierce: 0 },                // a rapid stream down one narrow line
  void:    { cd: 8, lanes: 1, dmg: 3, pierce: 2 },                // slow, heavy, piercing shots
  emerald: { cd: 9, lanes: 2, dmg: 2, pierce: 0 },                // two strong beams
  golden:  { cd: 7, lanes: 3, dmg: 1, pierce: 0 }                 // a wide three-beam fan
};
var UNICORNS = {                                                  // the full kit (Classic): it grows with the tier and the price. Golden Sun is the ultimate: everything, at its maximum
  frost:   { tier: 1, cd: 5, lanes: 2, dmg: 1,   pierce: 0, helpers: 0, shield0: 0 },
  solar:   { tier: 2, cd: 3, lanes: 1, dmg: 0.9, pierce: 0, helpers: 0, shield0: 0 },
  void:    { tier: 3, cd: 7, lanes: 1, dmg: 4,   pierce: 3, helpers: 0, shield0: 0 },
  emerald: { tier: 4, cd: 8, lanes: 3, dmg: 2,   pierce: 0, helpers: 0, shield0: 0 },
  golden:  { tier: 5, cd: 6, lanes: 3, dmg: 2,   pierce: 1, helpers: 1, shield0: 1 }
};
var UP_MAX = { d: 5, r: 5, t: 3 };                                // weapon upgrades bought with gems: damage, fire rate and projectile tier (Classic only)
function parseUp(u) { var m = /^d([0-5])r([0-5])t([0-3])$/.exec(String(u || '')); return m ? { d: +m[1], r: +m[2], t: +m[3] } : { d: 0, r: 0, t: 0 }; }
function kitFor(M, uni, up) {                                     // the kit actually used in a flight
  if (M.fair) return BASE[uni] ? { cd: BASE[uni].cd, lanes: BASE[uni].lanes, dmg: BASE[uni].dmg, pierce: BASE[uni].pierce, helpers: 0, shield0: 0, tier: 0 } : kitFor(M, 'frost');
  var K = UNICORNS[uni] || UNICORNS.frost, u2 = up || { d: 0, r: 0, t: 0 }, k = { tier: K.tier, cd: K.cd, lanes: K.lanes, dmg: K.dmg, pierce: K.pierce, helpers: K.helpers, shield0: K.shield0 };
  k.dmg *= 1 + 0.1 * u2.d; k.cd = Math.max(1.5, k.cd * (1 - 0.06 * u2.r)); k.lanes += (u2.t >= 1 ? 1 : 0) + (u2.t >= 3 ? 1 : 0); k.pierce += (u2.t >= 2 ? 1 : 0) + (u2.t >= 3 ? 1 : 0);
  return k;
}
var POWERUPS = ['coffee', 'triple', 'helpers', 'shield', 'spread', 'pierce', 'charm'];   // seven power-ups; the beam ones (triple, spread, pierce, laser) stack on top of your shop upgrades
var POWERS = ['coffee', 'triple', 'helpers', 'spread', 'pierce'];            // the timed ones
var BOSS_KINDS = ['dragon', 'griffin', 'kraken', 'phoenix', 'hydra', 'medusa', 'cerberus', 'cyclops'];   // one boss for each magical place, then they start again, stronger
/* every creature: its role (a = small and quick, b = a tank, c = a shooter), its life, what it is worth, its size */
var ENEMIES = {
  ghost:   { role: 'a', hp: 2, pts: 6,  r: 17 }, bat:     { role: 'a', hp: 1, pts: 5,  r: 15, sway: 16, fast: 1.2 }, pumpkin: { role: 'b', hp: 6, pts: 16,  r: 19 }, witch:   { role: 'c', hp: 4, pts: 24, r: 19 },
  puff:    { role: 'a', hp: 2, pts: 6,  r: 18 }, storm:   { role: 'b', hp: 6, pts: 16,  r: 20 }, spark:   { role: 'c', hp: 4, pts: 24, r: 15 },
  jelly:   { role: 'a', hp: 2, pts: 6,  r: 17, sway: 20 }, crab: { role: 'b', hp: 6, pts: 16, r: 19 }, puffer: { role: 'c', hp: 4, pts: 24, r: 18 },
  ember:   { role: 'a', hp: 2, pts: 6,  r: 15, fast: 1.15 }, golem: { role: 'b', hp: 7, pts: 18, r: 21 }, imp: { role: 'c', hp: 4, pts: 24, r: 17 },
  firefly: { role: 'a', hp: 1, pts: 5,  r: 14, sway: 22, fast: 1.1 }, frog: { role: 'b', hp: 6, pts: 16, r: 19 }, mush: { role: 'c', hp: 4, pts: 24, r: 18 },
  gembug:  { role: 'a', hp: 2, pts: 6,  r: 15 }, crystal: { role: 'b', hp: 7, pts: 18, r: 21 }, gemwisp: { role: 'c', hp: 4, pts: 24, r: 16 },
  ashling: { role: 'a', hp: 2, pts: 6,  r: 15, fast: 1.15 }, magma: { role: 'b', hp: 7, pts: 18, r: 20 }, fireimp: { role: 'c', hp: 4, pts: 24, r: 17 },
  scarab:  { role: 'a', hp: 2, pts: 6,  r: 15 }, mummy: { role: 'b', hp: 7, pts: 18, r: 19 }, sorcerer: { role: 'c', hp: 4, pts: 24, r: 18 }
};
var PLACE_KINDS = [                                               // which creatures live in which magical place, and which ones come on levels 1 to 4 (level 5 is the boss)
  { a: ['ghost', 'bat'], b: 'pumpkin', c: 'witch', plan: [['pumpkin'], ['ghost'], ['bat'], ['witch']] },              // Matcha Meadows: pumpkins, then ghosts, then bats, then witches
  { a: ['puff'], b: 'storm', c: 'spark', plan: [['storm'], ['puff'], ['storm', 'puff'], ['spark']] },                 // Cappuccino Clouds
  { a: ['jelly'], b: 'crab', c: 'puffer', plan: [['crab'], ['jelly'], ['crab', 'jelly'], ['puffer']] },               // Boba Bay
  { a: ['ember'], b: 'golem', c: 'imp', plan: [['golem'], ['ember'], ['golem', 'ember'], ['imp']] },                  // Caramel Canyon
  { a: ['firefly'], b: 'frog', c: 'mush', plan: [['frog'], ['firefly'], ['frog', 'firefly'], ['mush']] },             // Blueberry Bog
  { a: ['gembug'], b: 'crystal', c: 'gemwisp', plan: [['crystal'], ['gembug'], ['crystal', 'gembug'], ['gemwisp']] },   // Mint Grotto
  { a: ['ashling'], b: 'magma', c: 'fireimp', plan: [['magma'], ['ashling'], ['magma', 'ashling'], ['fireimp']] },    // Cocoa Volcano
  { a: ['scarab'], b: 'mummy', c: 'sorcerer', plan: [['mummy'], ['scarab'], ['mummy', 'scarab'], ['sorcerer']] }      // Cookie Ruins
];
var LEVEL_POWER = [['coffee', 'triple', 'charm', 'shield'], ['triple', 'pierce', 'charm', 'coffee'], ['spread', 'pierce', 'charm', 'coffee']];   // the capsule each level brings: it gets stronger as you go on
var PI = 3.141592653589793, TWO_PI = 6.283185307179586;
function SIN(a) { a = a - TWO_PI * Math.floor(a / TWO_PI); var s = 1; if (a > PI) { a -= PI; s = -1; } var p = a * (PI - a); return s * 16 * p / (5 * PI * PI - 4 * p); }   // plain arithmetic: identical on every phone and on the server
function COS(a) { return SIN(a + PI / 2); }
function mkRng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function E(G, name, a, b, c) { if (G.keepEv) G.ev.push([name, a, b, c]); }   // what happened, for the screen and the sound (it never changes the result)


function mult(G) { var c = Math.min(3, 1 + Math.floor(G.combo / 6)); return G.magic > 0 ? c * 2 : c; }   // x2 after 6 defeats in a row, x3 after 12; Rainbrew Magic doubles it
function placeOf(G) { return G.stage % PLACE_KINDS.length; }
function ramp(G) { return G.M.ramp ? Math.min(1, G.t / (SPS * 600)) : 0; }   // Ranked: difficulty climbs smoothly for the first 10 minutes (speed, density, aggression)
function soft(raw, knee, max) { return raw <= knee ? raw : Math.min(max, knee + (raw - knee) * 0.5); }   // diminishing returns: past the knee a stack is worth half, and nothing passes the cap
function moveBonus(G) { return soft(G.wc.move, 0.3, 0.45); }
function wcPower(G) { return Math.min(0.24, 0.04 * G.wcOff); }                       // the game pushes back a little for every offensive Wild Card you stack
function envStr(G) { return (G.wc.resist ? 0.5 : 1) * (G.boss && G.boss.lv === 2 ? 1.3 : 1); }   // a Wild Card halves a boss's condition; the boss's enrage makes it 30% stronger
function envOf(G) { return G.phase === 'boss' && G.boss ? G.boss.kind : ''; }   // each boss brings its own environmental condition during its fight
function dmgMul(G) { return (1 + 0.08 * G.charm) * (G.hyper > 0 ? 2 : 1) * (G.pw.coffee > 0 ? 1.25 : 1) * (G.env === 'dragon' ? 1 - 0.4 * G.es : 1); }
function levelIn(G) { return ((G.level - 1) % BOSS_EVERY) + 1; }          // 1..4 are waves, 5 is the boss

function newGame(seed, mode, uni, up) {
  var M = MODES[mode] || MODES.classic, u = UNICORNS[uni] ? uni : 'frost', rs = mkRng(seed), kit = kitFor(M, u, typeof up === 'string' ? parseUp(up) : up);
  return { v: SIM_VERSION, mode: MODES[mode] ? mode : 'classic', uni: u, M: M, U: kit, rs: rs, rd: mkRng((seed ^ 0x9E3779B9) >>> 0), keepEv: false, ev: [],
    t: 0, over: 0, reason: '', px: W / 2, py: H - 150, pdx: 0, pdy: 0, lives: M.inf ? 0 : M.lives, score: 0, combo: 0, comboT: 0, maxCombo: 0,
    inv: 0, shield: kit.shield0 ? 1 : 0, star: 0, magic: 0, pw: { coffee: 300, triple: 0, helpers: 0, spread: 0, pierce: 0 }, fireCd: 1, hz: [], stone: 0, usedPow: 0, elem: 0, magnetT: 0, hyper: 0, env: '', freeze: 0, ultK: '', ultT: 0, es: 1, wc: { move: 0, magnet: 0, crit: 0, life: 0, resist: 0, regen: 0, fan: 0, beam: 0, ult: 0, boost2: 0 }, pwBeams: 0, regenT: 0, wv: 0, wvLv: 0, lull: 0, charm: 0, revives: 0, rvLog: [], wcN: 0, wcOff: 0, maxL: M.lives, cards: [], cardRe: 0, cdLog: [], cdCur: '', cm: null, cometDone: -1, cometLv: 2 + (rs() < 0.5 ? 0 : 1), comets: 0, skillsUsed: 0, hype: 0, warnT: 0,
    level: 1, levelT: 0, stage: 0, phase: 'wave', clearT: 0, waveT: 6, boss: null, bossT: 0, powGiven: 0,
    wl: 0, coreOwed: 0, nh: 0, oc: 0, ocs: 0, cc: 0, bp: 0, boxes: 0, jinx: 0, bossHit: 0, flaw: 0, flawless: 0,       // streak (kills without a hit), Overcharged, close calls, most beams at once, mystery boxes, risk debuff, flawless boss wins
    nextIce: SPS * (22 + Math.floor(rs() * 8)),
    en: [], bl: [], sh: [], it: [], ice: [], hitsDealt: 0, kills: 0, hits: 0, bosses: 0, surges: 0, gems: 0, caught: 0, rbReady: 0, rbUsed: 0 };
}
function bossLevel(G) { return G.M.boss && G.level % BOSS_EVERY === 0; }

/* ---------------- spawning: small groups, and the creatures of the place you are in ---------------- */
function levelKinds(G) { var K = PLACE_KINDS[placeOf(G)]; return K.plan[clamp(levelIn(G) - 1, 0, 3)]; }   // the creature(s) of this level: one family per level, harder as you climb
function pickKind(G) { var p = levelKinds(G); return p[p.length === 1 ? 0 : Math.floor(G.rs() * p.length)]; }
function ENEMY_A(G) { return pickKind(G); }
function addEnemy(G, k, x, y, v, sway) {
  var D = ENEMIES[k], hp = Math.max(1, Math.ceil(D.hp * (1 + 0.18 * G.stage) * (1 + 0.08 * (levelIn(G) - 1)) * (1 + wcPower(G))));   // tougher with every stage and every level
  G.en.push({ k: k, role: D.role, x: x, x0: x, y: y, vy: v * (D.fast || 1) * (D.role === 'b' ? 0.8 : 1), sway: sway || D.sway || (D.role === 'a' ? 14 : 0), t: Math.floor(G.rs() * 40), ph: Math.floor(G.rs() * 100), hp: hp, max: hp, r: D.r, hf: 0, dx: 0, dy: 0, sc: 60 });
}
var FORMS = ['row', 'vee', 'cols', 'zig', 'pairs', 'wall', 'diag', 'stagger'];
function formSet(G) { var n = placeOf(G) * 4 + clamp(levelIn(G) - 1, 0, 3); return [(3 * n) % 8, (3 * n + 1) % 8]; }   // two formations per phase; the next phase and the next level never reuse them
function spawnForm(G, f, v, yo) {
  var rs = G.rs, i, g, cx, a, p = [], cap = ENEMIES[levelKinds(G)[0]].role === 'c' ? 4 : 99;
  switch (FORMS[f]) {
    case 'row': g = Math.floor(rs() * 5); for (i = 0; i < 5; i++) if (i !== g) p.push([36 + i * 72, -30]); break;                                                  // a line with one gap
    case 'vee': cx = 90 + Math.floor(rs() * 180); for (i = -1; i <= 1; i++) p.push([cx + i * 76, -30 - Math.abs(i) * 40]); break;                                  // a V pointing at you
    case 'cols': a = 50 + Math.floor(rs() * 120); for (i = 0; i < 2; i++) { p.push([a, -30 - i * 64]); p.push([a + 130, -62 - i * 64]); } break;                    // two staggered columns
    case 'zig': for (i = 0; i < 4; i++) p.push([i % 2 ? 270 : 90, -30 - i * 52]); break;                                                                          // a zigzag
    case 'pairs': for (i = 0; i < 2; i++) { p.push([90 + i * 140 - 24, -30 - i * 70]); p.push([90 + i * 140 + 24, -30 - i * 70]); } break;                         // three pairs, one after another
    case 'wall': g = Math.floor(rs() * 5); for (i = 0; i < 6; i++) if (i !== g && i !== g + 1) p.push([30 + i * 60, -30]); break;                                  // a wall with a two-wide gap
    case 'diag': a = rs() < 0.5 ? 1 : -1; for (i = 0; i < 4; i++) p.push([a > 0 ? 60 + i * 78 : 300 - i * 78, -30 - i * 44]); break;                                // a diagonal sweep
    default: for (i = 0; i < 3; i++) p.push([60 + i * 120, -30]); p.push([180, -100]);                                              // two rows, staggered
  }
  for (i = 0; i < p.length && i < cap; i++) addEnemy(G, pickKind(G), p[i][0], p[i][1] + (yo || 0), v);
}
function spawnWave(G) {                                         // small groups with real gaps between them: room to breathe and aim
  var rs = G.rs, ix = G.stage * 4 + levelIn(G) - 1, r = ramp(G), v = (1.65 + 0.06 * ix) * Math.sqrt(G.M.diff) * (1 + 0.3 * r) * (1 + 0.45 * G.hype), p = rs(), k = pickKind(G), i;
  var fs2 = formSet(G);
  spawnForm(G, fs2[rs() < 0.5 ? 0 : 1], v, 0);                                                  // each phase has its own two formations
  if (G.hype > 0 && rs() < G.hype * 0.9) { var hx = 40 + Math.floor(rs() * 280); addEnemy(G, pickKind(G), hx, -90, v); addEnemy(G, ENEMY_A(G), clamp(hx + (rs() < 0.5 ? -70 : 70), 30, W - 30), -40, v); }   // before a boss: more small creatures swarm in
  var normal = Math.max(Math.floor(36 / (1 + 0.8 * G.hype)), Math.floor((100 - 3.3 * ix) / (G.M.diff * (1 + 0.4 * r)))) + Math.floor(rs() * 24), op = Math.max(0, 1 - G.t / 1200);   // the opening (first 40 s): big, frequent waves for instant action, easing to the normal pace
  if (op > 0) { var extra = Math.round(3 * op); for (i = 0; i < extra; i++) addEnemy(G, ENEMY_A(G), 30 + Math.floor(rs() * 300), -70 - i * 46, v); }
  G.waveT = Math.floor((normal / (1 + 0.5 * wcPower(G))) * (1 - op) + (28 + Math.floor(rs() * 12)) * op);
}
function placeX(G, x, y) {                                       // pick a spot that does not overlap another pickup (they are spaced out, even in Rainbrew Magic)
  var tries = [0, 1, -1, 2, -2, 3, -3, 4, -4], t, i, o, cx, ok;
  for (t = 0; t < tries.length; t++) { cx = clamp(x + tries[t] * 36, 24, W - 24); ok = true; for (i = 0; i < G.it.length; i++) { o = G.it[i]; if (o.k !== 'logo' && Math.abs(o.x - cx) < 34 && Math.abs(o.y - y) < 46) { ok = false; break; } } if (ok) return cx; }
  return clamp(x, 24, W - 24);
}
function mkItem(G, k, x, y, vx, vy) { G.it.push({ k: k, x: k === 'logo' ? x : placeX(G, x, y), y: y, vx: vx, vy: vy, t: 0, dx: 0, dy: 0 }); }
function dropHeart(G, kind, x, y) { if (G.uni === 'golden' && G.lives > 0 && G.lives < G.maxL && ENEMIES[kind] && ENEMIES[kind].role !== 'a' && G.rd() < 0.03) mkItem(G, 'heart', x, y, 0, 4.8); }   // heart drops belong to the Golden Sun alone, and they are very rare
function dropMystery(G, kind, x, y) {                              // now and then a floating ? capsule drops: a quick surprise
  if (ENEMIES[kind].role === 'a' || G.phase !== 'wave' || G.rd() >= 0.008) return;   // rare: about one in a hundred tougher creatures
  for (var i = 0; i < G.it.length; i++) if (G.it[i].k === 'mystery') return;
  mkItem(G, 'mystery', x, y, 0, 3);
}
function mysteryBox(G) {                                           // jackpot, a full ULT, a shield, or a gamble (a risk for a reward)
  var r = G.rd(); G.boxes++;
  if (r < 0.32) { G.gems += 25; E(G, 'mystery', 'jackpot', 25); }
  else if (r < 0.58) { if (G.ultT <= 0) { G.elem = ELEM_MAX; E(G, 'ultready', 0, 0); } E(G, 'mystery', 'ult', 0); }
  else if (r < 0.78) { if (!G.shield) G.shield = 1; E(G, 'mystery', 'shield', 0); }
  else { G.jinx = 240; G.gems += 15; E(G, 'mystery', 'gamble', 15); }   // 15 gems now, but you shoot at half speed for 8 seconds
}
function dropWeapon(G, kind, x, y) {                            // temporary weapon power-ups sometimes drop from tougher creatures (they add to your shop upgrades)
  if (G.phase !== 'wave' || !ENEMIES[kind] || ENEMIES[kind].role === 'a' || G.rd() >= 0.07) return;
  for (var i = 0; i < G.it.length; i++) if (G.it[i].k === 'triple' || G.it[i].k === 'helpers' || G.it[i].k === 'spread' || G.it[i].k === 'pierce' || G.it[i].k === 'charm') return;   // one at a time
  var r = G.rd(); mkItem(G, r < 0.12 ? 'triple' : r < 0.45 ? 'spread' : r < 0.8 ? 'pierce' : 'helpers', x, y, 0, 3.4);   // BEAM UP, FAN SHOT, PIERCING, helpers or the rainbow laser
}
function dropGems(G, kind, x, y) {                              // a defeated creature may drop a gem (the currency for buying unicorns)
  var role = ENEMIES[kind] ? ENEMIES[kind].role : 'a', ch = role === 'a' ? 0.2 : role === 'b' ? 0.45 : 0.38;
  if (G.rd() < ch) mkItem(G, 'gem', x, y, 0, 5.2);
}
function givePower(G) {                                         // every level brings one power-up capsule, chosen for where you are
  var L = levelIn(G), row = LEVEL_POWER[G.stage === 0 ? 0 : G.stage === 1 ? 1 : 2], k = row[Math.min(3, L - 1)];
  if (k === 'shield' && G.shield) k = 'triple';
  mkItem(G, k, 50 + Math.floor(G.rd() * 260), -20, 0, 1.7); G.powGiven++; E(G, 'capsule', k, 0);
}
function spawnIce(G) {                                           // a volley of 2 to 4 sharp ice shards: each shows a static marker, then plunges FAST. Spaced and staggered: hard, but always dodgeable
  var n = 2 + Math.floor(G.rs() * 3), lanes = [0, 1, 2, 3, 4], i, j, t;
  for (i = lanes.length - 1; i > 0; i--) { j = Math.floor(G.rs() * (i + 1)); t = lanes[i]; lanes[i] = lanes[j]; lanes[j] = t; }
  for (i = 0; i < n; i++) G.ice.push({ x: 36 + lanes[i] * 72, y: -30, vy: 15, w: 40 + i * 14 });
  E(G, 'icewarn', 0, n); G.shards = (G.shards || 0) + n;
  G.nextIce = G.t + Math.floor(SPS * (13 + Math.floor(G.rs() * 9)) / (G.M.diff * (1 + 0.05 * G.stage)));
}

/* ---------------- the boss and its attacks ---------------- */
/* ---------------- Wild Cards: three to choose from after every boss, in three rarities ---------------- */
var CARDS = [                                                    // Wild Cards are passives and run-modifiers: damage, fire rate and projectiles belong to the shop's weapon upgrades
  { id: 'move',   rar: 0, off: 0 }, { id: 'magnet', rar: 0, off: 0 }, { id: 'ultc',   rar: 0, off: 0 }, { id: 'gem25',  rar: 0, off: 0 },         // Common (silver, 55%): 25 gems
  { id: 'resist', rar: 1, off: 0 }, { id: 'regen',  rar: 1, off: 0 }, { id: 'boost2', rar: 1, off: 0 }, { id: 'gem50',  rar: 1, off: 0 },         // Uncommon (blue, 28%): 50 gems
  { id: 'life',   rar: 2, off: 0 }, { id: 'crit',   rar: 2, off: 1 }, { id: 'gem100', rar: 2, off: 0 },                                           // Rare (gold, 13%): 100 gems
  { id: 'fan',    rar: 3, off: 1 }, { id: 'beam',   rar: 3, off: 1 }, { id: 'ult',    rar: 3, off: 0 }, { id: 'gem200', rar: 3, off: 0 }                                            // Super Rare (prismatic, 4%): 200 gems
];
var RESHUFFLE = [15, 25, 40, 60, 80];                              // what a reshuffle costs, going up each time on the same screen
function cardCapped(G, id) {                                       // soft caps: a stat that has reached its limit stops appearing
  var w = G.wc;
  switch (id) {
    case 'move': return w.move >= 0.6; case 'magnet': return w.magnet >= 3; case 'life': return w.life >= 2; case 'resist': return w.resist >= 1; case 'regen': return w.regen >= 1;
    case 'crit': return w.crit >= 0.45; case 'fan': return w.fan >= 1; case 'beam': return w.beam >= 1 || G.U.lanes + w.beam >= MAXBEAMS; case 'ult': case 'ultc': return w.ult >= 3; case 'boost2': return w.boost2 >= 1;
  }
  return false;
}
function drawCards(G) {
  var out = [], tries = 0, roll, rar, pool, c, i, fill = ['gem25', 'gem50', 'gem100'];
  while (out.length < 3 && tries++ < 80) {
    roll = G.rs() * 100; rar = roll < 55 ? 0 : roll < 83 ? 1 : roll < 96 ? 2 : 3; pool = [];
    for (i = 0; i < CARDS.length; i++) { c = CARDS[i]; if (c.rar === rar && !cardCapped(G, c.id) && out.indexOf(c.id) < 0) pool.push(c.id); }
    if (pool.length) out.push(pool[Math.floor(G.rs() * pool.length)]);
  }
  for (i = 0; out.length < 3 && i < fill.length; i++) if (out.indexOf(fill[i]) < 0) out.push(fill[i]);
  if (G.flaw) { var pr = []; for (i = 0; i < CARDS.length; i++) if (CARDS[i].rar === 3 && !cardCapped(G, CARDS[i].id) && CARDS[i].id.indexOf('gem') < 0) pr.push(CARDS[i].id); if (pr.length) out[0] = pr[Math.floor(G.rs() * pr.length)]; G.flaw = 0; }   // flawless boss victory: the first card is Prismatic
  G.cards = out;
}
function reshuffleCost(G) { return RESHUFFLE[Math.min(G.cardRe, RESHUFFLE.length - 1)]; }
function applyCard(G, id) {
  var w = G.wc, i; for (i = 0; i < CARDS.length; i++) if (CARDS[i].id === id && CARDS[i].off) G.wcOff++;
  if (id === 'move') w.move += 0.15; else if (id === 'magnet') w.magnet++; else if (id === 'crit') w.crit += 0.15;
  else if (id === 'life') { w.life++; G.maxL = G.M.lives + w.life; if (G.lives > 0 && G.lives < G.maxL) G.lives++; }
  else if (id === 'resist') w.resist = 1; else if (id === 'regen') w.regen = 1; else if (id === 'fan') w.fan = 1; else if (id === 'beam') w.beam = 1; else if (id === 'boost2') w.boost2 = 1;
  else if (id === 'ultc') w.ult += 0.5; else if (id === 'ult') w.ult += 1;
  else if (id === 'gem25') G.gems += 25; else if (id === 'gem50') G.gems += 50; else if (id === 'gem100') G.gems += 100; else if (id === 'gem200') G.gems += 200;
  E(G, 'card', id, 0);
}
function cardReshuffle(G) { if (G.phase !== 'cards' || G.gems < reshuffleCost(G)) return false; G.gems -= reshuffleCost(G); G.cardRe++; G.cdCur += 'r'; drawCards(G); return true; }
function cardPick(G, i) { if (G.phase !== 'cards' || !(i >= 0 && i <= 2) || !G.cards[i]) return false; if (cardCapped(G, G.cards[i])) G.gems += 25; else applyCard(G, G.cards[i]); G.cdCur += i; G.cdLog.push(G.cdCur); G.cdCur = ''; G.wcN++; G.cards = []; nextStage(G); return true; }
function cdStr(G) { return G.cdLog.concat(G.cdCur ? [G.cdCur] : []).join(';'); }   // the card choices, for the server to replay

/* ---------------- the Golden Comet: once a stage, around level 2 or 3 ---------------- */
function spawnComet(G) { var left = G.rs() < 0.5, hp = 8 + 3 * G.stage, y0 = 170 + Math.floor(G.rs() * 150); G.cm = { x: left ? -30 : W + 30, y0: y0, y: y0, vx: left ? 5.5 : -5.5, t: 0, hp: hp, max: hp, hf: 0 }; G.cometDone = G.stage; E(G, 'comet', 0, 0); }
function updateComet(G) { var c = G.cm; c.t++; c.x += c.vx; c.y = c.y0 + 38 * SIN(c.t * 0.1); if (c.hf > 0) c.hf--; if (c.x < -50 || c.x > W + 50) { G.cm = null; E(G, 'cmlost', 0, 0); } }
function cometBurst(G) {                                           // a shower of white diamonds and an instant Rainbrew Boost
  var c = G.cm, n = Math.min(24, 14 + 2 * G.stage), i; G.cm = null; G.comets++; G.score += 150 * (G.stage + 1);
  var cols = Math.ceil(n / 3), x0 = clamp(c.x - (cols - 1) * 18, 24, W - 24 - (cols - 1) * 36);
  for (i = 0; i < n; i++) mkItem(G, 'gem', x0 + Math.floor(i / 3) * 36, c.y - 10 - (i % 3) * 50, 0, 5 + (i % 4) * 0.3);   // three rows, spaced so no two diamonds overlap
  G.pw.coffee = COFFEE_STEPS * (G.wc.boost2 ? 2 : 1); E(G, 'cmkill', c.x, c.y);
}
function nextStage(G) { G.phase = 'wave'; G.level++; G.levelT = 0; G.stage++; G.waveT = 40; G.cometLv = 2 + (G.rs() < 0.5 ? 0 : 1); G.cm = null; E(G, 'stage', G.stage, 0); E(G, 'level', G.level, 0); }
function bossHP(s) { s = Math.max(0, s); var i = s % 8, c = Math.floor(s / 8); return 900 + 120 * i + c * (700 + 90 * i); }   // base health: Matcha Dragon 900, then 1600 on the second run (must match the game)
function startBoss(G) {
  var kind = BOSS_KINDS[G.stage % BOSS_KINDS.length], hp = Math.ceil(bossHP(G.stage) * (G.M && G.M.easy ? 0.6 : 1) * (1 + 1.5 * wcPower(G)));   // endurance fights: bosses have 2.6 times their old life
  G.bossHit = 0;
  G.phase = 'boss'; G.bossT = 0; G.hz = []; G.boss = { kind: kind, x: W / 2, y: -90, hp: hp, max: hp, r: 44, hf: 0, lv: 0, n: 0, inn: 0, t2: 0, tele: 0, dying: 0, ph: 0, cd: 80, m: 0, mode: 0, md: 0, lx: 0 };
  G.rbReady = 1; G.oc = 0;                                       // every boss fight starts with Rainbrew Power ready (one use per fight); Overload is for creatures only
  E(G, 'boss', kind, G.stage);
}
function orb(G, x, y, a, sp, r, k) { G.bl.push({ x: x, y: y, vx: COS(a) * sp, vy: SIN(a) * sp, r: r || 6, k: k }); }   // k: the creature that fired it (its colour is the shot's colour)
function aimAt(G, x, y) { var dx = G.px - x, dy = G.py - y; return dy > 0 ? PI / 2 + (dx / (Math.abs(dx) + dy)) * 0.9 : PI / 2 + (dx > 0 ? 0.9 : -0.9); }   // an angle towards the unicorn, arithmetic only
function hz(G, o, delay) { o.t = -(delay || 0); G.hz.push(o); E(G, 'hzwarn', o.s, o.x); }
function colH(G, s, x, y0, y1, w, warn, live, delay) { hz(G, { k: 'col', s: s, x: x, y0: y0, y1: y1, w: w, warn: warn, live: live }, delay); }
function dropH(G, s, x, warn, delay, r) { hz(G, { k: 'drop', s: s, x: x, warn: warn, live: 1, r: r || 16 }, delay); }
function beamH(G, s, a0, da, w, warn, live, follow) { var b = G.boss; hz(G, { k: 'beam', s: s, ox: b.x, oy: b.y + 24, a0: a0, da: da, w: w, len: 600, warn: warn, live: live, f: follow ? 1 : 0, x: b.x }, 0); }
function updateHazards(G) {
  var i, h, keep = [];
  for (i = 0; i < G.hz.length; i++) {
    h = G.hz[i]; h.t++;
    if (h.f && G.boss) { h.ox = G.boss.x; h.oy = G.boss.y + 24; }
    if (h.k === 'drop' && h.t === h.warn) G.bl.push({ x: h.x, y: -24, vx: 0, vy: 7.5, r: h.r });     // a boulder / meteor falls where the marker showed
    if (h.t < h.warn + h.live) keep.push(h);
  }
  G.hz = keep;
}
function hazardHit(G) {                                           // an active column or beam hurts (or, for Medusa's gaze, turns you to stone: slow)
  var i, h, a, ex, ey, dx, dy, t2, d2, r;
  for (i = 0; i < G.hz.length; i++) {
    h = G.hz[i]; if (h.k === 'drop' || h.t < h.warn || h.t >= h.warn + h.live) continue;
    if (h.k === 'col') { if (G.py >= h.y0 && G.py <= h.y1 && Math.abs(G.px - h.x) < h.w + PR - 3) { if (h.s === 'gaze') G.stone = 40; else hurt(G); } }
    else { a = h.a0 + h.da * (h.t - h.warn); ex = COS(a) * h.len; ey = SIN(a) * h.len; dx = G.px - h.ox; dy = G.py - h.oy; t2 = (dx * ex + dy * ey) / (ex * ex + ey * ey); t2 = t2 < 0 ? 0 : t2 > 1 ? 1 : t2; ex = dx - ex * t2; ey = dy - ey * t2; r = h.w + PR - 3; if (ex * ex + ey * ey < r * r) { if (h.s === 'gaze') G.stone = 40; else hurt(G); } }
  }
}
function bossMove(G, b, lvl, sp) {                                 // every boss has its OWN way of attacking; returns the steps to wait before the next one
  var m = b.m++, i, a, x, rate = lvl === 2 ? 0.72 : lvl === 1 ? 0.86 : 1, k = b.kind, n;
  if (k === 'dragon') {                                            // fire breath sweeps across the sky, with fireballs between
    if (m % 3 === 0) { var dir = b.n++ % 2 ? -1 : 1; beamH(G, 'breath', PI / 2 - 0.8 * dir, 1.6 * dir / 44, 17, 30, 44, 1); return 124 * rate; }
    for (i = -1; i <= 1; i++) orb(G, b.x, b.y + 30, aimAt(G, b.x, b.y) + i * 0.2, sp * 1.05, 8); return 72 * rate;
  }
  if (k === 'griffin') {                                           // it dives straight down a lane at you; feathers fly as it climbs back
    if (m % 3 === 0) { b.mode = 1; b.md = 0; b.lx = clamp(Math.round(G.px), 50, W - 50); colH(G, 'dive', b.lx, 0, H, 30, 30, 22, 0); return 150 * rate; }
    n = 5 + lvl; for (i = 0; i < n; i++) orb(G, b.x, b.y + 30, PI / 2 + (i - (n - 1) / 2) * 0.3, sp); return 70 * rate;
  }
  if (k === 'kraken') {                                            // tentacles slam up from below; ink bubbles drift between
    if (m % 3 !== 1) { x = clamp(Math.round(G.px), 40, W - 40); n = 2 + lvl; var xs = [x]; for (i = 1; i < n; i++) xs.push(clamp(x + (i % 2 ? 1 : -1) * (80 + 52 * Math.floor(i / 2)) + Math.floor(G.rs() * 30) - 15, 30, W - 30)); for (i = 0; i < xs.length; i++) colH(G, 'tent', xs[i], 190, H, 25, 34, 20, i * 10); return 118 * rate; }
    n = 8 + 2 * lvl; for (i = 0; i < n; i++) orb(G, b.x, b.y, i * TWO_PI / n + b.n * 0.2, sp * 0.6, 9); b.n++; return 76 * rate;
  }
  if (k === 'phoenix') {                                           // meteors rain down with a marker on the ground; a fan of embers between
    if (m % 3 !== 1) { n = 4 + lvl; x = clamp(Math.round(G.px), 40, W - 40); dropH(G, 'meteor', x, 28, 0); for (i = 1; i < n; i++) dropH(G, 'meteor', 30 + Math.floor(G.rs() * (W - 60)), 28, i * 9); return 106 * rate; }
    a = aimAt(G, b.x, b.y); for (i = -2; i <= 2; i++) orb(G, b.x, b.y + 30, a + i * 0.2, sp); return 70 * rate;
  }
  if (k === 'hydra') {                                             // its heads lunge down three lanes one after another
    if (m % 3 !== 2) { var order = (b.n++ % 2) ? [2, 1, 0] : [0, 1, 2]; for (i = 0; i < 3; i++) colH(G, 'head', 60 + order[i] * 120 + (order[i] === 1 ? 0 : 0), 120, H, 29, 24, 14, i * 17); if (lvl > 0) colH(G, 'head', clamp(Math.round(G.px), 40, W - 40), 120, H, 26, 24, 14, 54); return 118 * rate; }
    a = aimAt(G, b.x, b.y); orb(G, b.x - 30, b.y + 10, a - 0.1, sp * 1.1); orb(G, b.x + 30, b.y + 10, a + 0.1, sp * 1.1); return 60 * rate;
  }
  if (k === 'medusa') {                                            // her stone gaze sweeps the screen and slows you; snakes slither at you
    if (m % 3 === 0) { var d2 = b.n++ % 2 ? -1 : 1; beamH(G, 'gaze', PI / 2 - 0.9 * d2, 1.8 * d2 / 70, 15, 36, 70, 1); return 150 * rate; }
    a = aimAt(G, b.x, b.y); for (i = -3; i <= 3; i++) orb(G, b.x, b.y + 20, a + i * 0.2, sp * 0.9); if (m % 3 === 2) for (i = 0; i < 10; i++) orb(G, b.x, b.y, i * TWO_PI / 10 + 0.2, sp * 0.65); return 80 * rate;
  }
  if (k === 'cerberus') {                                          // three heads, three powers: the left head breathes FIRE, the middle head FROST, the right head POISON
    var hx = [b.x - 74, b.x, b.x + 74], hord = (Math.floor(m / 3) % 2) ? [0, 1, 2] : [2, 1, 0], hd;
    if (m % 3 === 0) { for (i = 0; i < 3; i++) colH(G, 'flame', clamp(Math.round(hx[hord[i]]), 30, W - 30), 130, H, 24, 20, 17, i * 15); return 112 * rate; }   // all three heads breathe down their lanes
    hd = b.n++ % 3; a = aimAt(G, hx[hd], b.y);
    if (hd === 0) { for (i = 0; i < 8 + 2 * lvl; i++) orb(G, hx[0], b.y + 20, i * TWO_PI / (8 + 2 * lvl) + 0.2, sp * 0.8, 6, 'c_fire'); }              // fire head: a ring of embers
    else if (hd === 1) { for (i = -2; i <= 2; i++) orb(G, hx[1], b.y + 20, a + i * 0.22, sp * 0.85, 6, 'c_frost'); }                                  // frost head: an icy fan
    else { for (i = 0; i < 4 + lvl; i++) orb(G, hx[2], b.y + 20, a + (i - 1.5) * 0.08, sp * (0.9 + 0.12 * i), 6, 'c_poison'); }                       // poison head: a volley of fast darts
    return 62 * rate;
  }
  /* cyclops */                                                    // boulders fall (with markers), then a huge club slam down the middle of where you stand
  if (m % 3 !== 1) { n = 4 + lvl; for (i = 0; i < n; i++) dropH(G, 'rock', 30 + Math.floor(G.rs() * (W - 60)), 26, i * 8, 17); return 100 * rate; }
  colH(G, 'slam', clamp(Math.round(G.px), 50, W - 50), 0, H, 62, 38, 12, 0); for (i = 0; i < 12; i++) orb(G, b.x, b.y + 30, i * TWO_PI / 12 + 0.2, sp * 0.7); return 108 * rate;
}
function bossExtra(G, b, cyc, sp) {                               // extra boss skills: each time the bosses come round again they learn another attack
  var a = aimAt(G, b.x, b.y), i;
  for (i = -1; i <= 1; i++) orb(G, b.x, b.y + 24, a + i * 0.16, sp * 0.95);
  if (cyc >= 1) for (i = 0; i < 8; i++) orb(G, b.x, b.y + 24, i * TWO_PI / 8 + 0.35, sp * 0.7);
  if (cyc >= 2) colH(G, 'slam', clamp(Math.round(G.px), 40, W - 40), 0, H, 40, 36, 10, 0);
}
function updateBoss(G) {
  var b = G.boss; G.bossT++; if (b.hf > 0) b.hf--;
  var lvl = b.hp * 10 <= b.max * 3 ? 2 : b.hp * 3 <= b.max * 2 ? 1 : 0;
  if (lvl > b.lv) { b.lv = lvl; E(G, lvl === 1 ? 'angry' : 'enraged', b.kind, 0); }
  if (!b.inn) { b.y += Math.max(0.8, (168 - b.y) * 0.06); if (b.y >= 167.5) { b.y = 168; b.inn = 1; } return; }   // it glides in and slows down gently
  b.t2++; var T = b.t2, sp = Math.min(5.2, 2.5 + 0.2 * G.stage) * (1 + 0.1 * lvl) * (1 + 0.25 * ramp(G));
  if (b.mode === 1) {                                              // the griffin's dive: wind up above the lane, plunge, climb back
    b.md++; var tx0 = b.lx;
    if (b.md <= 30) { b.x += (tx0 - b.x) * 0.2; b.y += (150 - b.y) * 0.1; }
    else if (b.md <= 40) { b.y += 30; b.x = tx0; }
    else if (b.md <= 70) { b.y += (168 - b.y) * 0.12; if (b.md === 70) { b.mode = 0; b.y = 168; } }
    b.tele = b.md <= 30 ? 1 : 0; if (b.md === 36) E(G, 'bossatk', b.kind, 0); b.ph += 0.025; return;
  }
  b.ph += 0.025 * (1 + 0.25 * lvl); var tx = W / 2 + 105 * SIN(b.ph + G.stage), ty = 168 + 6 * SIN(T * 0.05), ease = 0.08 * (T < 30 ? T / 30 : 1);
  b.x += (tx - b.x) * ease; b.y += (ty - b.y) * ease;              // it follows its path smoothly
  b.xs = (b.xs || 0) - 1; if (b.xs <= 0 && T >= 150) { b.xs = Math.max(100, 240 - 35 * Math.floor(G.stage / 8)); bossExtra(G, b, Math.floor(G.stage / 8), sp); }
  b.cd--; b.tele = (b.cd <= 16 && b.cd > 0 && T > 40) ? 1 : 0;
  if (b.cd <= 0 && T >= 60) { b.cd = Math.floor(bossMove(G, b, lvl, sp) * (1 - 0.22 * ramp(G)) * (lvl === 2 ? 0.8 : 1)); E(G, 'bossatk', b.kind, 0); }
}
function startDying(G) {                                          // a slow, dramatic defeat instead of a sudden pop
  G.rbReady = 0; G.phase = 'dying'; G.clearT = 48; G.boss.dying = 1; G.boss.tele = 0; G.bl = []; G.hz = []; G.inv = Math.max(G.inv, 150);
  E(G, 'bossdying', G.boss.kind, G.stage);
}
function endBoss(G, beaten) {
  var b = G.boss; G.bl = []; G.hz = []; G.boss = null; G.rbReady = 0;
  if (beaten) {                                                    // the defeat animation is over: go straight to the Wild Cards (no diamond shower: the cards are the reward)
    G.score += 400 * (G.stage + 1); G.bosses++; if (G.stage % 2 === 1 && G.wl < WL_MAX) G.coreOwed = 1;   /* beating the boss of every second Level (2, 4, 6...) earns a Star Core */ if (!G.bossHit) { G.flaw = 1; G.flawless++; E(G, 'flawless', b.kind, 0); }   // beat it without a single hit: a Prismatic Wild Card is guaranteed
    G.phase = 'cards'; G.cardRe = 0; G.cdCur = ''; drawCards(G);
    E(G, 'bossdead', b.kind, G.stage); E(G, 'cards', G.stage, 0);
  } else { G.phase = 'clear'; G.clearT = 90; E(G, 'bossflee', b.kind, 0); }
}

/* ---------------- the unicorn's straight beams ---------------- */
function fire(G, noMain) {
  var lanes = Math.min(MAXBEAMS, G.U.lanes + (G.pw.triple > 0 ? G.pwBeams : 0) + G.wc.beam), dmg = G.U.dmg * dmgMul(G) * (G.oc > 0 ? 1.5 : 1) * WL_DMG[G.wl], pierce = G.U.pierce + (G.pw.coffee > 0 || G.hyper > 0 ? 1 : 0) + (G.pw.pierce > 0 ? 2 : 0) + WL_PIERCE[G.wl], w = 4, crit, cp = G.wc.crit * 100;   // power-ups ADD to the beams you already have (from the shop), up to the cap
  for (var i = 0; i < lanes && !noMain; i++) { crit = cp > 0 && ((G.t * 37 + i * 11) % 100) < cp; G.sh.push({ x: G.px + (i - (lanes - 1) / 2) * 12, y: G.py - 34, dmg: crit ? dmg * 2 : dmg, pierce: pierce, w: w, c: crit ? 1 : 0 }); }   // every beam goes straight up; Lucky Star makes some of them crit for double damage
  if ((G.pw.spread > 0 || G.wc.fan) && !noMain) { G.sh.push({ x: G.px - 12, y: G.py - 30, dmg: dmg, pierce: pierce, w: w, c: 0, vx: -3.4 }); G.sh.push({ x: G.px + 12, y: G.py - 30, dmg: dmg, pierce: pierce, w: w, c: 0, vx: 3.4 }); }   // the fan
  if (G.wl >= 2 && !noMain) { var sv = G.wl >= 5 ? [-1.8, 1.8, -3.6, 3.6] : [-1.8, 1.8]; for (var z = 0; z < sv.length; z++) G.sh.push({ x: G.px + sv[z] * 5, y: G.py - 30, dmg: dmg * 0.6, pierce: pierce, w: 5, c: 0, vx: sv[z], st: 1 }); }   // Twin Stars (level 2) and the Rainbrew Storm (level 5): small star bolts angle out beside your beams
  if (G.oc > 0 && !noMain) { var ov = [-5.2, -2.1, 2.1, 5.2]; for (var q = 0; q < 4; q++) G.sh.push({ x: G.px + ov[q] * 5, y: G.py - 30, dmg: dmg * 0.8, pierce: pierce + 1, w: 8, c: 0, vx: ov[q], oc: 1 }); }   // OVERCHARGED: four wide rainbow beams fan out beside your own, and every beam hits 50% harder
  if (G.pw.helpers > 0 || G.U.helpers) { G.sh.push({ x: G.px - 46, y: G.py - 14, dmg: 1, pierce: 0, w: w }); G.sh.push({ x: G.px + 46, y: G.py - 14, dmg: 1, pierce: 0, w: w }); }   // two little helpers shoot straight up beside you
  E(G, 'shoot', 0, 0);
}

/* ---------------- consequences ---------------- */
var WL_MAX = 5, WL_DMG = [1, 1.1, 1.1, 1.1, 1.25, 1.25], WL_PIERCE = [0, 0, 0, 1, 1, 2], WL_RATE = [1, 1, 1, 0.9, 0.9, 0.82];
var WL_NAMES = ['', 'Bright Beams', 'Twin Stars', 'Piercing Light', 'Comet Tail', 'Rainbrew Storm'];   // WEAPON LEVELS: each Star Core you catch upgrades your shooting for the rest of the flight
function weaponUp(G) { if (G.wl >= WL_MAX) return false; G.wl++; E(G, 'wlevel', G.wl, 0); return true; }
var REVIVE_COST = 250, REVIVE_MAX = 2;
function revive(G) {                                             // Continue?: 1 life for 250 gems (taken from this run's diamonds first, the rest from your wallet)
  if (!G.over || G.reason !== 'lives' || G.revives >= REVIVE_MAX) return false;
  G.over = 0; G.reason = ''; G.lives = 1; G.inv = 90; G.revives++; G.rvLog.push(G.t); G.gems -= Math.min(G.gems, REVIVE_COST); G.combo = 0;
  G.bl = []; G.ice = []; G.hz = []; G.stone = 0; E(G, 'revive', 0, 0); return true;
}
function hurt(G) {
  if (G.inv > 0 || G.star > 0 || G.magic > 0) return;
  G.nh = 0; if (G.boss) G.bossHit = 1;
  if (G.shield) { G.shield = 0; G.regenT = 0; G.inv = 30; E(G, 'shield', 0, 0); return; }
  G.hits++; G.combo = 0; G.inv = G.env === 'phoenix' ? Math.max(4, Math.round(48 - 34 * G.es)) : 48;
  if (G.M.inf) { G.score = Math.max(0, G.score - 100); E(G, 'hurt', -1, 0); return; }
  G.lives--; E(G, 'hurt', G.lives, 0);
  if (G.lives <= 0) { G.over = 1; G.reason = 'lives'; }
}
function startOc(G) { if (G.nh >= 100 && G.oc <= 0 && G.phase === 'wave') { G.oc = OC_STEPS; G.nh = 0; G.ocs++; E(G, 'overload', 0, 0); } }   // OVERCHARGE: 8 seconds of a stronger attack
function killEnemy(G, e) { var pts = ENEMIES[e.k].pts * mult(G) * (e.ovHit ? 0.3 : 1);   /* creatures the Overload beams touched are worth 30%: the extra firepower must not inflate the score */ pts = Math.max(1, Math.round(pts)); G.score += pts; G.combo++; if (G.combo > G.maxCombo) G.maxCombo = G.combo; G.comboT = 90; G.kills++; dropGems(G, e.k, e.x, e.y); dropHeart(G, e.k, e.x, e.y); dropWeapon(G, e.k, e.x, e.y); dropMystery(G, e.k, e.x, e.y); if (!e.ocHit && G.oc <= 0) { G.nh++; startOc(G); } var was = G.elem; if (G.ultT <= 0) G.elem = Math.min(ELEM_MAX, G.elem + (ELEM_KILL + G.wc.ult) * (G.env === 'hydra' ? 1 - 0.75 * G.es : 1)); if (G.ultT <= 0 && was < ELEM_MAX && G.elem >= ELEM_MAX) E(G, 'ultready', 0, 0); E(G, 'kill', e.x, e.y, e.k); }
function damage(G, e, d) { e.hp -= d; e.hf = 3; G.hitsDealt++; E(G, 'hit', e.x, e.y, e.k); if (e.hp <= 0) killEnemy(G, e); }   // every hit scores a little; a defeat scores a lot
function clearScreen(G) { var i; for (i = 0; i < G.en.length; i++) G.score += ENEMIES[G.en[i].k].pts; G.en = []; G.bl = []; G.ice = []; G.hz = []; }
function useSkill(G) {                                           // RAINBREW POWER: every unicorn has its own, and every one wipes the whole screen (the meter fills 0.5% per defeat: 200 defeats)
  if (G.elem < ELEM_MAX || G.phase === 'clear' || G.phase === 'dying' || G.phase === 'cards' || G.over || G.ultT > 0) return;
  G.elem = 0; G.skillsUsed++; G.ultHit = 0;
  var u = G.uni, b = G.boss, i, e, m = mult(G), n = 0;
  G.ultK = u;
  if (u === 'frost') G.ultT = 150;                                                                   // Starfall Barrage: time slows to a crawl while stars rain on your enemies
  else if (u === 'solar') G.ultT = 80;                                                               // Prismatic Beam: one huge piercing rainbow beam up your column
  else if (u === 'void') { G.ultT = 90; G.inv = Math.max(G.inv, 100); }                              // Event Horizon: a black hole drags everything in, then implodes
  else if (u === 'emerald') { G.ultT = 60; G.inv = Math.max(G.inv, 150); if (G.lives < G.maxL) G.lives++; }   // Astral Stampede: invincible, with a herd of astral beasts charging up the screen
  else {                                                                                             // Dawn Break (Golden Sun): the whole screen is wiped at once, then a long hyper-fire
    for (i = 0; i < G.en.length; i++) { e = G.en[i]; if (e.hp <= 0) continue; e.hp = 0; G.score += ENEMIES[e.k].pts * m * 2; G.kills++; G.combo++; if (G.combo > G.maxCombo) G.maxCombo = G.combo; G.comboT = 120; n++; mkItem(G, 'gem', e.x - 14, e.y, 0, 5); E(G, 'boom', e.x, e.y, e.k); }
    for (i = 0; i < G.bl.length; i++) E(G, 'boom', G.bl[i].x, G.bl[i].y, 'orb');
    G.en = []; G.bl = []; G.ice = []; G.hz = []; G.stone = 0;
    if (b && b.hp > 0 && b.y > 20) { b.hp -= Math.ceil(b.max * 0.35); b.cd += 60; b.hf = 8; G.hitsDealt++; if (b.hp < 0) b.hp = 0; }
    G.hyper = 240; G.inv = Math.max(G.inv, 150); if (G.lives < G.maxL) G.lives++; G.shield = 1; G.ultT = 12;
  }
  if (u !== 'golden') { n += rainbrewBlast(G); hitBoss(G, 0.1); if (b) b.cd += 30; }   // ...and a screen-clearing blast on top of its own show
  E(G, 'skill', u, n);
}
function rainbrewBlast(G) {                                       // Rainbrew Power clears every creature, shot, shard and attack lane on screen at once (they do not feed the Overload streak)
  var i, e, n = 0;
  for (i = 0; i < G.en.length; i++) { e = G.en[i]; if (e.hp > 0) { e.ocHit = 1; damage(G, e, 99999); n++; } }
  for (i = 0; i < G.bl.length; i++) E(G, 'boom', G.bl[i].x, G.bl[i].y, 'orb');
  G.bl = []; G.ice = []; G.hz = []; G.stone = 0;
  return n;
}
function wipe(G, test, dmg) {                                      // helper for the ULTs: hit every creature that passes a test, clear shots and ice shards with it
  var i, e, o, x;
  for (i = 0; i < G.en.length; i++) { e = G.en[i]; if (e.hp > 0 && test(e.x, e.y, e.r)) damage(G, e, dmg); }
  var a = []; for (i = 0; i < G.bl.length; i++) { o = G.bl[i]; if (!test(o.x, o.y, o.r)) a.push(o); else E(G, 'boom', o.x, o.y, 'orb'); } G.bl = a;
  a = []; for (i = 0; i < G.ice.length; i++) { o = G.ice[i]; if (!test(o.x, o.y, 14)) a.push(o); } G.ice = a;
}
function hitBoss(G, frac) { var b = G.boss; if (b && b.hp > 0 && b.y > 20) { b.hp -= b.max * frac; b.hf = 3; G.hitsDealt++; if (b.hp < 0) b.hp = 0; } }
function ultStep(G) {
  if (G.ultT <= 0) return;
  var u = G.ultK, t = G.ultT, i, e, b = G.boss, px = G.px, py = G.py;
  if (u === 'frost') {                                              // a bolt from the sky every fifth step: 30 bolts, 30% of a boss; its attacks slow to a crawl too
    if (b && b.hp > 0) b.cd += 0.65;
    if (t % 5 === 0) { var tg = [], k; for (i = 0; i < G.en.length; i++) if (G.en[i].hp > 0 && G.en[i].y > 0) tg.push(G.en[i]); if (b && b.hp > 0 && b.y > 20 && (!tg.length || G.rs() < 0.5)) { hitBoss(G, 0.01); E(G, 'ultbolt', b.x, b.y); } else if (tg.length) { e = tg[Math.floor(G.rs() * tg.length)]; E(G, 'ultbolt', e.x, e.y); damage(G, e, 8); } }
  } else if (u === 'solar') {                                       // the beam hits everything in a wide column above you, every step
    wipe(G, function (x, y, r) { return y < py + 10 && Math.abs(x - px) < r + 46; }, 3);
    if (b && b.hp > 0 && b.y > 20 && Math.abs(b.x - px) < 100) { hitBoss(G, 0.004); b.cd += 0.7; }
  } else if (u === 'void') {                                        // a black hole above you pulls everything in and crushes it, then implodes
    var cx = px, cy = Math.max(150, py - 90); G.magnetT = Math.max(G.magnetT, 2);
    for (i = 0; i < G.en.length; i++) { e = G.en[i]; if (e.hp <= 0) continue; e.x += (cx - e.x) * 0.07; e.y += (cy - e.y) * 0.07; if (t % 3 === 0 && Math.hypot(e.x - cx, e.y - cy) < 80) damage(G, e, 3); }
    var ob = []; for (i = 0; i < G.bl.length; i++) { if (Math.hypot(G.bl[i].x - cx, G.bl[i].y - cy) >= 170) ob.push(G.bl[i]); } G.bl = ob;
    if (t === 1) { for (i = 0; i < G.en.length; i++) { e = G.en[i]; if (e.hp > 0 && Math.hypot(e.x - cx, e.y - cy) < 300) damage(G, e, 999); } G.bl = []; G.ice = []; hitBoss(G, 0.3); if (b) b.cd += 45; for (i = 0; i < 6; i++) mkItem(G, 'gem', cx + (i - 3) * 22, cy, 0, 5); E(G, 'implode', cx, cy); }
  } else if (u === 'emerald') {                                     // a band of astral beasts charges from your feet to the top of the screen
    var by = py - (60 - t) * (py / 60);
    wipe(G, function (x, y, r) { return Math.abs(y - by) < r + 45; }, 999);
    if (!G.ultHit && b && b.hp > 0 && by <= b.y + 70) { G.ultHit = 1; hitBoss(G, 0.28); b.cd += 40; }
  }
  G.ultT--; if (G.ultT <= 0) G.ultK = '';
}
function skillStep(G) { if (G.hyper > 0) G.hyper--; if (G.magnetT > 0) G.magnetT--; ultStep(G); }
function rainbrewPower(G) {                                      // RAINBREW POWER: an instant, huge hit on the boss, the screen is cleared, 8 s untouchable with every power on, a rain of gems, and a FAST surge of fire
  var b = G.boss, dmg = 0;
  G.surges++; G.rbUsed++; G.magic = 240; G.inv = Math.max(G.inv, 240); clearScreen(G);
  for (var i = 0; i < POWERS.length; i++) G.pw[POWERS[i]] = Math.max(G.pw[POWERS[i]], 240);
  G.hyper = Math.max(G.hyper, 240);
  if (b) { dmg = Math.ceil(b.max * RB_DMG); b.hp -= dmg; if (b.hp < 0) b.hp = 0; b.hf = 6; }
  G.score += 300 * (G.stage + 1); E(G, 'rbrel', 1, dmg);
}
function collect(G, it) {
  var k = it.k;
  if (k === 'gem') { G.gems++; E(G, 'gem', it.x, it.y); return; }
  if (k === 'mystery') { mysteryBox(G); return; }
  if (k === 'core') { G.coreOwed = 0; if (!weaponUp(G)) G.gems += 10; return; }
  if (k === 'heart') { if (G.lives < G.maxL) G.lives++; E(G, 'heart', it.x, it.y); return; }
  G.caught++;
  if (k === 'coffee') { G.pw.coffee = COFFEE_STEPS * (G.wc.boost2 ? 2 : 1); E(G, 'power', 'coffee', 0); }
  else if (k === 'triple') { var room = Math.max(0, MAXBEAMS - G.U.lanes), add = Math.min(2, room); G.pwBeams = add; if (add > 0) G.pw.triple = POWER_STEPS; else G.gems += 10; E(G, 'power', 'triple', add); }   // BEAM UP: +2 beams (or +1, or a gem bonus at the cap) added to whatever you already have
  else if (k === 'helpers') { G.pw.helpers = POWER_STEPS; E(G, 'power', 'helpers', 0); }
  else if (k === 'charm') { G.charm = Math.min(5, G.charm + 1); E(G, 'power', 'charm', G.charm); }               // the Rainbrew Charm stays with you for the whole flight: +8% damage and +6% fire rate each (up to 5)
  else if (k === 'spread') { G.pw.spread = POWER_STEPS; E(G, 'power', 'spread', 0); }                  // FAN SHOT: two angled beams on top of your own
  else if (k === 'pierce') { G.pw.pierce = POWER_STEPS; E(G, 'power', 'pierce', 0); }                  // PIERCING: every beam passes through two more creatures
  else if (k === 'shield') { G.shield = 1; E(G, 'power', 'shield', 0); }
}

/* ---------------- one step of the world ---------------- */
function stepGame(G, dx, dy, skill, rb) {
  if (G.over || G.phase === 'cards') return;                        // nothing moves while you choose a Wild Card
  var M = G.M, i, j, e, b, s, it, sp, k;
  G.t++;
  if (G.oc > 0) G.oc = G.phase === 'boss' || G.phase === 'dying' ? 0 : G.oc - 1;                                                                           // Overcharged: a stronger attack for a few seconds (see fire)
  if (G.jinx > 0) G.jinx--;
  k = Math.min(MAXBEAMS, G.U.lanes + (G.pw.triple > 0 ? G.pwBeams : 0) + G.wc.beam) + ((G.pw.spread > 0 || G.wc.fan) ? 2 : 0) + (G.oc > 0 ? 4 : 0); if (k > G.bp) G.bp = k;
  var env = envOf(G); G.env = env; G.es = envStr(G); var lim = G.stone > 0 ? 13 : Math.floor(32 * (1 + moveBonus(G))); if (G.stone > 0) G.stone--; if (env === 'griffin') lim = Math.max(6, Math.floor(lim * (1 - 0.6 * G.es)));        // High Winds: slow flying                     // Medusa's gaze slows you for a moment
  dx = clamp(dx | 0, -lim, lim); dy = clamp(dy | 0, -lim, lim);
  var nx = clamp(G.px + dx, 20, W - 20), ny = clamp(G.py + dy, 130, H - 36); if (env === 'griffin') nx = clamp(nx + Math.round(5 * G.es * SIN(G.t * 0.05)), 20, W - 20); else if (env === 'kraken') ny = clamp(ny + Math.round(4 * G.es), 130, H - 36); else if (env === 'cyclops' && G.t % 60 === 0) nx = clamp(nx + Math.round(((G.t / 60 | 0) % 2 ? -30 : 30) * G.es), 20, W - 20);   // gusts, an undertow, tremors
  G.pdx = nx - G.px; G.pdy = ny - G.py; G.px = nx; G.py = ny;
  if (skill) useSkill(G);
  if (rb && G.rbReady && G.phase === 'boss' && G.boss && G.boss.inn && G.boss.hp > 0) { G.rbReady = 0; rainbrewPower(G); }   // Rainbrew Power: only in a boss fight, once the boss has arrived, once per fight
  var frozen = G.freeze > 0; if (frozen) G.freeze--;
  var sl = G.ultK === 'frost' && G.ultT > 0 ? 0.35 : 1;                              // Starfall Barrage: time crawls
  if (G.inv > 0) G.inv--; if (G.star > 0) G.star--; if (G.magic > 0) G.magic--;
  for (i = 0; i < POWERS.length; i++) { k = POWERS[i]; if (G.pw[k] > 0) G.pw[k]--; }
  if (G.wc.regen) { if (G.shield) G.regenT = 0; else if (++G.regenT >= 750) { G.shield = 1; G.regenT = 0; E(G, 'regen', 0, 0); } }   // Aegis Bloom: a shield grows back after 25 s without a hit
  if (G.comboT > 0) { G.comboT--; if (G.comboT === 0) G.combo = 0; }
  if (G.t >= M.maxSec * SPS) { G.over = 1; G.reason = 'time'; return; }
  var rp = ramp(G), fast = (G.magic > 0 ? 2.2 : 1) * (1 + 0.45 * G.hype);                 // Rainbrew Magic: the world rushes past 2.2x faster; before a boss (Ranked) it speeds up too
  // levels and bosses
  if (G.phase === 'wave') {
    G.levelT++;
    if (!bossLevel(G) && G.levelT === 300 && !(G.magic > 0)) givePower(G);
    if (!bossLevel(G) && G.levelT === 120 && G.coreOwed && G.wl < WL_MAX && G.it.every(function (o) { return o.k !== 'core'; })) { mkItem(G, 'core', 90 + Math.floor(G.rd() * 180), -20, 0, 1.5); E(G, 'capsule', 'core', 0); }   // the Star Core you earned by beating the boss of every second Level falls in the next Level's phases (each phase again until you catch it)
    G.hype = M.hype && !bossLevel(G) && levelIn(G) === BOSS_EVERY - 1 ? clamp((G.levelT - (LEVEL_STEPS - 360)) / 360, 0, 1) : 0;     // Ranked: the last 12 seconds before a boss build up tension
    if (bossLevel(G)) { if ((G.en.length === 0 && G.levelT > 30) || G.levelT > 150) { G.en = []; startBoss(G); } }
    else {
      if (G.levelT >= LEVEL_STEPS && (G.en.length === 0 || G.levelT >= LEVEL_STEPS + 360)) {   // the phase is over once every creature has been beaten or has flown past
        G.score += 40 * (G.stage + 1); G.gems += 2 + G.stage; E(G, 'levelup', G.level, 0);
        if (M.boss && G.level % BOSS_EVERY === BOSS_EVERY - 1) { G.phase = 'warn'; G.warnT = 90; G.hype = M.hype ? 1 : 0; E(G, 'bosswarn', BOSS_KINDS[G.stage % BOSS_KINDS.length], 0); }   // the warning screen: BOSS APPROACHING
        else { G.level++; G.levelT = 0; E(G, 'level', G.level, 0); }
      }
      if (!bossLevel(G)) {
        G.waveT--; if (G.magic > 0) G.waveT--; if (G.levelT < LEVEL_STEPS && G.en.length < 3 && G.waveT > 8 && G.magic <= 0 && G.ultT <= 0 && G.hyper <= 0 && !G.noRefill) G.waveT = 8; if (G.waveT <= 0 && G.levelT < LEVEL_STEPS) spawnWave(G);   // no new creatures once the phase's last group is out
      }   // the screen is never left empty: the next group comes within a quarter of a second whenever almost nobody is left
    }
  } else if (G.phase === 'warn') {
    G.warnT--; if (G.warnT <= 0) { G.phase = 'wave'; G.level++; G.levelT = 0; G.hype = 0; E(G, 'level', G.level, 0); }
  } else if (G.phase === 'boss') {
    var lv0 = G.boss.lv; if (frozen) { if (G.boss.hf > 0) G.boss.hf--; } else updateBoss(G);
    if (G.boss.lv > lv0 && G.boss.lv === 1) { mkItem(G, G.stage >= 1 ? 'pierce' : 'triple', 60 + Math.floor(G.rd() * 240), -20, 0, 1.7); G.powGiven++; E(G, 'capsule', G.stage >= 1 ? 'pierce' : 'triple', 0); }
    if (G.boss.hp <= 0) startDying(G); else if (G.bossT > BOSS_MAX) endBoss(G, false);
  } else if (G.phase === 'dying') {
    if (G.boss.hf > 0) G.boss.hf--; G.clearT--; if (G.clearT <= 0) endBoss(G, true);
  } else if (G.phase === 'clear') {
    G.clearT--; if (G.clearT <= 0) nextStage(G);
  }
  if (G.phase !== 'wave') G.cm = null; else if (!G.cm && G.cometDone !== G.stage && levelIn(G) === G.cometLv && G.levelT >= 240 && G.magic === 0 && !bossLevel(G)) spawnComet(G);
  if (G.cm) updateComet(G);
  if (G.t >= G.nextIce && G.magic === 0 && G.phase === 'wave' && G.level + G.stage >= 2) spawnIce(G);
  if (G.magic > 0) { if (G.magic % 8 === 0) mkItem(G, 'gem', 24 + Math.floor(G.rd() * (W - 48)), -12, 0, 4.5); if (G.magic % 15 === 0) E(G, 'sparkle', G.px, G.py, 0); }   // a rain of gems
  // shooting
  G.fireCd -= G.jinx > 0 ? 0.5 : 1; if (G.fireCd <= 0) { fire(G, false); G.fireCd += Math.max(1.1, (G.pw.coffee > 0 || G.hyper > 0 ? Math.max(1.25, G.U.cd * 0.5) : G.U.cd) * (G.env === 'medusa' ? 1 + 1.0 * G.es : 1) * WL_RATE[G.wl] / (1 + 0.06 * G.charm)); }   // coffee: twice the fire rate (and a little more damage and piercing); Freezing Air slows shooting          // (the remainder carries over, so an upgraded rate like 3.7 steps is exact on average)   // coffee: an energy boost, you shoot faster
  // movement
  for (i = 0; i < G.sh.length; i++) if (G.sh[i].vx) G.sh[i].x += G.sh[i].vx;
  for (i = 0; i < G.sh.length; i++) G.sh[i].y -= env === 'cerberus' ? Math.max(6, Math.round(20 - 12 * G.es)) : 20;
                       // Thick Ash: slower shots
  if (!frozen) for (i = 0; i < G.bl.length; i++) { b = G.bl[i]; b.x += b.vx * sl; b.y += b.vy * sl; }
  for (i = 0; i < G.en.length; i++) {
    e = G.en[i]; if (e.hf > 0) e.hf--; var ox = e.x, oy = e.y;
    if (!frozen) {
      e.t++; var ph = e.t % 120, lunge = e.role === 'b' && e.y > 80 && e.y < 360 && ph >= 100 && ph < 116 ? 2.4 : 1;   // tanks wind up (a shake and a flash at 90-100) and then lunge down at you
      e.y += e.vy * fast * lunge * sl; if (e.sway) e.x = e.x0 + e.sway * SIN(e.t * 0.05 + e.ph * 0.1);
      var every = Math.floor(56 / (1 + 0.6 * rp));                                                                         // shooters glow before they fire; in Ranked they fire faster and in bursts as time goes on
      if (e.role === 'c' && e.y > 60 && e.y < 330 && e.t % every === 0) { var aa = aimAt(G, e.x, e.y), sp2 = 4.1 * (1 + 0.25 * rp); orb(G, e.x, e.y + 14, aa, sp2, 4.5, e.k); if (rp > 0.55 && e.t % (every * 3) === 0) { orb(G, e.x, e.y + 14, aa - 0.28, sp2, 4.5, e.k); orb(G, e.x, e.y + 14, aa + 0.28, sp2, 4.5, e.k); } }   // creature shots: smaller (4.5) but faster (+35%)
    }
    e.dx = e.x - ox; e.dy = e.y - oy;
  }
  skillStep(G);
  if (G.phase !== 'wave') G.ice = [];
  for (i = 0; i < G.ice.length; i++) { sp = G.ice[i]; if (frozen) continue; if (sp.w > 0) { sp.w--; if (sp.w === 0) E(G, 'iceshard', sp.x, 0); } else sp.y += sp.vy * sl; }   // ice shards: a static marker first, then a fast fall
  var mr = G.magic > 0 ? 220 : (G.pw.coffee > 0 || G.magnetT > 0) ? 160 : 0; if (G.wc.magnet) mr += 70 * G.wc.magnet;                            // coffee and Rainbrew Magic pull gems towards you
  for (i = 0; i < G.it.length; i++) {
    it = G.it[i]; it.t++; var ix = it.x, iy = it.y;
    if (mr && it.k === 'gem') { var ddx = G.px - it.x, ddy = G.py - it.y, dd = ddx * ddx + ddy * ddy; if (dd < mr * mr) { var d = Math.sqrt(dd) || 1; it.x += ddx / d * 8; it.y += ddy / d * 8; } else it.y += it.vy * fast; }
    else { it.x += it.vx; it.y += it.vy * (it.k === 'logo' ? 1 : fast) + (it.k === 'logo' ? 0.9 * SIN(it.t * 0.07) : 0); }
    it.dx = it.x - ix; it.dy = it.y - iy;
  }
  for (i = 0; i < G.it.length; i++) { var a1 = G.it[i]; if (a1.k === 'logo') continue; for (j = i + 1; j < G.it.length; j++) { var a2 = G.it[j]; if (a2.k === 'logo') continue; if (Math.abs(a1.x - a2.x) < 30 && Math.abs(a1.y - a2.y) < 30) { var dr = a1.x <= a2.x ? -1 : 1; a1.x = clamp(a1.x + dr * 2.5, 24, W - 24); a2.x = clamp(a2.x - dr * 2.5, 24, W - 24); } } }   // pickups gently push apart: nothing sits on top of anything else
  if (!frozen) updateHazards(G);
  // our beams
  for (i = 0; i < G.sh.length; i++) {
    s = G.sh[i]; if (s.dead) continue;
    for (j = 0; j < G.en.length; j++) {
      e = G.en[j]; if (e.hp <= 0 || s.hit === e) continue;
      if (Math.abs(s.x - e.x) < e.r + s.w && Math.abs(s.y - e.y) < e.r + 12) { s.hit = e; if (s.oc) { e.ocHit = 1; e.ovHit = 1; } damage(G, e, s.dmg); if (s.pierce > 0) s.pierce--; else { s.dead = 1; break; } }
    }
    if (s.dead) continue;
    if (G.cm && G.cm.hp > 0 && Math.abs(s.x - G.cm.x) < 26 + s.w && Math.abs(s.y - G.cm.y) < 30) { G.cm.hp -= s.dmg; G.cm.hf = 3; G.hitsDealt++; E(G, 'cmhit', G.cm.x, G.cm.y); if (s.pierce > 0) s.pierce--; else s.dead = 1; if (G.cm.hp <= 0) cometBurst(G); }
    if (s.dead) continue;
    b = G.boss; if (b && b.y > 30 && b.hp > 0 && Math.abs(s.x - b.x) < 58 + s.w && Math.abs(s.y - b.y) < 58) { b.hp -= s.dmg; b.hf = 3; G.hitsDealt++; s.dead = 1; if (b.hp < 0) b.hp = 0; E(G, 'bosshit', s.x, s.y); }   // (Overload is for creatures only: hitting a boss does not charge it)
  }
  // getting hurt: creatures, orbs, ice shards, the boss and its attacks
  for (j = 0; j < G.en.length && !G.over; j++) { e = G.en[j]; if (e.hp <= 0) continue; var cx = e.x - G.px, cy = e.y - G.py, cr = e.r + PR; if (cx * cx + cy * cy <= cr * cr) { var safe = G.inv > 0 || G.star > 0 || G.magic > 0; hurt(G); if (!safe || G.star > 0 || G.magic > 0) { e.hp = 0; E(G, 'crash', e.x, e.y); if (G.star > 0 || G.magic > 0) killEnemy(G, e); } } }
  for (j = 0; j < G.bl.length && !G.over; j++) { b = G.bl[j]; var ox2 = b.x - G.px, oy2 = b.y - G.py, orr = b.r + PR - 3; if (ox2 * ox2 + oy2 * oy2 <= orr * orr) { hurt(G); b.dead = 1; } else if (!b.cc && b.r < 12 && ox2 * ox2 + oy2 * oy2 <= (orr + 13) * (orr + 13)) { b.cc = 1; G.cc++; E(G, 'close', b.x, b.y); } }   // a close call
  for (j = 0; j < G.ice.length && !G.over; j++) { sp = G.ice[j]; if (sp.w <= 0 && !sp.dead) { var sx = sp.x - G.px, sy = sp.y - G.py, swr = 11 + PR - 3, tx = sp.y - 24 - G.py, twr = 10 + PR - 3; if (sx * sx + sy * sy <= swr * swr || (sx * sx + tx * tx <= twr * twr)) { hurt(G); sp.dead = 1; } } }
  if (!G.over && !frozen) hazardHit(G);
  if (G.boss && G.boss.hp > 0 && G.boss.y > 30 && !G.over) { var qx = G.boss.x - G.px, qy = G.boss.y - G.py, qr = G.boss.r + PR - 8; if (qx * qx + qy * qy <= qr * qr) hurt(G); }
  // collecting gems and power-up capsules
  for (i = 0; i < G.it.length; i++) { it = G.it[i]; var pr = it.k === 'logo' ? 36 : PR + 16, px2 = it.x - G.px, py2 = it.y - G.py; if (px2 * px2 + py2 * py2 <= pr * pr) { collect(G, it); it.dead = 1; } }
  // tidy up (the lists keep their order, so everyone gets the same result)
  var a = []; for (i = 0; i < G.en.length; i++) { e = G.en[i]; if (e.hp > 0 && e.y < H + 40) a.push(e); } G.en = a;
  a = []; for (i = 0; i < G.bl.length; i++) { b = G.bl[i]; if (!b.dead && b.y > -30 && b.y < H + 30 && b.x > -30 && b.x < W + 30) a.push(b); } G.bl = a;
  a = []; for (i = 0; i < G.sh.length; i++) { s = G.sh[i]; if (!s.dead && s.y > -30) a.push(s); } G.sh = a;
  a = []; for (i = 0; i < G.ice.length; i++) { sp = G.ice[i]; if (!sp.dead && sp.y < H + 40) a.push(sp); } G.ice = a;
  a = []; for (i = 0; i < G.it.length; i++) { it = G.it[i]; if (it.dead || it.y >= H + 30 || it.x < -70 || it.x > W + 70) continue; a.push(it); } G.it = a;
}

/* ---------------- recording a flight: one character per step per axis; ULT presses listed by step ---------------- */
function encodeTraj(deltas) { var s = ''; for (var i = 0; i < deltas.length; i++) s += String.fromCharCode(79 + clamp(deltas[i] | 0, -MAXSTEP, MAXSTEP)); return s; }
function parseRb(str) { var o = { s: [], e: [] }, a = String(str || '').split(','), i, p; for (i = 0; i < a.length; i++) { p = a[i].split('-'); if (p.length === 2) { o.s.push(+p[0]); o.e.push(+p[1]); } } return o; }   // the steps where the Rainbrew Power button was tapped: "12-12,300-300"
function simulate(seed, mode, uni, traj, keepEv, skills, up, cards, revives, rbs) {
  var G = newGame(seed, mode, uni, up), n = Math.floor(traj.length / 2), ki = 0, ci = 0, scr = cards ? String(cards).split(';') : [], rv = revives ? String(revives).split(',').map(Number) : [], j, ch, rbp = parseRb(rbs), rbI = 0, held; G.keepEv = !!keepEv; skills = skills || [];
  for (var i = 0; i < n; i++) {
    if (G.over) { if (rv.length && rv[0] === G.t && revive(G)) { rv.shift(); } else break; }       // the player paid to continue: the flight goes on
    if (G.phase === 'cards') {                                    // the Wild Card screen: replay the choices the player made (picks and reshuffles)
      var sc = scr[ci++] || ''; for (j = 0; j < sc.length && G.phase === 'cards'; j++) { ch = sc.charAt(j); if (ch === 'r') cardReshuffle(G); else cardPick(G, +ch); }
      if (G.phase === 'cards') break;
    }
    var kk = 0; while (ki < skills.length && skills[ki] <= i + 1) { if (skills[ki] === i + 1) kk = 1; ki++; }
    while (rbI < rbp.s.length && rbp.e[rbI] < i + 1) rbI++; held = rbI < rbp.s.length && rbp.s[rbI] <= i + 1 ? 1 : 0;
    stepGame(G, traj.charCodeAt(2 * i) - 79, traj.charCodeAt(2 * i + 1) - 79, kk, held); G.used = i + 1;
  }
  if (G.over && rv.length && rv[0] === G.t) revive(G);
  if (G.used === undefined) G.used = 0; return G;
}
/* ===== END SIM ===== */
var RULES_VERSION = SIM_VERSION;                                       // (the server and the game must run the same simulation version)

var CODE_VERSION = '5.0';     // release number: this script, the game (index.html) and the staff page (verify.html) must all show the same one
var COL = { MS: 1, WHEN: 2, SEASON: 3, MODE: 4, NAME: 5, CONTACT: 6, PID: 7, SCORE: 8, CODE: 9, RISK: 10, STATUS: 11, SID: 12, COMBO: 13, CATCHES: 14, SECS: 15, EVENTS: 16, CLAIMED_AT: 17, CLAIMED_BY: 18, NOTE: 19, UNI: 20, UNAME: 21, CONSENT: 22 };
var HEADERS = ['Ms', 'When', 'Season', 'Mode', 'Name', 'Contact', 'PID', 'Score', 'Code', 'Risk', 'Status', 'SID', 'MaxCombo', 'Catches', 'GameSecs', 'Events', 'ClaimedAt', 'ClaimedBy', 'Note', 'Unicorn', 'Unicorn Name', 'Consent'];

/* ---------- one-time setup: run this function once from the editor ---------- */
function setup() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', randStr(48));
  if (!p.getProperty('ADMIN_KEY')) p.setProperty('ADMIN_KEY', randStr(14));
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  p.setProperty('SHEET_ID', ss.getId());
  var sh = ss.getSheetByName(CONFIG.SHEET) || ss.insertSheet(CONFIG.SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  // keep names, phone numbers, ids and codes as plain text (no lost leading zeros, no formula injection)
  textColumns(sh);
  try { installTriggers(); } catch (e) { Logger.log('Could not install the 1-minute board refresh (' + e + '). Run installTriggers once by hand.'); }
  Logger.log('Setup done. Now deploy the web app, then run showStaffLink().\nADMIN KEY: ' + p.getProperty('ADMIN_KEY'));
}

function colLetter(c) { var s = ''; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
function textColumns(sh) {                                          // season, mode, names, phone numbers, ids and codes stay plain text (no turned-into-date seasons, no lost leading zeros, no formula injection)
  [COL.SEASON, COL.MODE, COL.NAME, COL.CONTACT, COL.PID, COL.CODE, COL.RISK, COL.STATUS, COL.SID, COL.EVENTS].forEach(function (c) { var L = colLetter(c); sh.getRange(L + '2:' + L).setNumberFormat('@'); });
}

// Run this AFTER deploying the web app. It prints ONE code (or link) that staff paste/open once in verify.html.
// ---------- your own staff PIN ----------
// 1) Change the PIN on the line marked <-- below.  2) Choose setMyStaffPin in the function list and press Run.
// Staff can then open verify.html on ANY phone or computer and type that PIN (no link or code needed).
// Use 8 or more characters with letters AND numbers. After 15 wrong tries the server locks staff access for 10 minutes.
function setMyStaffPin() {
  var MY_PIN = 'type-your-pin-here';                                   // <-- change this
  applyStaffPin(MY_PIN);
}
function applyStaffPin(pin) {
  pin = String(pin || '').trim();
  if (pin === 'type-your-pin-here' || pin.length < 6 || pin.length > 40 || /\s/.test(pin)) { Logger.log('The PIN was not changed. Use 6 to 40 characters with no spaces (8 or more with letters and numbers is safer), and change the line marked "<-- change this".'); return { ok: false }; }
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', pin); _props = {};
  CacheService.getScriptCache().remove('admfail');
  Logger.log('Staff PIN set. Anyone who knows it can open the staff page and give prizes, so keep it private. ' + (/^\d+$/.test(pin) && pin.length < 8 ? 'Tip: a PIN of only numbers is easier to guess; letters and numbers are safer.' : ''));
  return { ok: true };
}
function showStaffLink() {
  var p = PropertiesService.getScriptProperties();
  var url = String(p.getProperty('WEBAPP_URL') || ScriptApp.getService().getUrl() || '').trim().replace(/\/dev(\?.*)?$/, '/exec');   // /dev is the owner-only test address and fails for everyone else
  var key = p.getProperty('ADMIN_KEY');
  if (!url || !key) { Logger.log('Deploy the web app first (Deploy > New deployment > Web app), or set a script property WEBAPP_URL to your /exec URL. Then run this again.'); return; }
  if (!/\/exec$/.test(url)) { Logger.log('The web app address must end in /exec. Open Deploy > Manage deployments, copy the Web app URL, add it as a script property named WEBAPP_URL, and run this again.\nFound: ' + url); return; }
  Logger.log('Staff address: ' + url + '\n(If staff still see "failed to fetch": Deploy > Manage deployments > Edit > Who has access must be Anyone, then Version: New version > Deploy.)');
  var code = Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, k: key }));
  Logger.log('STAFF CODE (paste into verify.html once):\n' + code);
  if (CONFIG.SITE_URL) Logger.log('STAFF LINK (open once on the staff phone):\n' + CONFIG.SITE_URL.replace(/\/?$/, '/') + 'verify.html#s=' + code);
  else Logger.log('Tip: set CONFIG.SITE_URL to where verify.html is hosted and run this again to get a one-tap link.');
}

/* ---------- HTTP entry points ---------- */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'start') return out(actStart(p));
    if (p.action === 'lb') return out(actBoard(p));
    if (p.action === 'comp') return out(actComp());
    if (p.action === 'circle') return out(actCircle(p));
    if (p.action === 'events') return out(actEvents());
    var w = who(); return out({ ok: true, service: 'rainbrew-sky', rules: w.rules, release: w.release, server: w.server, now: Date.now() });
  } catch (err) { return out({ ok: false, err: 'server' }); }
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 1000000) return out({ ok: false, err: 'size' });
    var b = JSON.parse(raw);
    switch (b.action) {
      case 'submit': return out(actSubmit(b));
      case 'a_top': return out(admin(b, adminTop));
      case 'a_lookup': return out(admin(b, adminLookup));
      case 'a_mark': return out(admin(b, adminMark));
      case 'a_season': return out(admin(b, adminSeason));
      case 'a_comp': return out(admin(b, adminComp));
      case 'a_comp_set': return out(admin(b, adminCompSet));
      case 'a_diag': return out(admin(b, adminDiag));
      case 'a_status': return out(admin(b, adminStatus));
      case 'a_adopt': return out(admin(b, adminAdopt));
      case 'a_repair': return out(admin(b, adminRepair));
      case 'a_comp_clear': return out(admin(b, adminCompClear));
      case 'c_create': case 'c_join': case 'c_leave': case 'c_mine': case 'c_edit': case 'c_delete': case 'c_kick': return out(circleAction(b.action, b));
      case 'a_event_set': return out(admin(b, adminEventSet));
      case 'a_circles': return out(admin(b, adminCircles));
      case 'a_rename': return out(admin(b, adminRename));
      case 'a_erase': return out(admin(b, adminErase));
      case 'a_circle_status': return out(admin(b, adminCircleStatus));
      case 'a_circle_kick': return out(admin(b, adminCircleKick));
    }
    return out({ ok: false, err: 'action' });
  } catch (err) { noteFail('doPost', err); return out({ ok: false, err: 'server' }); }
}

function out(o) {
  return ContentService.createTextOutput(typeof o === 'string' ? o : JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- ranked sessions: signed seeds. The game keeps a few in its pool so it can start instantly, even offline ---------- */
function actStart(p) {
  var mode = String(p.mode || 'rank');
  if (!MODES[mode] || !MODES[mode].ranked) return { ok: false, err: 'mode' };
  var did = cleanId(p.did);
  if (!did) return { ok: false, err: 'device' };
  if (mode === 'rank') { var cmp = getComp(); if (cmp && compState(cmp, Date.now()) === 'ended') return { ok: false, err: 'closed', rules: RULES_VERSION }; }   // the competition is over: Rank is practice until staff set up the next one
  var n = Math.max(1, Math.min(CONFIG.MAX_TOKENS_PER_CALL, parseInt(p.n, 10) || 1));
  var c = CacheService.getScriptCache();
  if (c.get('st_' + did)) return { ok: false, err: 'slow' };         // at most one request per device every 2s
  c.put('st_' + did, '1', 2);
  var hk = 'th_' + did, issued = +(c.get(hk) || 0);
  if (issued + n > CONFIG.MAX_TOKENS_PER_HOUR) return { ok: false, err: 'rate' };
  c.put(hk, String(issued + n), 3600);
  var iat = Date.now(), tokens = [];
  for (var i = 0; i < n; i++) {
    var seed = courseSeed(mode);
    tokens.push({ token: makeToken({ sid: randStr(12), seed: seed, mode: mode, iat: iat, d: did, s: getSeason(mode), v: RULES_VERSION }), seed: seed, iat: iat });
  }
  var w = who(); return { ok: true, rules: w.rules, release: w.release, server: w.server, mode: mode, tokens: tokens, season: getSeason(mode), info: seasonInfo(mode) };
}

function courseSeed(mode) {
  if (mode === 'rank' && CONFIG.RANK_SHARED_COURSE) return parseInt(hmacHex('course|' + getSeason('rank')).slice(0, 8), 16) >>> 0;   // same course for everyone this season
  return Math.floor(Math.random() * 4294967296);
}

/* ---------- leaderboard: every player, served from cache (the sheet is read at most once per LB_FRESH_S) ---------- */
function actBoard(p) {
  var mode = String(p.mode || 'rank');
  if (!MODES[mode] || !MODES[mode].ranked) return { ok: false, err: 'mode' };
  var season = getSeason(mode), key = boardKey(season, mode), c = CacheService.getScriptCache();
  var off = Math.max(0, Math.min(1000000, parseInt(p.off, 10) || 0));
  var n = Math.max(1, Math.min(200, parseInt(p.n, 10) || CONFIG.LB_PAGE));
  var meta = ensureBoard(season, mode, false);
  var rows = readRows(c, key, meta, off, n);
  if (rows === null) { meta = ensureBoard(season, mode, true); rows = readRows(c, key, meta, off, n) || []; }   // a chunk was evicted: rebuild
  var w = who(), res = { ok: true, rules: w.rules, release: w.release, server: w.server, season: season, info: seasonInfo(mode), mode: mode, updated: meta.updated, players: meta.players, off: off, rows: rows };
  var pid = String(p.pid || '');
  if (/^[a-f0-9]{8}$/.test(pid) && String(p.me) === '1') {
    var me = findPlayer(c, key, meta, pid);
    if (me) res.me = me;
  }
  return res;
}
function boardKey(season, mode) { return 'lb_' + String(season).replace(/[^A-Za-z0-9]/g, '') + '_' + mode; }

// Returns the board meta, rebuilding the cached board when it is older than LB_FRESH_S.
// While one request rebuilds, other requests keep getting the previous copy, so a crowd never stampedes the sheet.
function ensureBoard(season, mode, force, preloaded) {
  var key = boardKey(season, mode), c = CacheService.getScriptCache(), raw = c.get(key + '_m');
  if (!force && raw) {
    if (c.get(key + '_f') || c.get(key + '_b')) return JSON.parse(raw);
  }
  c.put(key + '_b', '1', 20);
  var list = buildList(mode, season, preloaded), meta = { players: list.length, updated: Date.now(), chunks: 0 }, put = {};
  for (var i = 0; i < list.length; i += CONFIG.LB_CHUNK) {
    put[key + '_c' + meta.chunks] = JSON.stringify(list.slice(i, i + CONFIG.LB_CHUNK).map(function (x) { return [x.n, x.s, x.p, x.u || '']; }));
    meta.chunks++;
  }
  put[key + '_m'] = JSON.stringify(meta);
  c.putAll(put, 21600);
  c.put(key + '_f', '1', CONFIG.LB_FRESH_S);
  c.remove(key + '_b');
  return meta;
}

function readRows(c, key, meta, off, n) {
  var out = [];
  if (off >= meta.players) return out;
  var end = Math.min(off + n, meta.players), first = Math.floor(off / CONFIG.LB_CHUNK), lastC = Math.floor((end - 1) / CONFIG.LB_CHUNK), keys = [];
  for (var i = first; i <= lastC; i++) keys.push(key + '_c' + i);
  var got = c.getAll(keys);
  for (var ci = first; ci <= lastC; ci++) {
    var raw = got[key + '_c' + ci];
    if (!raw) return null;
    var arr = JSON.parse(raw);
    for (var j = 0; j < arr.length; j++) {
      var rank = ci * CONFIG.LB_CHUNK + j;
      if (rank >= off && rank < end) out.push({ r: rank + 1, n: arr[j][0], s: arr[j][1], p: arr[j][2], u: arr[j][3] || '' });
    }
  }
  return out;
}

function findPlayer(c, key, meta, pid) {
  var keys = [];
  for (var i = 0; i < meta.chunks; i++) keys.push(key + '_c' + i);
  var got = c.getAll(keys);
  for (var ci = 0; ci < meta.chunks; ci++) {
    var raw = got[key + '_c' + ci];
    if (!raw) return null;
    var arr = JSON.parse(raw);
    for (var j = 0; j < arr.length; j++) if (arr[j][2] === pid) return { r: ci * CONFIG.LB_CHUNK + j + 1, s: arr[j][1] };
  }
  return null;
}

// How many players have a higher score than this one (from the cached board; null if unknown or the board is huge).
function rankOf(season, mode, score) {
  var c = CacheService.getScriptCache(), key = boardKey(season, mode), raw = c.get(key + '_m');
  if (!raw) return null;
  var meta = JSON.parse(raw);
  if (meta.chunks > 12) return null;
  var keys = [], higher = 0;
  for (var i = 0; i < meta.chunks; i++) keys.push(key + '_c' + i);
  var got = c.getAll(keys);
  for (var ci = 0; ci < meta.chunks; ci++) {
    if (!got[key + '_c' + ci]) return null;
    var arr = JSON.parse(got[key + '_c' + ci]);
    for (var j = 0; j < arr.length; j++) if (arr[j][1] > score) higher++;
  }
  return higher + 1;
}

/* Reads the score rows up to column `upto`, but NEVER the Events column (a replay log of up to 45,000 characters per row): with thousands of scores reading it every minute would make the boards slow. That cell comes back empty. */
function readScoreRows(upto) {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return [];
  var n = last - 1, a = sh.getRange(2, 1, n, COL.EVENTS - 1).getValues(), b = upto > COL.EVENTS ? sh.getRange(2, COL.EVENTS + 1, n, upto - COL.EVENTS).getValues() : null, out = new Array(n);
  for (var i = 0; i < n; i++) out[i] = b ? a[i].concat([''], b[i]) : a[i].concat(['']);
  return out;
}
function readBoardRows() { return readScoreRows(COL.UNI); }
function buildList(mode, season, preloaded) {                       // preloaded: rows already read from the Sheet (one read can serve every board)
  var best = {}, list = [], rows = preloaded || readBoardRows();
  if (rows.length) {
    var seenSid = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], sidv = r[COL.SID - 1];
      if (sidv) { if (seenSid[sidv]) continue; seenSid[sidv] = 1; }              // one score per session: the first row wins
      if (cellText(r[COL.SEASON - 1]) !== String(season) || cellText(r[COL.MODE - 1]) !== mode) continue;
      if (r[COL.STATUS - 1] === 'VOID' || r[COL.STATUS - 1] === 'TEST') continue;
      var pid = r[COL.PID - 1], s = +r[COL.SCORE - 1], ms = +r[COL.MS - 1], cur = best[pid];
      if (!cur || s > cur.s || (s === cur.s && ms < cur.ms)) best[pid] = { n: r[COL.NAME - 1], s: s, ms: ms, p: pid, u: String(r[COL.UNI - 1] || '') };
    }
    for (var k in best) list.push(best[k]);
    list.sort(function (a, b) { return b.s - a.s || a.ms - b.ms; });
  }
  return list;
}

/* ---------- submit a finished run (safe to repeat: the same run always returns the same code; no locks, so uploads run in parallel) ---------- */
function actSubmit(b) {
  var r;
  try { r = submitCore(b); } catch (e) { noteFail('exception', e); r = { ok: false, err: 'server' }; }
  tally(r);
  if (!r.ok && ['token', 'expired', 'version', 'device', 'closed', 'contact', 'mismatch', 'timing', 'clock', 'kind', 'order', 'item', 'afterover', 'format', 'time', 'events', 'server'].indexOf(r.err) >= 0) noteFail('refused', r.err, String(b && b.mode || ''));
  return r;
}
function tally(r) {                                                // how many submissions were accepted or refused (and why), kept for 6 hours: shown in the staff check
  try { var c = CacheService.getScriptCache(), k = 'ts_' + (r && r.ok ? 'ok' : (r && r.err) || 'unknown'); c.put(k, String((+c.get(k) || 0) + 1), 21600); if (!c.get('ts_since')) c.put('ts_since', String(Date.now()), 21600); } catch (x) {}
}
function noteFail(where, e, extra) {                               // the last 15 problems with their real error text
  try {
    var c = CacheService.getScriptCache(); if (c.get('ring_lock')) return; c.put('ring_lock', '1', 2);
    var p = PropertiesService.getScriptProperties(), arr = []; try { arr = JSON.parse(p.getProperty('FAILS') || '[]'); } catch (x) {}
    arr.push({ t: Date.now(), w: where, m: String((e && e.message) || e || '').slice(0, 160), x: extra || '' }); p.setProperty('FAILS', JSON.stringify(arr.slice(-15)));
  } catch (x) {}
}
function capEvents(s) { s = String(s || ''); return s.length > 45000 ? s.slice(0, 45000) + '~TRUNCATED' : s; }   // one Sheet cell holds at most 50,000 characters
function submitCore(b) {
  var tok = readToken(b.token);
  if (!tok) return { ok: false, err: 'token' };
  var now = Date.now();
  if (now - tok.iat > CONFIG.TOKEN_TTL_MS) return { ok: false, err: 'expired' };
  if (+b.v !== SIM_VERSION) return { ok: false, err: 'version' };           // the game says which simulation it runs: it must be the same one this server replays with
  var mode = tok.mode;
  if (!MODES[mode] || !MODES[mode].ranked) return { ok: false, err: 'mode' };
  var did = cleanId(b.did);
  if (!did || did !== tok.d) return { ok: false, err: 'device' };     // a session only works on the device it was issued to
  var comp = getComp();
  if (mode === 'rank' && comp && tok.s === comp.season && now > comp.end + comp.grace * 60000) return { ok: false, err: 'closed' };   // the competition is over
  var name = cleanName(b.name);
  if (!name || nameBlocked(name)) return { ok: false, err: 'name' };          // the score stays on the phone and the player is asked for a different name
  var contact = cleanContact(b.contact);
  var isTest = name.indexOf('LOADTEST') === 0;
  if (mode === 'rank' && !isTest && !/^09\d{9}$/.test(contact)) return { ok: false, err: 'contact' };   // prizes need a number staff can call or text                         // rows from loadtest.html are tagged TEST and never shown on any board

  var c = CacheService.getScriptCache();
  var rk = 'sub_' + did, n = +(c.get(rk) || 0);
  if (n >= 60) return { ok: false, err: 'rate' };
  c.put(rk, String(n + 1), 3600);

  var v = verifyRun(tok, b, now);                                      // CPU work happens outside any lock
  if (!v.ok) return { ok: false, err: v.err };

  var season = (mode === 'rank' && CONFIG.RANK_SHARED_COURSE && tok.s) ? tok.s : getSeason(mode);   // a run counts on the board whose course it was played on
  var pid = hmacHex('pid|' + (contact ? 'c' + contact : 'd' + did)).slice(0, 8);
  var code = makeCode(tok.sid, v.score, mode, pid);
  var risk = (v.ratio >= CONFIG.RISK_REVIEW || v.flags.length) ? 'REVIEW' : 'LOW';
  var note = [v.rev ? 'night:' + v.rev : '', v.bosses ? 'bosses:' + v.bosses : '', v.flags.length ? 'flags:' + v.flags.join('+') : ''].filter(Boolean).join(' ');
  var reply = { ok: true, score: v.score, code: code, pid: pid, rank: null, season: season, seasonLabel: labelForSeason(season) };
  if (mode === 'rank' && tok.s && tok.s !== getSeason('rank')) reply.stale = true;       // the board was reset while this run was being played: it counted on the earlier board

  // No lock: a lock would make every submit wait in a single-file line. Instead, "one score per session" is enforced where scores are
  // counted (see buildList / adminTop), so even two requests racing each other can never credit one run twice.
  var dup = false, prev = c.get('sid_' + tok.sid);
  if (!prev && now - tok.iat > 5 * 3600 * 1000) prev = codeForSid(tok.sid);   // the cache only remembers 6 hours; older sessions are looked up in the sheet
  if (prev) { if (prev === code) dup = true; else return { ok: false, err: 'used' }; }
  else c.put('sid_' + tok.sid, code, 21600);
  if (dup) { reply.dup = true; return reply; }                         // the same run sent again (e.g. the first reply was lost): same code, no new row

  var rowVals = [now, Utilities.formatDate(new Date(now), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'), season, mode, name, contact, pid, v.score, code, risk, isTest ? 'TEST' : 'OK', tok.sid, v.maxCombo, v.catches, v.secs, capEvents(b.tr), '', '', note, UNICORNS[b.uni] ? b.uni : 'frost', UNAMES[UNICORNS[b.uni] ? b.uni : 'frost'] || '', /^v\d{1,3}:[AM]$/.test(String(b.cv || '')) ? String(b.cv) : ''];   // the last column records which privacy notice the player agreed to (v1) and whether they are an adult (A) or a minor with a guardian's agreement (M)
  try { sheet().appendRow(rowVals); }
  catch (e1) {
    try { Utilities.sleep(300); sheet().appendRow(rowVals); }       // one more try
    catch (e2) { noteFail('append', e2, mode); c.remove('sid_' + tok.sid); return { ok: false, err: 'server' }; }
  }
  c.remove(boardKey(season, mode) + '_f');                              // the cached leaderboard is now out of date: the next person who opens it gets a fresh one at once
  return reply;                                                        // rank is shown on the leaderboard (keeps this request as cheap as possible)
}

function codeForSid(sid) {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return '';
  var f = sh.getRange(2, COL.SID, last - 1, 1).createTextFinder(sid).matchEntireCell(true).findNext();
  return f ? String(sh.getRange(f.getRow(), COL.CODE).getValue()) : '';
}

/* Replays the whole flight (one move per step, recorded by the game) in the SAME simulation the game runs. The score must match exactly. */
function verifyRun(tok, b, now) {
  var mode = tok.mode, M = MODES[mode], tr = String(b.tr || ''), uni = UNICORNS[b.uni] ? b.uni : 'frost', tEnd = Math.round(+b.tEnd);
  if (!M) return { ok: false, err: 'mode' };
  if (tr.length < 40 || tr.length % 2) return { ok: false, err: 'format' };
  if (tr.length > 2 * M.maxSec * SPS + 4) return { ok: false, err: 'events' };
  var i, c, satur = 0;
  for (i = 0; i < tr.length; i++) { c = tr.charCodeAt(i); if (c < 33 || c > 125) return { ok: false, err: 'format' }; if (c === 33 || c === 125) satur++; }   // only characters the recorder writes
  var sk = String(b.sk || '').split(',').filter(function (x) { return x !== ''; }).map(Number);                 // the steps where the active skill button was pressed
  if (sk.length > 4000) return { ok: false, err: 'events' };
  for (i = 0; i < sk.length; i++) { if (!(sk[i] >= 1 && sk[i] <= tr.length / 2 && sk[i] === Math.floor(sk[i])) || (i && sk[i] <= sk[i - 1])) return { ok: false, err: 'format' }; }
  var rvS = String(b.rv || ''); if (rvS && !/^\d{1,6}(,\d{1,6}){0,1}$/.test(rvS)) return { ok: false, err: 'format' };      // when the player paid to Continue (at most twice)
  var cdS = String(b.cd || ''); if (cdS && !/^[r0-2;]{1,4000}$/.test(cdS)) return { ok: false, err: 'format' };      // the Wild Card choices (picks and reshuffles) after each boss
  var upS = String(b.up || ''); if (upS && !/^d[0-5]r[0-5]t[0-3]$/.test(upS)) return { ok: false, err: 'format' };                // weapon upgrades (Classic only; Ranked ignores them)
  var rbS = String(b.rb || '');                                                                                                      // when Rainbrew Power was tapped: "first-last" step pairs, in order, at most one per boss fight
  if (rbS) {
    if (rbS.length > 4000 || !/^\d{1,6}-\d{1,6}(,\d{1,6}-\d{1,6})*$/.test(rbS)) return { ok: false, err: 'format' };
    var rbA = rbS.split(','), prevE = 0; if (rbA.length > 200) return { ok: false, err: 'format' };
    for (i = 0; i < rbA.length; i++) { var rp = rbA[i].split('-'), r0 = +rp[0], r1 = +rp[1]; if (!(r0 >= 1 && r1 >= r0 && r1 <= tr.length / 2 && r0 > prevE)) return { ok: false, err: 'format' }; prevE = r1; }
  }
  var G = simulate(tok.seed, mode, uni, tr, false, sk, upS, cdS, rvS, rbS), steps = G.used || 0, secs = steps / SPS, tReal = secs * 1000;
  if (steps < 20 || isNaN(tEnd) || Math.abs(tEnd - tReal) > 1500) return { ok: false, err: 'time' };
  if (tReal > (now - tok.iat) + 5000) return { ok: false, err: 'clock' };       // a run cannot last longer than the time since its session was issued
  if (+b.score !== G.score) return { ok: false, err: 'mismatch' };
  var flags = [];
  if (satur / tr.length > 0.3) flags.push('fast-moves');                       // an autopilot tends to push the unicorn at full speed all the time
  return { ok: true, flags: flags, score: G.score, maxCombo: G.maxCombo, catches: G.kills, rev: 0, bosses: G.bosses, secs: secs, ratio: 0, stage: G.stage };
}

/* ---------- admin (staff) actions: all require ADMIN_KEY ---------- */
function admin(b, fn) {
  var c = CacheService.getScriptCache(), fails = +(c.get('admfail') || 0);
  if (fails >= 15) return { ok: false, err: 'locked' };
  var key = prop('ADMIN_KEY');
  if (!key || !safeEq(String(b.key || ''), key)) { c.put('admfail', String(fails + 1), 600); return { ok: false, err: 'auth' }; }
  return fn(b);
}

function rowObj(r, rowNum) {
  return { row: rowNum, ms: r[COL.MS - 1], when: r[COL.WHEN - 1], season: r[COL.SEASON - 1], mode: r[COL.MODE - 1], name: r[COL.NAME - 1], contact: r[COL.CONTACT - 1], pid: r[COL.PID - 1], score: r[COL.SCORE - 1], code: r[COL.CODE - 1], risk: r[COL.RISK - 1], status: r[COL.STATUS - 1], combo: r[COL.COMBO - 1], catches: r[COL.CATCHES - 1], secs: r[COL.SECS - 1], claimedAt: r[COL.CLAIMED_AT - 1], claimedBy: r[COL.CLAIMED_BY - 1], note: r[COL.NOTE - 1] };
}

function adminTop(b) {
  var mode = String(b.mode || 'rank'), season = String(b.season || getSeason(mode));
  var sh = sheet(), last = sh.getLastRow(), best = {};
  if (last >= 2) {
    var rows = readScoreRows(COL.NOTE), seenSid = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], sidv = r[COL.SID - 1];
      if (sidv) { if (seenSid[sidv]) continue; seenSid[sidv] = 1; }
      if (cellText(r[COL.SEASON - 1]) !== String(season) || cellText(r[COL.MODE - 1]) !== mode || r[COL.STATUS - 1] === 'VOID' || r[COL.STATUS - 1] === 'TEST') continue;
      var pid = r[COL.PID - 1], cur = best[pid];
      if (!cur || r[COL.SCORE - 1] > cur.r[COL.SCORE - 1] || (r[COL.SCORE - 1] === cur.r[COL.SCORE - 1] && r[COL.MS - 1] < cur.r[COL.MS - 1])) best[pid] = { r: r, n: i + 2 };
    }
  }
  var list = Object.keys(best).map(function (k) { return rowObj(best[k].r, best[k].n); });
  list.sort(function (a, b) { return b.score - a.score || a.ms - b.ms; });
  return { ok: true, season: season, info: seasonInfo(mode), auto: !prop('SEASON'), mode: mode, players: list.length, rows: list.slice(0, Math.min(100, +b.limit || 25)) };
}

function findByCode(code) {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return null;
  var f = sh.getRange(2, COL.CODE, last - 1, 1).createTextFinder(code).matchEntireCell(true).findNext();
  return f ? f.getRow() : null;
}

function adminLookup(b) {
  var code = String(b.code || '').toUpperCase().trim();
  var row = findByCode(code);
  if (!row) return { ok: false, err: 'notfound' };
  return { ok: true, row: rowObj(sheet().getRange(row, 1, 1, COL.NOTE).getValues()[0], row) };
}

function adminMark(b) {
  var status = String(b.status || '');
  if (['OK', 'CLAIMED', 'VOID'].indexOf(status) < 0) return { ok: false, err: 'status' };
  var row = findByCode(String(b.code || '').toUpperCase().trim());
  if (!row) return { ok: false, err: 'notfound' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, err: 'busy' }; }
  try {
    var sh = sheet();
    sh.getRange(row, COL.STATUS).setValue(status);
    if (status === 'CLAIMED') {
      sh.getRange(row, COL.CLAIMED_AT).setValue(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'));
      sh.getRange(row, COL.CLAIMED_BY).setValue(cleanName(b.by) || 'staff');
    }
    if (b.note) sh.getRange(row, COL.NOTE).setValue(String(b.note).slice(0, 200).replace(/^[=+\-@]+/, ''));
  } finally { lock.releaseLock(); }
  dropBoards();
  return { ok: true, row: rowObj(sheet().getRange(row, 1, 1, COL.NOTE).getValues()[0], row) };
}

function adminStatus() {
  var now = Date.now(), c = getComp(), w = who();
  return { ok: true, release: w.release, server: w.server, rules: w.rules, now: now, seasons: allSeasons(), auto: !prop('SEASON'), manual: prop('SEASON') || '', autoKind: CONFIG.AUTO_SEASON, comp: c ? { name: c.name, start: c.start, end: c.end, grace: c.grace, season: c.season, state: compState(c, now) } : null };
}
function adminSeason(b) {
  var s = String(b.season || '').replace(/[^\w \-.]/g, '').slice(0, 30).trim();
  var p = PropertiesService.getScriptProperties();
  if (!s) p.deleteProperty('SEASON'); else p.setProperty('SEASON', s);   // empty = go back to automatic seasons
  _props = {};
  return { ok: true, season: getSeason(), auto: !s, seasons: allSeasons() };
}

// Runs every minute (see installTriggers): rebuilds every board from ONE read of the Sheet, so players always get a ready-made board.
function refreshBoards() {
  var rows = readBoardRows(), done = {};
  Object.keys(MODES).forEach(function (m) { var s = getSeason(m), k = s + '|' + m; if (done[k]) return; done[k] = 1; ensureBoard(s, m, true, rows); });
}
function installTriggers() {                                          // run once (setup does it): creates the 1-minute board refresh
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshBoards') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshBoards').timeBased().everyMinutes(1).create();
  Logger.log('Board refresh installed: every board is now rebuilt once a minute.');
}
function dropBoards() {
  var c = CacheService.getScriptCache(), keys = [];
  Object.keys(MODES).forEach(function (m) { var k = boardKey(getSeason(m), m); keys.push(k + '_m', k + '_f', k + '_b'); });
  c.removeAll(keys);
}

/* ---------- circles (boards for friends, families, teams) and event boards (made by staff) ----------
   A circle or event board is NOT a new game. It is a filter over the same verified Ranked scores:
   same shared course, same replay check, same codes. Nothing here can create or change a score.
   Circles: a player creates one and shares the invite code or link; members are the players who joined it.
   Events: staff create them (verify.html). Scope 'all' = every Ranked player counts and it is listed in the game; scope 'code' = invite code only.
   Sheets "Circles" and "Members" are created automatically the first time they are needed. */
var CIRCLE = { SHEET: 'Circles', MEMBERS: 'Members', MAX_OWN: 3, MAX_JOIN: 10, MAX_MEMBERS: 100, MAX_EVENT_MEMBERS: 5000, KEEP: 800, CACHE_S: 60 };
var CIRCLE_HEAD = ['Code', 'Name', 'Kind', 'Owner', 'OwnerName', 'Created', 'Start', 'End', 'Scope', 'Status', 'Note'];
var MEMBER_HEAD = ['Code', 'PID', 'Name', 'Joined', 'Status'];
var CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';                      // no 0, 1, I, L, O: a code is easy to read out loud

function cleanCircleCode(s) { s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/.test(s) ? s : ''; }
function cleanCircleName(s) { return String(s || '').replace(/[\u0000-\u001f<>&"'`\\\/]/g, '').replace(/^[=+\-@\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 24); }
function cleanNote(s) { return String(s || '').replace(/[\u0000-\u001f<>&"'`\\\/]/g, '').replace(/^[=+\-@\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 140); }
function newCircleCode(all) {
  var used = {}; all.forEach(function (c) { used[c.code] = 1; });
  for (var t = 0; t < 50; t++) { var s = ''; for (var i = 0; i < 6; i++) s += CODE_ALPHA.charAt(Math.floor(Math.random() * CODE_ALPHA.length)); if (!used[s]) return s; }
  return '';
}
function ctab(name, head, textCols) {
  var ss = SpreadsheetApp.openById(prop('SHEET_ID')), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
    textCols.forEach(function (c) { var L = colLetter(c); sh.getRange(L + '2:' + L).setNumberFormat('@'); });   // codes, ids and names stay text (no formulas, no lost characters)
  }
  return sh;
}
function circleSheet() { return ctab(CIRCLE.SHEET, CIRCLE_HEAD, [1, 2, 3, 4, 5, 9, 10, 11]); }
function memberSheet() { return ctab(CIRCLE.MEMBERS, MEMBER_HEAD, [1, 2, 3, 5]); }
function circleObj(r, i) { return { row: i + 2, code: String(r[0]), name: String(r[1]), kind: String(r[2]), owner: String(r[3]), ownerName: String(r[4]), created: +r[5] || 0, start: +r[6] || 0, end: +r[7] || 0, scope: String(r[8]) || 'code', status: String(r[9]) || 'ACTIVE', note: String(r[10] || '') }; }
function circleRow(c) { return [c.code, c.name, c.kind, c.owner, c.ownerName, c.created, c.start, c.end, c.scope, c.status, c.note]; }
function memberObj(r, i) { return { row: i + 2, code: String(r[0]), pid: String(r[1]), name: String(r[2]), joined: +r[3] || 0, status: String(r[4]) || 'ACTIVE' }; }
function readCircles() { var sh = circleSheet(), last = sh.getLastRow(); return last < 2 ? [] : sh.getRange(2, 1, last - 1, CIRCLE_HEAD.length).getValues().map(circleObj); }
function readMembers() { var sh = memberSheet(), last = sh.getLastRow(); return last < 2 ? [] : sh.getRange(2, 1, last - 1, MEMBER_HEAD.length).getValues().map(memberObj); }
function findCircle(code, all) { all = all || readCircles(); for (var i = 0; i < all.length; i++) if (all[i].code === code) return all[i]; return null; }
function writeCircle(c) { circleSheet().getRange(c.row, 1, 1, CIRCLE_HEAD.length).setValues([circleRow(c)]); }
function memberCounts(members) { var n = {}; members.forEach(function (m) { if (m.status === 'ACTIVE') n[m.code] = (n[m.code] || 0) + 1; }); return n; }
function circleState(c, now) { return c.kind === 'event' ? compState({ start: c.start, end: c.end, grace: CONFIG.COMP_GRACE_MIN }, now) : (c.status === 'ACTIVE' ? 'open' : 'closed'); }
function pubCircle(c, members, me) {
  return { code: c.code, name: c.name, kind: c.kind, scope: c.scope, note: c.note, start: c.start, end: c.end, status: c.status, state: circleState(c, Date.now()), owner: c.ownerName, mine: !!(me && c.owner === me), members: members };
}
function dropCircleCache(code) { var c = CacheService.getScriptCache(); c.removeAll(['cb_' + code + '_season', 'cb_' + code + '_all', 'ev_list']); }
function guessBlocked(did) { return +(CacheService.getScriptCache().get('cg_' + did) || 0) >= 20; }     // a device that keeps trying codes that do not exist is slowed down
function guessFail(did) { var c = CacheService.getScriptCache(), k = 'cg_' + did; c.put(k, String((+c.get(k) || 0) + 1), 3600); }

/* who is asking: the same identity a Ranked score has (the registered name and the mobile number). The server works out the player id itself, so nobody can act as someone else's id. */
function circleWho(b, light) {
  var did = cleanId(b.did), contact = cleanContact(b.contact), name = cleanName(b.name);
  if (!did) return { err: 'device' };
  if (!/^09\d{9}$/.test(contact)) return { err: 'contact' };
  if (!name) return { err: 'name' };
  if (nameBlocked(name)) return { err: 'badname' };
  var c = CacheService.getScriptCache(), k = (light ? 'cm_' : 'cw_') + did, n = +(c.get(k) || 0);
  if (n >= (light ? 120 : 40)) return { err: 'rate' };
  c.put(k, String(n + 1), 3600);
  return { did: did, name: name, contact: contact, pid: hmacHex('pid|c' + contact).slice(0, 8) };
}

function circleAction(act, b) {
  try {
    var w = circleWho(b, act === 'c_mine');
    if (w.err) return { ok: false, err: w.err };
    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch (e) { return { ok: false, err: 'busy' }; }
    try {
      switch (act) {
        case 'c_create': return cCreate(w, b);
        case 'c_join': return cJoin(w, b);
        case 'c_leave': return cLeave(w, b);
        case 'c_mine': return cMine(w);
        case 'c_edit': return cEdit(w, b);
        case 'c_delete': return cDelete(w, b);
        case 'c_kick': return cKick(w, b);
      }
    } finally { lock.releaseLock(); }
    return { ok: false, err: 'action' };
  } catch (e) { noteFail('circle', e, act); return { ok: false, err: 'server' }; }
}
function cCreate(w, b) {
  var name = cleanCircleName(b.cname);
  if (name.length < 2) return { ok: false, err: 'cname' };
  if (nameBlocked(name)) return { ok: false, err: 'badcname' };
  var all = readCircles(), mine = all.filter(function (c) { return c.owner === w.pid && c.kind === 'circle' && c.status !== 'HIDDEN'; });
  if (mine.length >= CIRCLE.MAX_OWN) return { ok: false, err: 'limit' };
  var code = newCircleCode(all); if (!code) return { ok: false, err: 'server' };
  var now = Date.now(), c = { code: code, name: name, kind: 'circle', owner: w.pid, ownerName: w.name, created: now, start: 0, end: 0, scope: 'code', status: 'ACTIVE', note: '' };
  circleSheet().appendRow(circleRow(c));
  memberSheet().appendRow([code, w.pid, w.name, now, 'ACTIVE']);
  dropCircleCache(code);
  return { ok: true, pid: w.pid, circle: pubCircle(c, 1, w.pid) };
}
function cJoin(w, b) {
  var code = cleanCircleCode(b.code);
  if (!code) return { ok: false, err: 'code' };
  if (guessBlocked(w.did)) return { ok: false, err: 'rate' };
  var all = readCircles(), c = findCircle(code, all);
  if (!c || c.status === 'HIDDEN') { guessFail(w.did); return { ok: false, err: 'notfound' }; }
  if (c.status !== 'ACTIVE') return { ok: false, err: 'closed' };
  if (c.scope === 'all') return { ok: true, pid: w.pid, open: true, circle: pubCircle(c, null, w.pid) };   // an open event needs no joining: every Ranked player counts
  var members = readMembers(), counts = memberCounts(members), mine = null, i;
  for (i = 0; i < members.length; i++) if (members[i].code === code && members[i].pid === w.pid) { mine = members[i]; break; }
  if (mine && mine.status === 'ACTIVE') return { ok: true, pid: w.pid, circle: pubCircle(c, counts[code] || 0, w.pid) };
  if (mine && mine.status === 'REMOVED') return { ok: false, err: 'removed' };
  if (c.kind === 'event' && Date.now() > c.end + CONFIG.COMP_GRACE_MIN * 60000) return { ok: false, err: 'ended' };
  if ((counts[code] || 0) >= (c.kind === 'event' ? CIRCLE.MAX_EVENT_MEMBERS : CIRCLE.MAX_MEMBERS)) return { ok: false, err: 'full' };
  var kinds = {}; all.forEach(function (x) { kinds[x.code] = x; });
  var joined = members.filter(function (m) { var x = kinds[m.code]; return m.pid === w.pid && m.status === 'ACTIVE' && x && x.kind === 'circle' && x.status !== 'HIDDEN'; }).length;
  if (joined >= CIRCLE.MAX_JOIN) return { ok: false, err: 'limit' };
  if (mine) memberSheet().getRange(mine.row, 1, 1, MEMBER_HEAD.length).setValues([[code, w.pid, w.name, mine.joined, 'ACTIVE']]);
  else memberSheet().appendRow([code, w.pid, w.name, Date.now(), 'ACTIVE']);
  dropCircleCache(code);
  return { ok: true, pid: w.pid, circle: pubCircle(c, (counts[code] || 0) + 1, w.pid) };
}
function cLeave(w, b) {
  var code = cleanCircleCode(b.code), c = code && findCircle(code);
  if (!c) return { ok: false, err: 'notfound' };
  if (c.owner === w.pid && c.kind === 'circle' && c.status === 'ACTIVE') return { ok: false, err: 'owner' };   // the owner closes the circle instead of leaving it
  var members = readMembers();
  for (var i = 0; i < members.length; i++) if (members[i].code === code && members[i].pid === w.pid && members[i].status === 'ACTIVE') {
    memberSheet().getRange(members[i].row, MEMBER_HEAD.length).setValue('LEFT'); dropCircleCache(code); return { ok: true };
  }
  return { ok: true };
}
function cMine(w) {
  var all = readCircles(), members = readMembers(), counts = memberCounts(members), by = {}, out = [];
  all.forEach(function (c) { by[c.code] = c; });
  members.forEach(function (m) {
    var c = by[m.code];
    if (m.pid !== w.pid || m.status !== 'ACTIVE' || !c || c.status === 'HIDDEN') return;
    out.push(pubCircle(c, counts[c.code] || 0, w.pid));
  });
  out.sort(function (a, b) { return (b.kind === 'event') - (a.kind === 'event') || (b.start || 0) - (a.start || 0); });
  return { ok: true, pid: w.pid, circles: out };
}
function ownedCircle(w, b) {
  var code = cleanCircleCode(b.code), c = code && findCircle(code);
  if (!c || c.kind !== 'circle' || c.status === 'HIDDEN') return { err: 'notfound' };
  if (c.owner !== w.pid) return { err: 'owner' };
  return { c: c };
}
function cEdit(w, b) {
  var o = ownedCircle(w, b); if (o.err) return { ok: false, err: o.err };
  var name = cleanCircleName(b.cname); if (name.length < 2) return { ok: false, err: 'cname' };
  if (nameBlocked(name)) return { ok: false, err: 'badcname' };
  o.c.name = name; if (b.close === true || b.close === false) o.c.status = b.close ? 'CLOSED' : 'ACTIVE';
  writeCircle(o.c); dropCircleCache(o.c.code);
  return { ok: true, circle: pubCircle(o.c, null, w.pid) };
}
function cDelete(w, b) {
  var o = ownedCircle(w, b); if (o.err) return { ok: false, err: o.err };
  o.c.status = 'HIDDEN'; writeCircle(o.c); dropCircleCache(o.c.code);
  return { ok: true };
}
function cKick(w, b) {
  var o = ownedCircle(w, b); if (o.err) return { ok: false, err: o.err };
  var pid = String(b.pid || ''); if (!/^[a-f0-9]{8}$/.test(pid) || pid === w.pid) return { ok: false, err: 'pid' };
  var members = readMembers();
  for (var i = 0; i < members.length; i++) if (members[i].code === o.c.code && members[i].pid === pid && members[i].status === 'ACTIVE') {
    memberSheet().getRange(members[i].row, MEMBER_HEAD.length).setValue('REMOVED'); break;
  }
  dropCircleCache(o.c.code);
  return { ok: true };
}

/* the scores, read cheaply: only the columns a board needs (the long Events column is never read) */
function readLite() {
  var sh = sheet(), last = sh.getLastRow();
  if (last < 2) return [];
  var a = sh.getRange(2, 1, last - 1, COL.SID).getValues(), u = sh.getRange(2, COL.UNI, last - 1, 1).getValues(), out = new Array(a.length);
  for (var i = 0; i < a.length; i++) {
    var r = a[i];
    out[i] = { ms: +r[COL.MS - 1], season: cellText(r[COL.SEASON - 1]), mode: cellText(r[COL.MODE - 1]), name: String(r[COL.NAME - 1]), pid: String(r[COL.PID - 1]), score: +r[COL.SCORE - 1], status: String(r[COL.STATUS - 1] || ''), sid: String(r[COL.SID - 1] || ''), uni: String(u[i][0] || '') };
  }
  return out;
}
function buildCircleBoard(c, period) {
  var mem = null, members = null, roster = null;
  if (c.scope !== 'all') {
    mem = {}; members = 0; roster = [];
    readMembers().forEach(function (m) { if (m.code === c.code && m.status === 'ACTIVE') { mem[m.pid] = 1; members++; roster.push([m.pid, m.name]); } });
  }
  var rows = readLite(), best = {}, seen = {}, season = getSeason('rank'), lo = 0, hi = Infinity, i, r, cur;
  if (c.kind === 'event') { lo = c.start; hi = c.end + CONFIG.COMP_GRACE_MIN * 60000; }
  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    if (r.sid) { if (seen[r.sid]) continue; seen[r.sid] = 1; }                      // one score per session, like the main board
    if (r.mode !== 'rank' || r.status === 'VOID' || r.status === 'TEST') continue;
    if (mem && !mem[r.pid]) continue;
    if (c.kind === 'event') { if (r.ms < lo || r.ms > hi) continue; }
    else if (period === 'season' && r.season !== season) continue;
    cur = best[r.pid];
    if (!cur || r.score > cur.score || (r.score === cur.score && r.ms < cur.ms)) best[r.pid] = r;
  }
  var list = Object.keys(best).map(function (k) { return best[k]; });
  list.sort(function (a, b) { return b.score - a.score || a.ms - b.ms; });
  return { c: { code: c.code, name: c.name, kind: c.kind, scope: c.scope, note: c.note, start: c.start, end: c.end, status: c.status, state: circleState(c, Date.now()), owner: c.ownerName, ownerPid: c.owner }, members: members, roster: c.kind === 'circle' ? roster : null, players: list.length, updated: Date.now(), list: list.slice(0, CIRCLE.KEEP).map(function (x) { return [x.name, x.score, x.pid, x.uni]; }) };
}
function actCircle(p) {
  var did = cleanId(p.did), code = cleanCircleCode(p.code);
  if (!did) return { ok: false, err: 'device' };
  if (!code) return { ok: false, err: 'code' };
  var period = p.period === 'all' ? 'all' : 'season', cc = CacheService.getScriptCache(), key = 'cb_' + code + '_' + period, raw = cc.get(key), B;
  if (raw) B = JSON.parse(raw);
  else {
    if (guessBlocked(did)) return { ok: false, err: 'rate' };
    var c = findCircle(code);
    if (!c || c.status === 'HIDDEN') { guessFail(did); return { ok: false, err: 'notfound' }; }
    B = buildCircleBoard(c, period);
    cc.put(key, JSON.stringify(B), CIRCLE.CACHE_S);
  }
  var off = Math.max(0, Math.min(CIRCLE.KEEP, parseInt(p.off, 10) || 0)), n = Math.max(1, Math.min(200, parseInt(p.n, 10) || CONFIG.LB_PAGE)), me = String(p.pid || ''), rows = [], i;
  for (i = off; i < Math.min(B.list.length, off + n); i++) rows.push({ r: i + 1, n: B.list[i][0], s: B.list[i][1], p: B.list[i][2], u: B.list[i][3] || '' });
  var w = who(), res = { ok: true, rules: w.rules, release: w.release, server: w.server, circle: B.c, members: B.members, players: B.players, period: B.c.kind === 'event' ? 'event' : period, updated: B.updated, off: off, rows: rows };
  res.circle.mine = /^[a-f0-9]{8}$/.test(me) && B.c.ownerPid === me; delete res.circle.ownerPid;
  if (res.circle.mine && B.roster) res.roster = B.roster.map(function (x) { return { p: x[0], n: x[1] }; });   // only the owner sees who is in the circle (to remove someone)
  if (/^[a-f0-9]{8}$/.test(me) && String(p.me) === '1') for (i = 0; i < B.list.length; i++) if (B.list[i][2] === me) { res.me = { r: i + 1, s: B.list[i][1] }; break; }
  return res;
}
function actEvents() {                                              // public: the open events shown in the game (upcoming, live, or finished in the last 30 days)
  var cc = CacheService.getScriptCache(), raw = cc.get('ev_list'), now = Date.now();
  if (raw) return JSON.parse(raw);
  var list = readCircles().filter(function (c) { return c.kind === 'event' && c.scope === 'all' && c.status === 'ACTIVE' && now < c.end + 30 * 86400000; });
  list.sort(function (a, b) { return b.start - a.start; });
  var res = { ok: true, now: now, events: list.slice(0, 20).map(function (c) { return pubCircle(c, null, ''); }) };
  cc.put('ev_list', JSON.stringify(res), CIRCLE.CACHE_S);
  return res;
}

/* staff: events and the circle list (all need the staff PIN) */
function adminEventSet(b) {
  var name = cleanCircleName(b.name), start = Math.round(+b.start), end = Math.round(+b.end), scope = b.scope === 'code' ? 'code' : 'all', note = cleanNote(b.note);
  if (name.length < 2) return { ok: false, err: 'name' };
  if (!(start > 0 && end > start)) return { ok: false, err: 'dates' };
  if (end - start < 60000 || end - start > 120 * 86400000) return { ok: false, err: 'length' };
  var all = readCircles(), code = cleanCircleCode(b.code), c = code ? findCircle(code, all) : null;
  if (code && (!c || c.kind !== 'event')) return { ok: false, err: 'notfound' };
  if (c) { c.name = name; c.start = start; c.end = end; c.scope = scope; c.note = note; writeCircle(c); }
  else {
    code = newCircleCode(all); if (!code) return { ok: false, err: 'server' };
    c = { code: code, name: name, kind: 'event', owner: 'staff', ownerName: 'Rainbrew', created: Date.now(), start: start, end: end, scope: scope, status: 'ACTIVE', note: note };
    circleSheet().appendRow(circleRow(c));
  }
  dropCircleCache(c.code);
  return { ok: true, circle: pubCircle(c, null, '') };
}
function adminCircles() {
  var all = readCircles(), counts = memberCounts(readMembers()), now = Date.now();
  all.sort(function (a, b) { return b.created - a.created; });
  return { ok: true, now: now, total: all.length, circles: all.slice(0, 200).map(function (c) { var o = pubCircle(c, counts[c.code] || 0, ''); o.ownerName = c.ownerName; o.created = c.created; return o; }) };
}
function adminCircleStatus(b) {
  var code = cleanCircleCode(b.code), status = String(b.status || ''), c = code && findCircle(code);
  if (!c) return { ok: false, err: 'notfound' };
  if (['ACTIVE', 'CLOSED', 'HIDDEN'].indexOf(status) < 0) return { ok: false, err: 'status' };
  c.status = status; writeCircle(c); dropCircleCache(code);
  return { ok: true, circle: pubCircle(c, null, '') };
}
function adminCircleKick(b) {
  var code = cleanCircleCode(b.code), pid = String(b.pid || '');
  if (!code || !/^[a-f0-9]{8}$/.test(pid)) return { ok: false, err: 'pid' };
  var members = readMembers();
  for (var i = 0; i < members.length; i++) if (members[i].code === code && members[i].pid === pid && members[i].status === 'ACTIVE') { memberSheet().getRange(members[i].row, MEMBER_HEAD.length).setValue('REMOVED'); break; }
  dropCircleCache(code);
  return { ok: true };
}

/* ---------- staff: change a player's display name, and erase a player's personal data on request ---------- */
function adminRename(b) {                                           // renames the player behind a score code everywhere (all their scores, their circles)
  var row = findByCode(String(b.code || '').toUpperCase().trim()), name = cleanName(b.name);
  if (!row) return { ok: false, err: 'notfound' };
  if (!name) return { ok: false, err: 'name' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, err: 'busy' }; }
  try {
    var sh = sheet(), pid = String(sh.getRange(row, COL.PID).getValue()), last = sh.getLastRow(), changed = 0;
    if (!pid || pid === 'erased') return { ok: false, err: 'notfound' };
    var pids = sh.getRange(2, COL.PID, last - 1, 1).getValues(), names = sh.getRange(2, COL.NAME, last - 1, 1).getValues();
    for (var i = 0; i < pids.length; i++) if (String(pids[i][0]) === pid) { names[i][0] = name; changed++; }
    sh.getRange(2, COL.NAME, last - 1, 1).setValues(names);
    try {
      var ms = readMembers(); ms.forEach(function (m) { if (m.pid === pid) memberSheet().getRange(m.row, 3).setValue(name); });
      readCircles().forEach(function (c) { if (c.owner === pid) { c.ownerName = name; writeCircle(c); dropCircleCache(c.code); } });
    } catch (e) {}
  } finally { lock.releaseLock(); }
  dropBoards();
  return { ok: true, changed: changed, name: name };
}
function adminErase(b) {                                            // a player asks us to delete their data: by mobile number, or by one of their score codes
  var contact = cleanContact(b.contact), code = String(b.code || '').toUpperCase().trim(), sh = sheet(), last = sh.getLastRow();
  if (code && !contact) { var r0 = findByCode(code); if (!r0) return { ok: false, err: 'notfound' }; contact = cleanContact(sh.getRange(r0, COL.CONTACT).getValue()); if (!contact) return { ok: false, err: 'nocontact' }; }
  if (!contact) return { ok: false, err: 'contact' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, err: 'busy' }; }
  var rowsHit = 0, members = 0, circles = 0;
  try {
    var pid = hmacHex('pid|c' + contact).slice(0, 8);
    if (last >= 2) {
      var n = last - 1, idv = sh.getRange(2, COL.NAME, n, 3).getValues(), st = sh.getRange(2, COL.STATUS, n, 1).getValues(), nt = sh.getRange(2, COL.NOTE, n, 1).getValues();   // Name, Contact, PID | Status | Note
      for (var i = 0; i < n; i++) {
        if (String(idv[i][2]) === pid || cleanContact(idv[i][1]) === contact) {
          idv[i] = ['Deleted player', '', 'erased']; st[i][0] = 'VOID'; nt[i][0] = (String(nt[i][0] || '') + ' ERASED').trim(); rowsHit++;
        }
      }
      if (rowsHit) { sh.getRange(2, COL.NAME, n, 3).setValues(idv); sh.getRange(2, COL.STATUS, n, 1).setValues(st); sh.getRange(2, COL.NOTE, n, 1).setValues(nt); }
    }
    readMembers().forEach(function (m) { if (m.pid === pid && m.status !== 'REMOVED') { memberSheet().getRange(m.row, 3, 1, 3).setValues([['', m.joined, 'REMOVED']]); dropCircleCache(m.code); members++; } });
    readCircles().forEach(function (c) { if (c.owner === pid) { c.ownerName = 'Deleted'; c.status = 'HIDDEN'; writeCircle(c); dropCircleCache(c.code); circles++; } });
  } finally { lock.releaseLock(); }
  dropBoards();
  return { ok: true, scores: rowsHit, members: members, circles: circles };
}

/* ---------- helpers ---------- */
var _props = {}, _sheet = null;
function cellText(v) { if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM'); return v == null ? '' : String(v); }   // a season Sheets turned into a date or number is read back as text
function prop(k) { if (!(k in _props)) _props[k] = PropertiesService.getScriptProperties().getProperty(k); return _props[k]; }
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function manila(ms) { var d = new Date(ms + CONFIG.TZ_OFFSET_H * 3600000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: (d.getUTCDay() + 6) % 7 }; }   // dow: Monday = 0
function manilaMs(y, m, d) { return Date.UTC(y, m, d) - CONFIG.TZ_OFFSET_H * 3600000; }                                                              // midnight (Philippine time) of that date
function weekInfo(now) {
  var p = manila(now), startMs = manilaMs(p.y, p.m, p.d - p.dow), endMs = startMs + 7 * 86400000, a = manila(startMs), b = manila(endMs - 1);
  return { id: 'wk-' + a.y + '-' + pad2(a.m + 1) + '-' + pad2(a.d), label: 'Week of ' + MONTHS[a.m] + ' ' + a.d + '–' + (b.m === a.m ? '' : MONTHS[b.m] + ' ') + b.d, kind: 'weekly', start: startMs, end: endMs, resetAt: endMs };
}
function monthInfo(now) {
  var p = manila(now), s = manilaMs(p.y, p.m, 1), e = manilaMs(p.y, p.m + 1, 1);
  return { id: 'mo-' + p.y + '-' + pad2(p.m + 1), label: MONTHS_LONG[p.m] + ' ' + p.y, kind: 'monthly', start: s, end: e, resetAt: e };
}
// The single source of truth for "which board is this mode on right now": its id (stored in the Sheet), a readable label, and when it resets.
// The game, the staff page and this script all read it from here, so they can never disagree.
function seasonInfo(mode, now) {
  now = now || Date.now();
  if (mode === 'rank') {
    var c = getComp(), cs = c && compState(c, now);
    if (c && (cs === 'live' || cs === 'closing' || cs === 'ended')) return { id: c.season, label: c.name, kind: 'competition', start: c.start, end: c.end, resetAt: 0, state: cs };   // Rank has its own board during a competition and keeps the final standings afterwards
  }
  var manual = prop('SEASON');
  if (manual) return { id: manual, label: manual, kind: 'manual', start: 0, end: 0, resetAt: 0 };
  if (CONFIG.AUTO_SEASON === 'weekly') return weekInfo(now);
  if (CONFIG.AUTO_SEASON === 'monthly') return monthInfo(now);
  return { id: CONFIG.DEFAULT_SEASON, label: CONFIG.DEFAULT_SEASON, kind: 'manual', start: 0, end: 0, resetAt: 0 };
}
function getSeason(mode) { return seasonInfo(mode).id; }
function labelForSeason(id) {                                         // a readable name for any board id (also older boards)
  id = String(id || '');
  var m = /^wk-(\d{4})-(\d\d)-(\d\d)$/.exec(id);
  if (m) return weekInfo(manilaMs(+m[1], +m[2] - 1, +m[3]) + 3600000).label;
  m = /^mo-(\d{4})-(\d\d)$/.exec(id);
  if (m) return MONTHS_LONG[+m[2] - 1] + ' ' + m[1];
  var c = getComp(); if (c && c.season === id) return c.name;
  return id;
}
function serverId() { return hmacHex('server|' + prop('SHEET_ID')).slice(0, 6).toUpperCase(); }      // a short, harmless id of THIS Sheet, so everyone can see they are talking to the same one
function who() { return { release: CODE_VERSION, server: serverId(), rules: RULES_VERSION }; }
function allSeasons() { var o = {}; Object.keys(MODES).forEach(function (m) { o[m] = seasonInfo(m); }); return o; }

/* ---------- competition: staff set a start date and a duration; Rank scores in that window decide the winners ---------- */
function getComp() {
  var raw = prop('COMP');
  if (!raw) return null;
  try { var c = JSON.parse(raw); return c && c.start && c.end && c.season ? c : null; } catch (e) { return null; }
}
function compState(c, now) {
  if (!c) return 'none';
  if (now < c.start) return 'upcoming';
  if (now <= c.end) return 'live';
  if (now <= c.end + c.grace * 60000) return 'closing';     // over, but late uploads are still being accepted
  return 'ended';                                           // results are final: everyone can see the winners
}
function compWinners(c) {
  var cc = CacheService.getScriptCache(), key = 'compw_' + boardKey(c.season, 'rank'), raw = cc.get(key);
  if (raw) return JSON.parse(raw);
  var list = buildList('rank', c.season), res = { players: list.length, top: list.slice(0, 10).map(function (x, i) { return { r: i + 1, n: x.n, s: x.s, p: x.p }; }) };
  cc.put(key, JSON.stringify(res), 60);
  return res;
}
function actComp() {                                         // public: the game asks this to show the banner, the countdown and (after the deadline) the winners
  var now = Date.now(), c = getComp(), w = who(), out = { ok: true, rules: w.rules, release: w.release, server: w.server, now: now, state: 'none', rankSeason: getSeason('rank'), seasons: allSeasons() };
  if (!c) return out;
  out.state = compState(c, now); out.name = c.name; out.start = c.start; out.end = c.end; out.grace = c.grace;
  if (out.state === 'ended') out.winners = compWinners(c);
  return out;
}
function adminComp() { var c = getComp(), now = Date.now(); return { ok: true, now: now, comp: c ? { name: c.name, start: c.start, end: c.end, grace: c.grace, season: c.season, state: compState(c, now) } : null }; }
function adminCompSet(b) {
  var name = String(b.name || '').replace(/[\u0000-\u001f<>&"'`\\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
  var start = Math.round(+b.start), end = Math.round(+b.end), grace = Math.max(0, Math.min(240, isNaN(parseInt(b.grace, 10)) ? CONFIG.COMP_GRACE_MIN : parseInt(b.grace, 10)));
  if (!name) return { ok: false, err: 'name' };
  if (!(start > 0 && end > start)) return { ok: false, err: 'dates' };
  if (end - start < 60000 || end - start > 90 * 86400000) return { ok: false, err: 'length' };
  var sp = manila(start), season = (name.slice(0, 22) + ' ' + pad2(sp.m + 1) + pad2(sp.d)).trim();
  PropertiesService.getScriptProperties().setProperty('COMP', JSON.stringify({ name: name, start: start, end: end, grace: grace, season: season }));
  _props = {}; dropBoards();
  return adminComp();
}
function adminCompClear() { PropertiesService.getScriptProperties().deleteProperty('COMP'); _props = {}; dropBoards(); return adminComp(); }

/* ---------- "why is the leaderboard empty?": reads your real Sheet and explains ---------- */
function adminDiag() {
  var sh = sheet(), ss = sh.getParent(), last = sh.getLastRow(), now = Date.now(), c = getComp();
  var w0 = who(), res = { ok: true, rules: RULES_VERSION, release: w0.release, server: w0.server, seasonsInfo: allSeasons(), now: now, spreadsheet: ss.getName(), sheetName: sh.getName(), sheetUrl: ss.getUrl(), rows: Math.max(0, last - 1), seasons: {}, boards: {}, compState: c ? compState(c, now) : 'none', compName: c ? c.name : '', oddSeasons: 0, hidden: { VOID: 0, TEST: 0 }, groups: [], recent: [] };
  Object.keys(MODES).forEach(function (m) { res.seasons[m] = getSeason(m); res.boards[m] = buildList(m, getSeason(m)).length; });
  var cc = CacheService.getScriptCache(), refused = {}, okN = +(cc.get('ts_ok') || 0);
  ['token', 'expired', 'version', 'mode', 'device', 'closed', 'name', 'contact', 'rate', 'time', 'clock', 'events', 'format', 'order', 'item', 'afterover', 'timing', 'kind', 'mismatch', 'used', 'busy', 'server', 'size', 'unknown'].forEach(function (k) { var n = +(cc.get('ts_' + k) || 0); if (n) refused[k] = n; });
  res.submits = { since: +(cc.get('ts_since') || 0), ok: okN, refused: refused };
  try { res.legacy = legacyThisWeek(readBoardRows()).length; } catch (e) { res.legacy = 0; }
  try { res.fails = JSON.parse(PropertiesService.getScriptProperties().getProperty('FAILS') || '[]'); } catch (e) { res.fails = []; }
  try { var hs = ss.getSheetByName('Health') || ss.insertSheet('Health'); hs.getRange(1, 1).setValue(new Date()); res.write = { ok: true }; } catch (e) { res.write = { ok: false, msg: String((e && e.message) || e).slice(0, 200) }; }   // can this script write to the Sheet at all?
  try { res.runsAs = Session.getEffectiveUser().getEmail(); } catch (e) { res.runsAs = ''; }
  try { res.refreshTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'refreshBoards'; }); } catch (e) { res.refreshTrigger = false; }
  if (last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, COL.STATUS).getValues(), g = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], sv = r[COL.SEASON - 1], st = String(r[COL.STATUS - 1] || '');
      if (typeof sv !== 'string' && sv !== '') res.oddSeasons++;
      if (st === 'VOID' || st === 'TEST') res.hidden[st]++;
      var key = cellText(sv) + '|' + cellText(r[COL.MODE - 1]) + '|' + st;
      g[key] = (g[key] || 0) + 1;
      if (i >= rows.length - 3) res.recent.push({ when: cellText(r[COL.WHEN - 1]), name: String(r[COL.NAME - 1]), mode: cellText(r[COL.MODE - 1]), season: cellText(sv), score: r[COL.SCORE - 1], status: st });
    }
    res.groups = Object.keys(g).map(function (k) { var p = k.split('|'); return { season: p[0], mode: p[1], status: p[2], n: g[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 30);
  }
  return res;
}
// Scores played THIS week that are filed under the old weekly name (like 2026-W42, from before v7) cannot show on today's board.
// This finds them (and, if asked, files them under the current board's name). Older weeks and other boards are never touched.
function legacyThisWeek(rows) {
  var out = [];
  if (prop('SEASON') || CONFIG.AUTO_SEASON !== 'weekly') return out;                  // only when boards follow the automatic weekly schedule
  var wk = weekInfo(Date.now());
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], s = cellText(r[COL.SEASON - 1]), m = cellText(r[COL.MODE - 1]);
    if (!/^\d{4}-W\d{1,2}$/.test(s) || !MODES[m] || !(+r[COL.MS - 1] >= wk.start)) continue;
    var info = seasonInfo(m); if (info.kind !== 'weekly') continue;                    // Rank during a competition keeps its own board
    out.push({ i: i, to: info.id });
  }
  return out;
}
function adminAdopt() {
  var sh = sheet(), last = sh.getLastRow(), moved = 0;
  if (last >= 2) {
    var found = legacyThisWeek(readBoardRows());
    if (found.length) { textColumns(sh); var rng = sh.getRange(2, COL.SEASON, last - 1, 1), vals = rng.getValues(); found.forEach(function (f) { vals[f.i][0] = f.to; moved++; }); rng.setValues(vals); }
  }
  _props = {}; dropBoards();
  return { ok: true, moved: moved };
}
function adminRepair() {                                              // turn seasons that Sheets changed into dates or numbers back into text, and keep the columns as text from now on
  var sh = sheet(), last = sh.getLastRow(), fixed = 0;
  textColumns(sh);
  if (last >= 2) {
    [COL.SEASON, COL.MODE, COL.STATUS].forEach(function (c) {
      var rng = sh.getRange(2, c, last - 1, 1), vals = rng.getValues(), changed = false;
      for (var i = 0; i < vals.length; i++) { var v = vals[i][0]; if (typeof v !== 'string' && v !== '') { vals[i][0] = cellText(v); changed = true; fixed++; } }
      if (changed) rng.setValues(vals);
    });
  }
  _props = {}; dropBoards();
  return { ok: true, fixed: fixed };
}

function sheet() { if (!_sheet) { _sheet = SpreadsheetApp.openById(prop('SHEET_ID')).getSheetByName(CONFIG.SHEET); ensureUniCol(_sheet); } return _sheet; }
function ensureUniCol(sh) {   // older sheets get the Unicorn (id, used by the leaderboard) and Unicorn Name (for staff) columns once
  try {
    if (sh.getMaxColumns() < COL.CONSENT) sh.insertColumnsAfter(sh.getMaxColumns(), COL.CONSENT - sh.getMaxColumns());
    [[COL.UNI, 'Unicorn'], [COL.UNAME, 'Unicorn Name'], [COL.CONSENT, 'Consent']].forEach(function (x) { if (String(sh.getRange(1, x[0]).getValue()) !== x[1]) sh.getRange(1, x[0]).setValue(x[1]).setFontWeight('bold'); });
  } catch (e) {}
}
var UNAMES = { frost: 'Frost Unicorn', solar: 'Solar Blaze', void: 'Void Shadow', emerald: 'Emerald Nature', golden: 'Golden Sun' };

function randStr(n) { var s = '', a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
function safeEq(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function hmacRaw(s) { return Utilities.computeHmacSha256Signature(s, prop('SECRET')); }
function hmacHex(s) { return hmacRaw(s).map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join(''); }
function makeToken(o) { var b = Utilities.base64EncodeWebSafe(JSON.stringify(o)); return b + '.' + Utilities.base64EncodeWebSafe(hmacRaw(b)); }
function readToken(t) {
  if (typeof t !== 'string' || t.length > 600) return null;
  var p = t.split('.');
  if (p.length !== 2 || !safeEq(Utilities.base64EncodeWebSafe(hmacRaw(p[0])), p[1])) return null;
  try { return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString()); } catch (e) { return null; }
}
function makeCode(sid, score, mode, pid) { var h = hmacHex('code|' + sid + '|' + score + '|' + mode + '|' + pid).slice(0, 8).toUpperCase(); return 'RB-' + h.slice(0, 4) + '-' + h.slice(4); }
function cleanId(s) { s = String(s || ''); return /^[A-Za-z0-9_-]{8,40}$/.test(s) ? s : ''; }
function cleanName(s) { return String(s || '').replace(/[\u0000-\u001f<>&"'`\\\/]/g, '').replace(/^[=+\-@\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 12); }
/* ---------- name filter: player names, circle names ----------
   A basic list (English and Filipino), checked after turning look-alike characters into letters (a bad word with 0 for o, @ for a ... is still caught).
   Long roots match anywhere; short words only match as a whole word, so honest names are not blocked by accident ("Class" is fine).
   Names that look like contact details (a long number, an e-mail or a web address) are blocked too. It is a first line of defence, not a guarantee:
   staff can still rename a player (staff page) and hide a circle. Keep this list the same as BAD_ROOTS / BAD_WORDS in index.html. */
var BAD_ROOTS = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'rapist', 'hitler', 'putang', 'tangina', 'tarantado', 'pakyu', 'pakshet', 'kantot', 'jakol', 'hindot', 'pekpek', 'burat', 'kupal', 'ulol', 'puki', 'bayag', 'gago', 'dickhead', 'pussy', 'penis', 'vagina', 'blowjob'];
var BAD_WORDS = ['cock', 'ass', 'tits', 'sex', 'rape', 'puta', 'bobo', 'tanga', 'tite', 'fag', 'kike', 'nazi', 'porn', 'wtf', 'stfu', 'kys'];
function nameBlocked(s) {
  var raw = String(s || '').toLowerCase();
  if (/\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d[\s.\-]*\d/.test(raw) || /@|https?:|www\.|\.(com|net|org|ph|io)\b/.test(raw)) return true;
  var map = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' }, t = raw.replace(/[01345878@$!|]/g, function (c) { return map[c]; });
  var squeezed = t.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1'), i;
  for (i = 0; i < BAD_ROOTS.length; i++) if (squeezed.indexOf(BAD_ROOTS[i].replace(/(.)\1+/g, '$1')) >= 0) return true;
  var words = t.split(/[^a-z]+/).filter(Boolean);
  for (i = 0; i < words.length; i++) if (BAD_WORDS.indexOf(words[i].replace(/(.)\1+/g, '$1')) >= 0 || BAD_WORDS.indexOf(words[i]) >= 0) return true;
  return false;
}
function cleanContact(s) {
  var d = String(s || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('63') === 0) d = '0' + d.slice(2);
  return d.length >= 7 && d.length <= 15 ? d : '';
}


/* ---------- staff tool: record a score by hand for a player whose run could not be uploaded ----------
   Use only after staff have SEEN the proof (the player's My records screen or the result screen).
   1. Fill in the values below.  2. Pick  addManualScore  in the editor's function list and press Run.
   3. Check the log: it prints the verification code. The score appears on the leaderboard at once (marked MANUAL in the Note column). */
function addManualScore() {
  var P = {
    name: 'PLAYER NAME',          // as it should show on the board (12 letters max)
    contact: '09000000000',       // the player's mobile number (09...)
    score: 0,                     // the score staff saw
    mode: 'rank',                 // 'rank' or 'classic'
    uni: 'frost',                 // frost, solar, void, emerald or golden
    when: ''                      // optional: 'yyyy-MM-dd HH:mm:ss' of the run; leave empty for now
  };
  var name = cleanName(P.name), contact = cleanContact(P.contact), mode = MODES[P.mode] ? P.mode : '', score = Math.round(+P.score), uni = UNICORNS[P.uni] ? P.uni : 'frost';
  if (!name || name === 'PLAYER NAME' || !mode || !(score > 0)) { Logger.log('Fill in name, contact, score and mode first.'); return; }
  if (!/^09\d{9}$/.test(contact)) { Logger.log('The contact must be a Philippine mobile number: 09 followed by 9 digits.'); return; }
  var now = P.when ? new Date(P.when.replace(' ', 'T') + '+08:00').getTime() : Date.now(); if (isNaN(now)) now = Date.now();
  var sid = 'manual' + randStr(8), season = getSeason(mode), pid = hmacHex('pid|c' + contact).slice(0, 8), code = makeCode(sid, score, mode, pid);
  sheet().appendRow([now, Utilities.formatDate(new Date(now), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'), season, mode, name, contact, pid, score, code, 'REVIEW', 'OK', sid, '', '', '', '', '', '', 'MANUAL: added by staff after seeing proof', uni, UNAMES[uni] || '']);
  var c = CacheService.getScriptCache(); c.remove(boardKey(season, mode) + '_f');
  Logger.log('Recorded ' + score + ' for ' + name + ' (' + mode + ', ' + season + '). Verification code: ' + code);
}


/* ---------- speed check: run this once from the Apps Script editor, then read the log (View > Logs, or Execution log) ----------
   1. Pick  benchmark  in the function list and press Run.  2. Copy the log lines and send them to whoever is helping you.
   It only READS: it never writes a score, a circle or a setting. It times the things that make the server slow or fast:
   reading the Sheet, building a leaderboard, a cache round trip, and replaying a real recorded flight (the heavy part of checking a score).
   The recorded flight is a real Ranked run by the game's autopilot (about 2 minutes of play); replaying it many times acts like a long flight. */
var BENCH = {"seed":1111,"mode":"rank","uni":"frost","score":6277,"steps":4018,"tr":"O?OLONOOOOOOiOiOQOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O7OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOiOiOiOiOiOeOOOOOOOOOD<E<E<E<F<F;H;I;MCOMONOOOOOO5O5ODOOOOOOOOOOOOOOOOOOOOO5OJOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOMOLOMOLOMOLOMOLOiPGcHcHcHcIcIcJcKcNVOQOOOOOOOOOOT;T;T;T;T;S:T;U;RH5N5OcNOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOCbCbDbDbEbEbFbOcK]OQOPOOOOOOOOOOOOV:U:K:S:H;Q;J=pJhIhHgHQMiN\\OOOOOOOOOOO5OEOOOOOOOOOOOOOOOOOOOLOMOLOOOiOQO5O;O5OBOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOROOOOOQOOOROQOOOOO6OOOOOOOOOOObOOOOOOOOOOOOO5OJOOOOOOOOOOOOOOOOOOOOOOOiO5OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO^`_`d\\eZbZSYO[R^TeXhhThUPONPQPE7]@Yi$JBdOPiO`MSEYE<-E<D=D<KChJ`J@XK`R=U:]=WHOOOOOOOOOOOO5O5O=OOOOOOOiO`OOOOOOOOOOOOOOOOO<OOOOOOOaOOPOONOOOOONOOONOOO3PLMOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOTOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOJOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO[a[a[aZbZbZbYbWbP\\OKOROOOOOPOPOONPPPOOOPOO0M5P5P5P5QCPOOOOOOOOOOOOOOOOOOOOOOOOO:O:O:cBcBbAbAa@a@^>QJONOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOEbEbFbFcGcGcHcHcIcJcKd7G7G7F8F9EMLONOOOOOOOOOOOOO:O:O:O:hUhUhUhUhUhVhVgVgVgWgXWVOQOOOOOOOOOOOOOOOOBOWOGOWOGOWO@;J;K;J;K:L?hU;\\;]<]6U6V6V6V7V7V7W7X9YWQGOWOGOW:L:K:VHZbYbWcQYNQOONONOOONONOOONONOiOiOiOiOiOPOOOPOOOPOPOOOPOPOOOPOPOPOOOPOPOOOPOPOTOOONOOONOOOiOZOPOOO}ObOPOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOPPQPPOONMNMOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O5O5O5OBOSOMONNMOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O5O5PKOOOOOOOOOOOOOOOOOPOiOgOOOPOOOOOPOPOOOKOOOPOO:O:O:O:O:O:O:O=OKONOOOOOOOOiOiOiOiOiQiSJcKdKdKdLdLdMdO]ORPPO:O:O:O:O:O:O:P=OKUcTcUcTcTcSdRdQdOTNPNOOONONO5O5O5O5O5O5OCOOONO<OOOOOOOOOOOOOOOOOOOOONOOOOOOONOOOOONOOONOOOWOiOiOiOiOiOiOiOSOOOPOPOPOOOPOPOOOPOPOOOPOOOPOOOPOOOPOOOPOOO9OOONONOOONONOOONO5O>?>??????>@>@>B=B=H@OLONiOiOiOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-O}O-P}N\"b}E!\\xD!-}Z-W}P-P}O-O}O-O}V.J}b0?}=*Y}L*T}P*O}O*O}O*P}N)Q}N)Q}M'S}L&T}JWkcdOdOd9ZKZNYNXNVOUNTOSOR5R5R5RdQ@OYOFOXOGOWOHOVOdO?OOOiOiOiOiOiOiO_ONONOOONONOOONONOOOVOOOPOOOPOOOPOOOPOHOOOPO5O5O5O5O5O5O5OHONONOOONONOOONOOONOOONOOONOOOOONOOO;OOONOOONOOOOOiOiOa@a@a@a@`?`?_?_>^>_>5N5N5M5M5M5N5N5O5NNOOOOOOOOOOOOOOOOOOOOOOOiOiO\\OOOOOOOOOOOOOiOiOiOhOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O5O5O>OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOb]b]b]b^a^a^`_`__`]aV\\NQOPNOIOOONOOONOOONOOONOOOROPOOO5O5O5O5O5O5O5OFONOOONONOOONONOOONONONOOONONONONOOOiO3OMOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOF?P@PAOBPCPDPDPEMGNGRHPIPJOJOKOLPNONOOOPOQOQORORNROROSOSOSOSOSOTOTOTOTOTOTOThThUhVgWeZ:\\;]CZOQOPPOOOOOPOOOPOOOPOPOiOiOiOiOiOiOOOPOOOPOPOPOOOPOPOPOOOPOYOOONONOOONONONOIOOONONOOONOOONOOONOOO5O5ONOPOOOPOOOPOOOOOPOOOOOOOPO5O5O5O5O5O5OIONOOOOONOOOOONOOONOOONOOONONOOONOiOiOiOiO_ONONONOOONONONONOOONONONONOA>A=B=B=B=C=D<D<F;OKONOOOOOOOO@ODOQOPOOOPOPOOOPOPOPOOOPOPOOOPOPOPOOOPOPOOOPOPOPOOOPOPOOOPOPOPOOOPOPOOOOOhbfb`c\\cYdUdRdMcOVPQPOPOPOPOPOvOoOKOOOOOOOOOOOOOOOOOOOOONOoOAOROOOOOOOOOOO}OnOLOOOOOOONO@OC<D<D<D<R<L=M>L@LCLGMKNNOOOOOOOOOOOOPSOTOTOTOTOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUOTOTOTOTOUONW:MBNCMDNEQHOHMIMJOKOLOLNMOMONONONONONOOOOOOOOOOOO5O5OB=B=C=C=D<D<E<E<H<OKONOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO>OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOd[_[S`YdRkVcVcTcQ_NRNPOONONONOiOiOiOiOfOTSPTPRPPNNNKQIQGeTNPNONOOONONOO:O:O:O:O:N;?_?_?`@`@`A`BaMUOPNONONO`OPOOOOOOOPOOOOOOOOOOOOOOOGOPOOOPOPOOO5O5O5O5O7ONONOOONONONONOOONONONOOONONOOONONOOONONOOOiOiOiOiOiOiOiOiOiO[OOOPOPOPOOOPOPOPOPOOOPOPOPOPOOO=OPOOOPOPOOOPOOO5O5O5OL:M:+:_;=:d;::m?)HvM)OvO)OvO)OvO)OvO)OvO!_N_N_N^M]N\\N[NYNXNWOVNUOTOSORORNQOQOQOPOPOPOPOPOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOPPRPOOONMOMOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O5PFOOOPOOOOOPOOOOOPOOONOOOOOOONOOOOONOiOiOiOiOiOiOOONOOONOOONONOOONONOOONONONOiOiOiOPOPOPOOOPOPOOOPOPOOOPOOOPOOOPOOO5O5OHOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O7OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOZ<Y<Y<Y<X<X;<A=@>?JGOMOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO!OoO!OoO!OoO!c`b?b_a@b_a@a^`A`^_A_^]A^^\\A\\]ZC[[YDSYRFTWSGTWSFUWUGVVVHWV<J=UEJETFKGSHLIRILJRKLKRLMLPLOMOMOMOMONONONONONONONOONQLWNXLYNWKUQNLDcFCJZL}MhM^ZeZhLfD`@JJVOFRQ=FDP?UE=]6W8X8YCVO:O:O=c\\c]a^``PROOOPNPN=BJI@Q<^@<>=@>?>?@>D@OLONOOOOOOOOOOOOOOOOOOOOOOOOOOOOiOiOgOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO>_>_>_>_?_?`A`?YH`@`DbLKOQOP5M5M7MWOOOOOOOOOOOOOqOiOgOOOOOOOOOOOOOOOOOOOOOiOiO^OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOiOiOiOiOiOeOGOOOOOOOOOOOOOOOOOOOOOOOOOOOOO-OEOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO5O5O5O5OK:K:T;T;T;S:S:R:OKONOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOROQOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOkO!OwO!OwO!OwO!OwO!OwO!OwO!OwO!OwO!OwO!OwO!OwO!OYOFOWOHOUOJOSOLOQOMOQOMQRSLTRULURUMUQUMUQVMUQVMUQUMUQVMUQVMUQVMUQVMUQUMUQVMUPVMWPVLVQVKUVUFR^W>RcY;TcX;TcX;ScX;ScX;NdT;QeZ8RokaWISQTNUPVOWPXPXN;N<MCNDOENF7G7G6J7JGQOUMULVKXGWCXON>YOH5TA@F<S<NUPQOUPQHUSPlYYEnSK]XW[]eViKeCcBcB7G7G=R:V>Im[;PAJo_=MALo^>MULa^@O?OYNmJeCdCfF;<P:P:Q;T;Q:O:O:N:OA>_>_?_?_?`@`@_B`I^PRNPPOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO:ZbZbXbXcVcUcTcS^iLhOgQeUaX[\\V]S^Q^;<:<:C9D9D9E8E7G5KZ<Z<Z<Z<Z<Z<[<\\=LdMdMdMdMdN\\OQOPOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOPOOOOOPOPOOOPOPOPOQOPOQOPOQOQOQOQOROQOQOROQOROROQOROROQOROQOQOROQOQOQOQOQOQOQOQOPOQOQOPOQOPOQOPOPOQOPOPOPOPOPOPOPOOOPOPOOOPOOOPOOOOOOOOOOOOOOOOOOOOONOOONOOONOOONONONONOOOMONONONONONOMONOMONOMONOMOMONOMOMOMOMOMOMOMOMOMOMOMOMOMOLOMOMOMOLOMOLOMO!YgH!T!PiL!N!OiN!L!LiO!J!IqQ!G!F!F!F!F!FnXfYeZeZc\\TWLQMOMOMOLOMOMOMOMOMOMOMOMOMOMOMONOMOMONOMOMONONOMONONOMONONONONONONONOOONONOOONOOONOOOOOOOOONOOOPOOOOOOOOOPOOOPOOOPOPOOOPOPOPOPOPOPOPOPOQOPOPOQOPOQOPOQOPOQOQOQOPOQPPPPPQPPPQQPPQQPQQPQRRPQRRPRSSOSSSQSQRQRPRQQQQQPQQRPQQQPRQQPQPRQQPRQRQQQRQQRRSQTQVQXNWLSNOPPPPQPQOQPPPQOQPPOQPPNPPNLMPED4X4]>WDQMPNQOPOQOPOQOPOPOPOPOPOPOPOPOPOPOOOPOOOPOOOPOOOOOOOOOPOOONOOOOOOOOONOOONOOONONONOOONONONONONPNPNPNQNPNQMPNQMPMQMQMPMQMPMQMOMQNPMPOOMQPPLPROIOYL7L}*-CM]NIKUMMLRLOMQLPMPLOMP}Y6I}S5L}O5M}O}N5O}L5O}I}I5Q}G-Q}E-R}C}B}B}B|AzAyAxAv@u@2[;\\;\\;\\;\\;\\;\\;]<]<]=^CZNQMPMONONOMONONONOMONONONOOONONONOOONONOOOOONOOOOOOONOOOOOPOOOOOOOPOOOOOPOPOOOPOPOPOPOOOPOQOPOPOPOPOQOPPPPPPQPPPPQQPQQPPQQQQQPPQQQQPQQPPQQPQPRPQPRPRPRQQPSQQQSRQRSTQURVPTOQPQQOQPQPQORPQOQPQORPQOQOQORPQOROQOQOQOQOQOKKPSMHJ\\?K#a@b@a@UIQMQOQOQOQOQOPOQOQOPOQOQOPOPOQOPOPOQOPOPOPOPOPOPOPOOOPOPOOOPOOOPOOOOOOOOOPOOONOOOOOOOOONOOONOOONONOOONONONONONONONONPMONPNPNPMQNPNQNPMPNRNONRNONRNPNQNPNRORNRORNRNRNSMRMSKRISGQDOGKOKMKQFJ6R6IVLPMOLP!YgE!V!PiL!O!OiN!L!LqO!J!I!H!H!H!H!GoWfXfYeZZXLQMOMOMOMOMOMOMOMONOMOMOMONOMOMONONOMONOMONONONONONONONONONONOOONOOONOOONOOOOOOOOONOOOPOOOOOOOOOPOOOPOOOPOPOPOOOPOPOPOPOPOPOQOPOPOQOPOQOPOQOPOQOQOPOQOQOQOQOQOQOQOQOQOQOQOROQOQOQOROQOQOROQOROQOROQOROQOROQOROQOROQOROQOROQOROQOROQOROQOQOROQOROQOQOQOROQOQOQOQOQOQOROQOPOQOQOQOQOQOPOQOPOQOQOPOPOQOPOPOPOQOPOPOPOOOPOPOPOOOPOPOOOOOPOOOOOOOPOOOOONOOOOOOONOOOOONONOOONONONONOOONOMONONONONPMPNPMPNPMPNQMPMPNQMPNQMPNQNPNQMPOQMPOQORNQORNRORORNRORORNRORNRNRNSNRMSLSJSGSDP@KGGTJJD}=","sk":"2913","cd":"","rv":"3270,3779"};
function benchmark() {
  var out = [], t, ms = function (t0) { return Math.round(Date.now() - t0); }, log = function (s) { out.push(s); Logger.log(s); };
  log('Rainbrew Sky speed check · release ' + CODE_VERSION + ' · rules ' + RULES_VERSION);
  t = Date.now(); var rows = readBoardRows(); var tRead = ms(t);
  log('1. Read every score row (without the long Events column): ' + tRead + ' ms for ' + rows.length + ' rows');
  t = Date.now(); var season = getSeason('rank'), list = buildList('rank', season, rows); var tBuild = ms(t);
  log('2. Build the Ranked leaderboard from those rows: ' + tBuild + ' ms (' + list.length + ' players this season)');
  t = Date.now(); var c = readCircles().length, m = readMembers().length; var tCirc = ms(t);
  log('3. Read the Circles and Members tabs: ' + tCirc + ' ms (' + c + ' circles, ' + m + ' memberships)');
  var cc = CacheService.getScriptCache(), n = 20; t = Date.now();
  for (var i = 0; i < n; i++) { cc.put('bench_' + i, 'x', 30); cc.get('bench_' + i); }
  var tCache = ms(t); log('4. Cache write+read: ' + (tCache / n).toFixed(1) + ' ms each (' + n + ' round trips)');
  var G, runs = 20, ok = true; t = Date.now();
  for (var r = 0; r < runs; r++) {
    G = simulate(BENCH.seed, BENCH.mode, BENCH.uni, BENCH.tr, false, String(BENCH.sk).split(',').filter(function (x) { return x !== ''; }).map(Number), '', BENCH.cd, BENCH.rv);
    if (G.score !== BENCH.score) ok = false;
  }
  var tSim = ms(t), steps = BENCH.steps * runs, per = tSim / steps * 1000;
  log('5. Replay a recorded flight ' + runs + ' times (' + steps + ' game steps, about ' + (steps / SPS / 60).toFixed(0) + ' minutes of play): ' + tSim + ' ms = ' + per.toFixed(1) + ' microseconds per step · ' + (ok ? 'every replay matched the recorded score' : 'WARNING: a replay did NOT match the recorded score (the server and the game rules differ)'));
  [5, 30, 180].forEach(function (min) { log('   so checking a ' + min + '-minute flight takes about ' + Math.round(min * 60 * SPS * per / 1000) + ' ms'); });
  var notes = [];
  if (tRead > 4000) notes.push('Reading the Sheet is slow (' + tRead + ' ms): the leaderboard refresh may time out as scores grow; this is the sign to move to a real database.');
  if (tCirc > 1500) notes.push('The Circles/Members tabs are slow to read (' + tCirc + ' ms).');
  if (per > 150) notes.push('Replay is slow on this server (' + per.toFixed(0) + ' microseconds per step).');
  log(notes.length ? 'Verdict: ' + notes.join(' ') : 'Verdict: nothing slow right now. Run this again when you have many more scores, and after a busy contest.');
  return out;
}
