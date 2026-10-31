/**
 * Artificial-life sim for the hero: tiny fish schools and the sharks that hunt them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see the shark. Fleeing fish break sideways around the
 * shark's path, which gives the fountain effect seen in real bait balls.
 *
 * Sharks: Reynolds steering (wander + pursuit + separation) on a
 * follow-the-leader spine. Hunger builds over time and drops when they eat.
 * They prefer fish in sparse spots, since dense schools confuse predators,
 * so stragglers get picked off. Eaten fish come back later as new schools
 * swimming in from the edges, which keeps the population steady.
 */
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";

export const SHARK_NODES = 20;
export const RIPPLE_SPEED = 52;
export const PELLET_LIFE = 14;
export const BITE_LIFE = 0.45;
export const rippleLife = (r: Ripple) => 1.1 + r.strength * 1.4;

export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";
export type PatrolPattern = "orbit" | "figure8" | "lane" | "drift";

/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = { kind: SharkKind; size: number };

// Calm koi pond: classic silhouettes at varied depths (koi-tinted in the renderer).
const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.72 },
  { kind: "classic", size: 0.88 },
  { kind: "classic", size: 0.64 },
  { kind: "classic", size: 0.78 },
];

const PATTERNS: PatrolPattern[] = ["orbit", "figure8", "lane", "drift", "orbit"];
const MAX_PELLETS = 28;
const THROW_RADIUS = 28;
const RUSH_RANGE = 320;
const FEED_CALM = 0.55;

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 calm → 1 panicking. Spreads to neighbours. */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** Tail-beat phase. */
  phase: number;
  /** Smoothed angular velocity (rad/s); hard turns flash silver. */
  turn: number;
  /** 0.55 far → 1 near. */
  depth: number;
  /** Rotation sense shared by a school when it mills into a bait ball. */
  millDir: 1 | -1;
}

export interface Shark {
  id: number;
  kind: SharkKind;
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Tail-beat phase; drives the body wave in the renderer. */
  phase: number;
  /** Smoothed angular velocity (rad/s); the shark banks its fins into turns. */
  turn: number;
  hunger: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  /** Distinct cruising style so each koi reads differently in the pond. */
  pattern: PatrolPattern;
  /** Lane pattern: 0 = horizontal, 1 = vertical. */
  laneAxis: 0 | 1;
  curiosity: number;
  /** 1 after nearby food lands; fades while the koi sprints. */
  rush: number;
  /** Pellet this koi is committed to. */
  food: Pellet | null;
  target: Fish | null;
  retargetAt: number;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
  /** When this koi next sheds a small wake ring from its tail. */
  nextWake: number;
}

export interface Pellet {
  x: number;
  y: number;
  born: number;
  landAt: number;
  landed: boolean;
  vx: number;
  vy: number;
}

export interface Ripple {
  x: number;
  y: number;
  born: number;
  strength: number;
}

export interface Bite {
  x: number;
  y: number;
  born: number;
}

export interface WorldEvent {
  kind: "eat" | "splash";
  x: number;
  y: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  sharks: Shark[] = [];
  pellets: Pellet[] = [];
  ripples: Ripple[] = [];
  bites: Bite[] = [];
  events: WorldEvent[] = [];
  pointer = { x: 0, y: 0, active: false, speed: 0 };
  lastFeed = -999;

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private tmp = { x: 0, y: 0 };

  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(
    private sharkSpecs: SharkSpec[] = DEFAULT_SHARKS,
    private fishCount?: number,
  ) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Spacing is set in grid cells so every fish lands in its own cell.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || this.fish.length === 0) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseLength = clamp(minSide * 0.44, 170, 430);
    const sharkCount = this.sharkSpecs.length;

    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const { kind, size } = this.sharkSpecs[i];
      const length = baseLength * size;
      const orbitRadius = minSide * rand(0.28, 0.4);
      const a = (i / sharkCount) * TAU + rand(-0.4, 0.4);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
      const y = H / 2 + Math.sin(a) * orbitRadius;
      const heading = a + (orbitDir * Math.PI) / 2;
      const nodes = new Float32Array(SHARK_NODES * 2);
      const seg = length / (SHARK_NODES - 1);
      for (let n = 0; n < SHARK_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.sharks.push({
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: 26 + size * 10,
        phase: rand(0, TAU),
        turn: 0,
        hunger: rand(0.25, 0.75),
        wander: 0,
        orbitDir,
        orbitRadius,
        pattern: PATTERNS[i % PATTERNS.length],
        laneAxis: i % 2 === 0 ? 0 : 1,
        curiosity: 0.55 + rand(0, 0.45),
        rush: 0,
        food: null,
        target: null,
        retargetAt: 0,
        depth: size,
        nextWake: rand(0, 2),
      });
    }
    // Smaller (farther) sharks draw first so the big one swims over them.
    this.sharks.sort((a, b) => a.length - b.length);

    const total = this.fishCount ?? clamp(Math.round((W * H) / 4400), 85, 340);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      // Mostly level headings: fish cruise sideways far more than up or down.
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  splash(x: number, y: number) {
    this.feed(x, y);
  }

  /** Throw a handful of pellets with an ASCII ripple splash (daoho-style). */
  feed(x: number, y: number) {
    this.lastFeed = this.time;
    this.ripples.push({ x, y, born: this.time, strength: 0.55 });
    const count = Math.min(5 + Math.floor(Math.random() * 3), MAX_PELLETS - this.pellets.length);
    for (let k = 0; k < count; k++) {
      const a = rand(0, TAU);
      const r = Math.sqrt(Math.random()) * THROW_RADIUS;
      const drift = rand(2, 6);
      this.pellets.push({
        x: x + Math.cos(a) * r * 1.3,
        y: y + Math.sin(a) * r,
        born: this.time,
        landAt: rand(0.15, 0.45),
        landed: false,
        vx: Math.cos(a) * drift,
        vy: Math.sin(a) * drift,
      });
    }
  }

  step(dt: number) {
    this.time += dt;
    this.pointer.speed *= Math.exp(-dt * 8);
    this.rebuildHash();
    this.stepFish(dt);
    this.stepSharks(dt);
    this.stepPellets(dt);
    this.respawn();
  }

  private stepPellets(dt: number) {
    const t = this.time;
    this.pellets = this.pellets.filter((p) => t - p.born < PELLET_LIFE);
    for (const p of this.pellets) {
      if (!p.landed) {
        if (t - p.born < p.landAt) continue;
        p.landed = true;
        this.ripples.push({ x: p.x, y: p.y, born: t, strength: 0.12 });
        for (const sh of this.sharks) {
          if (Math.hypot(sh.nodes[0] - p.x, sh.nodes[1] - p.y) < RUSH_RANGE) sh.rush = 1;
        }
        continue;
      }
      const damp = Math.exp(-dt * 0.2);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.ripples = this.ripples.filter((r) => t - r.born < rippleLife(r));
    this.bites = this.bites.filter((b) => t - b.born < BITE_LIFE);
  }

  private pickFood(sh: Shark, hx: number, hy: number, range: number): Pellet | null {
    if (sh.food && this.pellets.includes(sh.food) && sh.food.landed) {
      const d = Math.hypot(sh.food.x - hx, sh.food.y - hy);
      if (d < range * 1.35) return sh.food;
    }
    let best: Pellet | null = null;
    let bestD = range;
    for (const p of this.pellets) {
      if (!p.landed) continue;
      const d = Math.hypot(p.x - hx, p.y - hy);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    sh.food = best;
    return best;
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // shark and closes back up once the threat fades.
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // Blind zone directly behind the fish.
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // Elliptical personal space: wide along x, tight along y.
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // Different species keep their own schools.
                    const k = ((1 - d / foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          // Circle the local centre: the school spins into a bait ball.
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // Predators. Distance is measured to the nearest point along the front
      // half of the shark, so fish also give the flanks a wide berth.
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // Fountain effect: break to whichever side of the shark's path you're on.
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }

      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // Soft walls.
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // Ambient current and a little individual restlessness.
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // Relax toward a preferred speed that rises with panic.
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }

  private stepSharks(dt: number) {
    const { sharks, width: W, height: H, time, pointer } = this;
    const minSide = Math.min(W, H);
    const cxW = W / 2;
    const cyW = H / 2;

    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;
      const hx = nodes[0];
      const hy = nodes[1];

      sh.hunger = Math.min(1, sh.hunger + dt * 0.02);
      sh.rush = Math.max(0, sh.rush - dt * 0.55);

      // Momentum.
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);

      // Wander: a slowly drifting offset on a circle ahead of the snout.
      sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 2.4, -0.95, 0.95);
      dx += Math.cos(sh.heading + sh.wander) * 0.55;
      dy += Math.sin(sh.heading + sh.wander) * 0.55;

      const food = this.pickFood(sh, hx, hy, Math.max(L * 1.6 + 220, sh.rush > 0 ? RUSH_RANGE : 0));
      let hunting = false;
      let closing = 0;
      let curious = false;

      if (food) {
        const tx = food.x - hx;
        const ty = food.y - hy;
        const d = Math.hypot(tx, ty) || 1;
        dx += (tx / d) * (2.8 + sh.rush * 1.4);
        dy += (ty / d) * (2.8 + sh.rush * 1.4);
        hunting = true;
        closing = clamp(1 - d / (L * 1.2), 0, 1);
      } else if (pointer.active && time - this.lastFeed >= FEED_CALM) {
        const tx = pointer.x - hx;
        const ty = pointer.y - hy;
        const d = Math.hypot(tx, ty) || 1;
        const range = 280;
        if (d < range) {
          const w = sh.curiosity * (1 - d / range) * 2.1;
          const near = clamp(d / (L * 0.55), 0, 1);
          // Approach, then circle under the cursor rather than parking.
          dx += ((tx / d) * near - (ty / d) * (1 - near) * sh.orbitDir) * w;
          dy += ((ty / d) * near + (tx / d) * (1 - near) * sh.orbitDir) * w;
          curious = true;
        }
      } else {
        // Distinct patrol patterns so each koi reads differently.
        this.applyPatrol(sh, hx, hy, cxW, cyW, W, H, minSide, time, (px, py) => {
          dx += px;
          dy += py;
        });
      }

      // Give other koi room (less while jostling for food).
      for (const other of sharks) {
        if (other === sh) continue;
        for (let k = 0; k < SHARK_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * (food ? 0.22 : 0.42);
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * (food ? 1.6 : 2.8);
            dx += (ox / d) * w;
            dy += (oy / d) * w;
          }
        }
      }

      // Soft keep-clear of the hero text zone (bottom-left).
      const zoneCx = W * 0.22;
      const zoneCy = H * 0.78;
      const zx = (hx - zoneCx) / (W * 0.22);
      const zy = (hy - zoneCy) / (H * 0.22);
      const z2 = zx * zx + zy * zy;
      if (z2 < 1) {
        const e = Math.sqrt(z2) || 1e-3;
        const w = (1 - e) * (hunting || curious ? 0.6 : 2.2);
        dx += (zx / e) * w;
        dy += (zy / e) * w;
      }

      // Turn back once the snout leaves the frame.
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.08) {
        const w = clamp((over + L * 0.08) / (L * 0.4), 0, 1) * 3.5;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      const agility = Math.min(
        hunting ? 1.85 + closing + sh.rush * 0.5 : curious ? 1.15 : 0.75,
        sh.speed / (L * 0.2),
      );
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 26 + L * 0.045 + (sh.pattern === "lane" ? 6 : 0);
      const targetSpeed = hunting
        ? cruise * (1.55 + closing * 1.6 + sh.rush * 0.35)
        : curious
          ? cruise * 1.15
          : cruise;
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * 1.15);
      sh.phase += dt * (2 + sh.speed / 24);

      // Tail beats near the surface push small ASCII rings out behind the koi.
      const beat = clamp(sh.speed / Math.max(cruise, 1), 0, 1.6);
      if (beat > 0.7 && sh.depth > 0.62 && time > sh.nextWake) {
        const tail = (SHARK_NODES - 3) * 2;
        this.ripples.push({
          x: nodes[tail],
          y: nodes[tail + 1],
          born: time,
          strength: 0.18 + 0.22 * sh.depth * Math.min(1, beat),
        });
        sh.nextWake = time + rand(0.75, 1.55) / Math.max(0.55, beat);
      }

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;

      // Follow-the-leader spine.
      const seg = L / (SHARK_NODES - 1);
      const maxBend = 0.16;
      let prevAngle = sh.heading + Math.PI;
      for (let k = 1; k < SHARK_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }

      // Eat pellets.
      const mouthR = L * 0.06 + 10;
      const mx = nodes[0];
      const my = nodes[1];
      for (let i = this.pellets.length - 1; i >= 0; i--) {
        const p = this.pellets[i];
        if (!p.landed) continue;
        if ((p.x - mx) ** 2 + (p.y - my) ** 2 < mouthR * mouthR) {
          this.bites.push({ x: p.x, y: p.y, born: time });
          this.pellets.splice(i, 1);
          sh.hunger = Math.max(0, sh.hunger - 0.2);
          sh.rush = Math.max(sh.rush, 0.35);
          if (sh.food === p) sh.food = null;
        }
      }
    }
  }

  /** Steering contribution for each koi's signature cruise pattern. */
  private applyPatrol(
    sh: Shark,
    hx: number,
    hy: number,
    cxW: number,
    cyW: number,
    W: number,
    H: number,
    minSide: number,
    time: number,
    add: (dx: number, dy: number) => void,
  ) {
    const phase = time * 0.22 + sh.id * 1.7;
    if (sh.pattern === "orbit") {
      const rx = (hx - cxW) / (W / minSide);
      const ry = hy - cyW;
      const r = Math.hypot(rx, ry) || 1;
      const radius = sh.orbitRadius * (1 + 0.18 * Math.sin(time * 0.07 + sh.id));
      const radial = clamp((radius - r) / radius, -1, 1);
      add(((-ry / r) * sh.orbitDir + (rx / r) * radial * 0.95) * 0.7, ((rx / r) * sh.orbitDir + (ry / r) * radial * 0.95) * 0.7);
      return;
    }
    if (sh.pattern === "figure8") {
      // Lemniscate target the koi steers toward.
      const a = minSide * 0.28;
      const t = phase * 0.85;
      const s = Math.sin(t);
      const denom = 1 + s * s;
      const tx = cxW + (a * Math.cos(t)) / denom;
      const ty = cyW + (a * s * Math.cos(t)) / denom * 0.7 + (sh.id % 2 === 0 ? -H * 0.04 : H * 0.04);
      const ox = tx - hx;
      const oy = ty - hy;
      const d = Math.hypot(ox, oy) || 1;
      add((ox / d) * 1.35, (oy / d) * 1.35);
      return;
    }
    if (sh.pattern === "lane") {
      if (sh.laneAxis === 0) {
        const yTarget = H * (0.28 + (sh.id % 3) * 0.18);
        const dir = Math.cos(phase * 0.55) >= 0 ? 1 : -1;
        add(dir * 1.1, ((yTarget - hy) / H) * 2.4);
      } else {
        const xTarget = W * (0.25 + (sh.id % 3) * 0.2);
        const dir = Math.sin(phase * 0.5) >= 0 ? 1 : -1;
        add(((xTarget - hx) / W) * 2.4, dir * 1.1);
      }
      return;
    }
    // drift: wide lazy arcs, slower heading changes.
    const tx = cxW + Math.cos(phase * 0.35 + sh.id) * W * 0.32;
    const ty = cyW + Math.sin(phase * 0.28 + sh.id * 0.7) * H * 0.3;
    const ox = tx - hx;
    const oy = ty - hy;
    const d = Math.hypot(ox, oy) || 1;
    add((ox / d) * 0.85, (oy / d) * 0.85);
  }

  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  private findPrey(sh: Shark): Fish | null {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best: Fish | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    // Stick with the current target unless something is clearly better.
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    const due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // A new school swims in from a random edge.
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
