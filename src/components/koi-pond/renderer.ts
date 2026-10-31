/**
 * Draws the World as a grid of ASCII cells:
 *   1. a pure black cell grid
 *   2. a wake field that diffuses where things swim, lighting the dots cyan
 *   3. fish as minimal ASCII dashes, one per cell, glinting on hard turns
 *   4. sharks rasterised cell-by-cell with supersampled edges: grey blocks
 *      shaded by the light, dense glyphs, and shimmering accent colours
 */
import { clamp, hash3, smoothstep } from "./math";
import {
  BITE_LIFE,
  PELLET_LIFE,
  RIPPLE_SPEED,
  SHARK_NODES,
  rippleLife,
  type Shark,
  type SharkKind,
  type World,
} from "./world";

/** Pellets start sinking visually after this many seconds afloat. */
const PELLET_SINK_START = 8;

const ALPHA_LEVELS = 6;
const FISH_ALPHAS = [0.28, 0.42, 0.58, 0.74, 0.9];

// Dot colour classes + wake. Rebuilt per theme for monochromatic ponds.
type Rgb = [number, number, number];

const DOT_RGB_DARK: Rgb[] = [
  [120, 112, 104],
  [150, 140, 130],
  [200, 90, 50],
  [210, 200, 190],
  [160, 150, 140],
];
const DOT_RGB_LIGHT: Rgb[] = [
  [90, 84, 78],
  [110, 100, 92],
  [204, 62, 28],
  [70, 66, 62],
  [120, 110, 100],
];
const DOT_BASE_ALPHA = [1, 1, 1, 1, 1];
const WAKE = 4;

/** Koi marking accents only — warm orange / vermillion. */
const ACCENTS_DARK = ["#e45a2e", "#f08a34", "#c84a28", "#e0892c", "#fa8a34"];
const ACCENTS_LIGHT = ["#c84a28", "#e45a2e", "#d07030", "#b84020", "#e0892c"];

interface KoiPalette {
  bg: Rgb;
  white: Rgb;
  red: Rgb;
  black: Rgb;
  fin: Rgb;
  eye: Rgb;
  water: Rgb;
  pellet: Rgb;
  alpha: number;
  depthFloor: number;
  /** Skin mix toward page bg: [shadow, lit]. */
  tile: [number, number];
  /** Vermillion marking ramp: deep crimson → lit amber. */
  hi: Rgb[];
  ink: number;
}

const KOI_DARK: KoiPalette = {
  bg: [26, 25, 23],
  white: [245, 236, 224],
  red: [255, 98, 48],
  black: [72, 68, 82],
  fin: [228, 218, 208],
  eye: [16, 16, 20],
  water: [255, 247, 240],
  pellet: [236, 170, 92],
  alpha: 0.95,
  depthFloor: 0.55,
  // Keep cream tiles solid so markings read vividly against the pond.
  tile: [0.82, 1],
  hi: [
    [140, 18, 18],
    [196, 32, 22],
    [236, 54, 24],
    [255, 92, 28],
    [255, 140, 42],
    [255, 186, 88],
  ],
  ink: 0.38,
};

const KOI_LIGHT: KoiPalette = {
  bg: [245, 244, 241],
  white: [88, 84, 78],
  red: [220, 52, 22],
  black: [28, 26, 32],
  fin: [120, 114, 108],
  eye: [20, 18, 22],
  water: [38, 37, 35],
  pellet: [176, 108, 40],
  alpha: 0.96,
  depthFloor: 0.62,
  tile: [0.88, 0.7],
  hi: [
    [158, 18, 16],
    [204, 34, 18],
    [236, 58, 22],
    [252, 96, 32],
    [255, 138, 54],
    [255, 176, 96],
  ],
  ink: 0.42,
};

/** Glyph that follows a direction — used for ripple ring tangents. */
function lineGlyph(dx: number, dy: number) {
  const d = Math.hypot(dx, dy) || 1;
  if (Math.abs(dy) < 0.38 * d) return "-";
  if (Math.abs(dx) < 0.38 * d) return "|";
  return dx * dy > 0 ? "\\" : "/";
}

const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [
  (a[0] + (b[0] - a[0]) * k) | 0,
  (a[1] + (b[1] - a[1]) * k) | 0,
  (a[2] + (b[2] - a[2]) * k) | 0,
];

const shadeRgb = (c: Rgb, k: number): Rgb => [
  Math.min(255, c[0] * k) | 0,
  Math.min(255, c[1] * k) | 0,
  Math.min(255, c[2] * k) | 0,
];

const rampRgb = (stops: Rgb[], t: number): Rgb => {
  const x = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mixRgb(stops[i], stops[i + 1], x - i);
};

const rgbCss = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smoothstep(0, 1, x - xi);
  const v = smoothstep(0, 1, y - yi);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Marking ellipse in body space (s along spine, v across as fraction of length). */
type Patch = { s: number; v: number; rs: number; rv: number };
type Markings = { red: Patch[]; black: Patch[] };

function inPatch(m: Patch, s: number, vn: number, wobble: number) {
  return ((s - m.s) / m.rs) ** 2 + ((vn - m.v) / m.rv) ** 2 < 1 + wobble;
}

/**
 * Kohaku / sanke style: red head + 2–3 saddles on white; optional black spots.
 * Seeded by fish id so each koi keeps a stable pattern.
 */
function koiMarkings(id: number): Markings {
  const r = (j: number) => hash3(id, j, 41);
  const variety = r(99);
  if (variety < 0.18) {
    // Tancho: single crown disc.
    return { red: [{ s: 0.11, v: 0, rs: 0.05, rv: 0.055 }], black: [] };
  }

  const red: Patch[] = [];
  if (r(0) < 0.8) red.push({ s: 0.1, v: (r(1) - 0.5) * 0.03, rs: 0.055 + r(2) * 0.03, rv: 0.11 });
  const saddles = 2 + Math.floor(r(3) * 2);
  for (let j = 0; j < saddles; j++) {
    const span = 0.42 / saddles;
    red.push({
      s: 0.25 + span * (j + 0.5) + (r(10 + j) - 0.5) * span * 0.3,
      v: (r(20 + j) - 0.5) * 0.05,
      rs: span * (0.32 + r(30 + j) * 0.12),
      rv: 0.09 + r(40 + j) * 0.05,
    });
  }

  const black: Patch[] = [];
  if (variety > 0.62) {
    const spots = 4 + Math.floor(r(50) * 3);
    for (let j = 0; j < spots; j++) {
      black.push({ s: 0.24 + r(60 + j) * 0.44, v: (r(70 + j) - 0.5) * 0.16, rs: 0.022, rv: 0.026 });
    }
  }
  return { red, black };
}

// Sparse glyphs on bright skin, dense glyphs in shadow, so the texture
// reinforces the shading instead of fighting it.
const SKIN_RAMP = "t%SX8@#";
const FIN_GLYPHS = "%;tS:";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";


const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_RIDGE = 4;
const FLAG_EYE = 5;
/** Dark skin markings: tiger bars, zebra-shark spots. */
const FLAG_MARK = 6;

// Sub-cell sample offsets for anti-aliased silhouettes.
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

/** Classic top-down half-width at s ∈ [0, 1] (snout → tail), as a fraction of length. */
function classicHalfWidth(s: number) {
  if (s < 0.13) return 0.09 * Math.pow(Math.sin(((s / 0.13) * Math.PI) / 2), 0.95);
  if (s < 0.3) return 0.09 + 0.016 * smoothstep(0.13, 0.3, s);
  if (s < 0.84) return 0.019 + 0.087 * Math.pow(1 - (s - 0.3) / 0.54, 1.25);
  const k = (s - 0.84) / 0.16;
  return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
}

/** Body outline and fin layout per species. All values are fractions of length. */
interface SharkShape {
  halfWidth: (s: number) => number;
  /** Pectoral fin: leading root, trailing root, tip position along the body, and reach. */
  pectoral: [number, number, number, number];
  /** Notched (falcate) trailing edge on the pectorals. */
  falcate: boolean;
  /** Pelvic fins: leading root, trailing root, tip, reach. */
  pelvic: [number, number, number, number];
  /** Forked caudal fin reach, or 0 when the tail is a ribbon (zebra shark). */
  caudal: number;
  dorsal: [number, number];
  secondDorsal: [number, number];
  /**
   * Hammerheads' cephalofoil: half-span, how far its tips sweep back, its depth, and the
   * notch in the middle of the front edge. All fractions of length; absent for other sharks.
   */
  head?: { span: number; sweep: number; depth: number; notch: number };
  /** null when the eyes sit somewhere else (hammerhead: on the cephalofoil tips). */
  eye: [number, number] | null;
  gills: [number, number];
  /** Skin colour multipliers (r, g, b). */
  tint: [number, number, number];
}

const SHAPES: Record<SharkKind, SharkShape> = {
  classic: {
    halfWidth: classicHalfWidth,
    pectoral: [0.15, 0.43, 0.55, 0.26],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.085,
    dorsal: [0.33, 0.47],
    secondDorsal: [0.71, 0.76],
    eye: [0.1, 0.14],
    gills: [0.19, 0.29],
    tint: [1.06, 0.96, 0.88],
  },
  // Slim neck under a wide, swept-back cephalofoil (drawn in sampleShark),
  // tall first dorsal, long upper tail lobe. Bronze-olive grey.
  hammerhead: {
    halfWidth: (s) => {
      if (s < 0.06) return 0.045;
      if (s < 0.3) return 0.045 + 0.061 * smoothstep(0.06, 0.3, s);
      return classicHalfWidth(s) * 0.92;
    },
    head: { span: 0.17, sweep: 0.035, depth: 0.09, notch: 0 },
    pectoral: [0.17, 0.4, 0.5, 0.22],
    falcate: true,
    pelvic: [0.56, 0.63, 0.67, 0.075],
    caudal: 0.11,
    dorsal: [0.28, 0.44],
    secondDorsal: [0.7, 0.74],
    eye: null,
    gills: [0.16, 0.26],
    tint: [0.96, 0.98, 0.9],
  },
  // Blunt, square snout on a heavy body; barred back. Warm grey-brown.
  tiger: {
    halfWidth: (s) => {
      if (s < 0.13) return 0.1 * Math.pow(Math.sin(((s / 0.13) * Math.PI) / 2), 0.45);
      if (s < 0.3) return 0.1 + 0.014 * smoothstep(0.13, 0.3, s);
      if (s < 0.84) return 0.019 + 0.095 * Math.pow(1 - (s - 0.3) / 0.54, 1.2);
      const k = (s - 0.84) / 0.16;
      return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
    },
    pectoral: [0.15, 0.42, 0.53, 0.25],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.095,
    dorsal: [0.33, 0.46],
    secondDorsal: [0.71, 0.75],
    eye: [0.08, 0.12],
    gills: [0.19, 0.28],
    tint: [1.02, 0.95, 0.84],
  },
  // Short rounded head, body done by half-length, then a long ribbon of a
  // tail fin. Broad rounded pectorals, spotted sandy skin.
  zebra: {
    halfWidth: (s) => {
      if (s < 0.1) return 0.075 * Math.pow(Math.sin(((s / 0.1) * Math.PI) / 2), 0.7);
      if (s < 0.28) return 0.075 + 0.025 * smoothstep(0.1, 0.28, s);
      if (s < 0.55) return 0.022 + 0.078 * Math.pow(1 - (s - 0.28) / 0.27, 1.1);
      const k = (s - 0.55) / 0.45;
      return 0.022 * (1 - k * k) + 0.012 * Math.sin(k * Math.PI);
    },
    pectoral: [0.12, 0.3, 0.36, 0.19],
    falcate: false,
    pelvic: [0.42, 0.48, 0.51, 0.065],
    caudal: 0,
    dorsal: [0.36, 0.44],
    secondDorsal: [0.49, 0.53],
    eye: [0.06, 0.09],
    gills: [0.13, 0.2],
    tint: [1.08, 0.97, 0.74],
  },
  // Great hammerhead: a broader, nearly straight-edged cephalofoil with a notch at the centre,
  // a towering sickle first dorsal (drawn long and bright from above), and a cooler slate skin.
  greathammer: {
    halfWidth: (s) => {
      if (s < 0.05) return 0.04;
      if (s < 0.3) return 0.04 + 0.07 * smoothstep(0.05, 0.3, s);
      return classicHalfWidth(s) * 0.95;
    },
    head: { span: 0.21, sweep: 0.006, depth: 0.085, notch: 0.014 },
    pectoral: [0.16, 0.38, 0.49, 0.24],
    falcate: true,
    pelvic: [0.55, 0.62, 0.67, 0.085],
    caudal: 0.13,
    dorsal: [0.24, 0.45],
    secondDorsal: [0.68, 0.74],
    eye: null,
    gills: [0.15, 0.25],
    tint: [0.86, 0.93, 1.02],
  },
  // Shortfin mako: a long conical snout, a torpedo body that narrows hard to the tail stalk,
  // and a tall crescent tail. Metallic indigo back.
  mako: {
    halfWidth: (s) => {
      if (s < 0.17) return 0.088 * Math.pow(Math.sin(((s / 0.17) * Math.PI) / 2), 1.5);
      if (s < 0.32) return 0.088 + 0.012 * smoothstep(0.17, 0.32, s);
      if (s < 0.86) return 0.014 + 0.086 * Math.pow(1 - (s - 0.32) / 0.54, 1.45);
      const k = (s - 0.86) / 0.14;
      return 0.014 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
    },
    pectoral: [0.18, 0.4, 0.5, 0.21],
    falcate: true,
    pelvic: [0.58, 0.64, 0.68, 0.06],
    caudal: 0.13,
    dorsal: [0.34, 0.45],
    secondDorsal: [0.76, 0.79],
    eye: [0.11, 0.15],
    gills: [0.2, 0.3],
    tint: [0.78, 0.9, 1.2],
  },
  // Thresher: a compact body over the front half, then the upper tail lobe as a long whip
  // that's as long as the shark itself. Big eyes, long sickle pectorals, bronze-violet skin.
  thresher: {
    halfWidth: (s) => {
      if (s < 0.08) return 0.07 * Math.pow(Math.sin(((s / 0.08) * Math.PI) / 2), 0.75);
      if (s < 0.2) return 0.07 + 0.02 * smoothstep(0.08, 0.2, s);
      if (s < 0.48) return 0.012 + 0.078 * Math.pow(1 - (s - 0.2) / 0.28, 1.3);
      // The whip: thin, with a slight sickle swell before it tapers out.
      const k = (s - 0.48) / 0.52;
      return 0.012 * (1 - k) + 0.006 * Math.sin(k * Math.PI * 0.9) + 0.002;
    },
    pectoral: [0.12, 0.27, 0.36, 0.2],
    falcate: true,
    pelvic: [0.37, 0.41, 0.44, 0.045],
    caudal: 0,
    dorsal: [0.24, 0.32],
    secondDorsal: [0.45, 0.47],
    eye: [0.05, 0.1],
    gills: [0.11, 0.18],
    tint: [1.0, 0.9, 1.08],
  },
  // Nurse shark: a blunt, broad head, a heavy flattened body with both dorsals set far back,
  // rounded paddle pectorals, and a long low tail with no lower lobe. Tawny brown.
  nurse: {
    halfWidth: (s) => {
      if (s < 0.08) return 0.085 * Math.pow(Math.sin(((s / 0.08) * Math.PI) / 2), 0.4);
      if (s < 0.3) return 0.085 + 0.02 * smoothstep(0.08, 0.3, s);
      if (s < 0.72) return 0.022 + 0.083 * Math.pow(1 - (s - 0.3) / 0.42, 1.1);
      const k = (s - 0.72) / 0.28;
      return 0.022 * (1 - k * k) + 0.014 * Math.sin(k * Math.PI);
    },
    pectoral: [0.16, 0.34, 0.4, 0.17],
    falcate: false,
    pelvic: [0.45, 0.52, 0.55, 0.075],
    caudal: 0,
    dorsal: [0.5, 0.58],
    secondDorsal: [0.63, 0.69],
    eye: [0.05, 0.075],
    gills: [0.14, 0.22],
    tint: [1.1, 0.96, 0.76],
  },
};

const KINDS = Object.keys(SHAPES) as SharkKind[];

function inTriangle(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

export class AsciiRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = "ui-monospace, Menlo, monospace";
  private isLight = false;
  private accents = ACCENTS_DARK;
  private bgColor = "#1a1917";
  private palette: KoiPalette = KOI_DARK;
  private markingCache = new Map<number, Markings>();

  private dotKind = new Uint8Array(0); // 0 none, 1..4 palette, wake last
  private dotPhase = new Float32Array(0);
  private dotFreq = new Float32Array(0);
  private energy = new Float32Array(0);
  private energyTmp = new Float32Array(0);
  private heat = new Float32Array(0);
  private bucketOf = new Uint8Array(0);
  private bucketOrder = new Int32Array(0);
  private bucketCounts = new Int32Array(5 * ALPHA_LEVELS + 1);
  private dotStyles: string[] = [];

  private sharkFlag = new Uint8Array(0);
  private sharkShade = new Float32Array(0);
  private sharkKey = new Uint32Array(0);
  private sharkDepth = new Float32Array(0);
  private sharkKind = new Uint8Array(0);
  private sharkS = new Float32Array(0);
  private sharkV = new Float32Array(0);
  private sharkAcross = new Float32Array(0);
  private sharkCov = new Float32Array(0);
  private sharkOwner = new Int32Array(0);
  private sharkLen = new Float32Array(0);
  /** Cells darkened by a shark's shadow on the seabed. */
  private sharkShadow = new Uint8Array(0);
  private spine = new Float32Array(SHARK_NODES * 2);
  private arc = new Float32Array(SHARK_NODES);
  private arcTotal = 1;
  private shape = SHAPES.classic;
  private sharkId = 0;
  private finTipLeft = 0;
  private finTipRight = 0;
  // Scratch outputs of sampleShark(), to avoid allocating per sample.
  private hitFlag = 0;
  private hitShade = 0;
  private hitS = 0;
  private hitV = 0;
  private hitAcross = 0;
  private hitDist = 0;

  /** Cells holding a fish this frame (frame stamp); dots skip them. */
  private fishStamp = new Uint32Array(0);
  private frameId = 0;
  /** Fish cells bucketed by brightness, so each bucket is one fillStyle. */
  private fishBuckets: number[][] = FISH_ALPHAS.map(() => []);
  private fishStyles = FISH_ALPHAS.map((a) => `rgba(236,228,218,${a})`);

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.rebuildPaletteStyles();
  }

  setTheme(isLight: boolean) {
    if (this.isLight === isLight) return;
    this.isLight = isLight;
    this.bgColor = isLight ? "#f5f4f1" : "#1a1917";
    this.accents = isLight ? ACCENTS_LIGHT : ACCENTS_DARK;
    this.palette = isLight ? KOI_LIGHT : KOI_DARK;
    this.rebuildPaletteStyles();
    if (this.width > 0) this.paintBackground();
  }

  private rebuildPaletteStyles() {
    const dots = this.isLight ? DOT_RGB_LIGHT : DOT_RGB_DARK;
    this.dotStyles = [];
    for (let c = 0; c < dots.length; c++) {
      const [r, g, b] = dots[c];
      for (let l = 0; l < ALPHA_LEVELS; l++) {
        const a = (DOT_BASE_ALPHA[c] * (l + 1)) / ALPHA_LEVELS;
        this.dotStyles.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
      }
    }
    this.fishStyles = this.isLight
      ? FISH_ALPHAS.map((a) => `rgba(60,56,52,${a})`)
      : FISH_ALPHAS.map((a) => `rgba(236,228,218,${a})`);
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  setFontFamily(family: string) {
    if (family) this.fontFamily = family;
  }

  resize(width: number, height: number, dpr: number) {
    const prevCols = this.cols;
    const prevRows = this.rows;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // Smaller near-square tiles (daoho uses ~8–12; we go a step finer).
    this.cw = clamp(Math.round(width / 180), 5, 8);
    this.ch = this.cw + 2;
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;

    const n = this.cols * this.rows;
    if (this.cols !== prevCols || this.rows !== prevRows) {
      this.dotKind = new Uint8Array(n);
      this.dotPhase = new Float32Array(n);
      this.dotFreq = new Float32Array(n);
      this.energy = new Float32Array(n);
      this.energyTmp = new Float32Array(n);
      this.heat = new Float32Array(n);
      this.bucketOf = new Uint8Array(n);
      this.bucketOrder = new Int32Array(n);
      this.sharkFlag = new Uint8Array(n);
      this.sharkShade = new Float32Array(n);
      this.sharkKey = new Uint32Array(n);
      this.sharkDepth = new Float32Array(n);
      this.sharkKind = new Uint8Array(n);
      this.sharkS = new Float32Array(n);
      this.sharkV = new Float32Array(n);
      this.sharkAcross = new Float32Array(n);
      this.sharkCov = new Float32Array(n);
      this.sharkOwner = new Int32Array(n);
      this.sharkLen = new Float32Array(n);
      this.sharkShadow = new Uint8Array(n);
      this.fishStamp = new Uint32Array(n);
    }

    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = (i / this.cols) | 0;
      // No ambient dots: the grid stays black. Only the cyan wake lights cells.
      this.dotKind[i] = 0;
      this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
      this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
    }
    this.paintBackground();
  }

  private paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, bgColor } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = bgColor;
    g.fillRect(0, 0, W, H);
  }

  render(world: World, _dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;

    world.events.length = 0;
    this.rasterizeSharks(world.sharks, t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.font = `600 ${Math.round(ch * 0.72)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 1;

    // Ripples under the koi; pellets and bites on top.
    this.drawRipples(world);
    this.drawSharks(t);
    this.drawPellets(world);
    this.drawBites(world);
    ctx.globalAlpha = 1;
  }

  /** Expanding ASCII rings — glyphs follow the ring tangent (daoho style). */
  private drawRipples(world: World) {
    const { ctx, cw, ch, cols, rows, palette, sharkFlag } = this;
    for (const rp of world.ripples) {
      const age = world.time - rp.born;
      const life = rippleLife(rp);
      const fade = Math.pow(1 - age / life, 1.5) * rp.strength;
      for (let ring = 0; ring < 2; ring++) {
        const radius = Math.max(0, age - ring * 0.45) * RIPPLE_SPEED * (0.7 + 0.5 * rp.strength);
        if (radius < 2) continue;
        const band = cw * 0.65;
        const c0 = Math.max(0, Math.floor((rp.x - radius - cw) / cw));
        const c1 = Math.min(cols - 1, Math.floor((rp.x + radius + cw) / cw));
        const r0 = Math.max(0, Math.floor((rp.y - radius - ch) / ch));
        const r1 = Math.min(rows - 1, Math.floor((rp.y + radius + ch) / ch));
        const alpha = fade * (ring === 0 ? 0.42 : 0.22);
        ctx.fillStyle = rgbCss(palette.water);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const i = r * cols + c;
            if (sharkFlag[i]) continue;
            const dx = c * cw + cw / 2 - rp.x;
            const dy = r * ch + ch / 2 - rp.y;
            const d = Math.hypot(dx, dy);
            if (Math.abs(d - radius) > band) continue;
            const glyph = ring === 1 ? "." : lineGlyph(-dy, dx);
            ctx.globalAlpha = alpha;
            ctx.fillText(glyph, c * cw + cw / 2, r * ch + ch / 2 + 1);
          }
        }
      }
    }
  }

  private drawPellets(world: World) {
    const { ctx, cw, ch, palette } = this;
    for (const p of world.pellets) {
      const age = world.time - p.born;
      if (!p.landed) {
        const fall = age / p.landAt;
        const y = p.y - (1 - fall) * ch * 1.5;
        const i = this.cellIndex(p.x, y);
        if (i < 0) continue;
        ctx.globalAlpha = palette.alpha * (0.45 + 0.4 * fall);
        ctx.fillStyle = rgbCss(palette.pellet);
        ctx.fillText(fall < 0.5 ? "'" : ".", (i % this.cols) * cw + cw / 2, ((i / this.cols) | 0) * ch + ch / 2 + 1);
        continue;
      }
      const i = this.cellIndex(p.x, p.y);
      if (i < 0) continue;
      const sink = smoothstep(PELLET_SINK_START, PELLET_LIFE, age);
      const bob = 0.8 + 0.2 * Math.sin(age * 3 + p.x);
      ctx.globalAlpha = palette.alpha * bob * (1 - 0.85 * sink);
      ctx.fillStyle = rgbCss(palette.pellet);
      ctx.fillText(sink > 0.55 ? "." : "o", (i % this.cols) * cw + cw / 2, ((i / this.cols) | 0) * ch + ch / 2 + 1);
    }
  }

  private drawBites(world: World) {
    const { ctx, cw, ch, palette } = this;
    for (const b of world.bites) {
      const i = this.cellIndex(b.x, b.y);
      if (i < 0) continue;
      const t = (world.time - b.born) / BITE_LIFE;
      const glyph = t < 0.35 ? "*" : t < 0.7 ? "+" : ".";
      ctx.globalAlpha = Math.min(1, palette.alpha * 1.5) * (1 - t * t);
      ctx.fillStyle = rgbCss(palette.pellet);
      ctx.fillText(glyph, (i % this.cols) * cw + cw / 2, ((i / this.cols) | 0) * ch + ch / 2 + 1);
    }
  }

  // ── simulation → field ──────────────────────────────────────────────

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stamp(field: Float32Array, x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private consumeEvents(world: World) {
    for (const e of world.events) {
      if (e.kind === "eat") {
        this.stamp(this.heat, e.x, e.y, 2, 1);
        this.stamp(this.energy, e.x, e.y, 3, 0.9);
      } else {
        this.stamp(this.energy, e.x, e.y, 6, 1.4);
      }
    }
    world.events.length = 0;
  }

  private depositWake(world: World) {
    const { energy } = this;
    for (const f of world.fish) {
      if (!f.alive) continue;
      const i = this.cellIndex(f.x, f.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.012 + f.alarm * 0.03);
    }
    for (const sh of world.sharks) {
      // The tail sweeps the most water.
      for (let k = SHARK_NODES - 6; k < SHARK_NODES; k++) {
        const i = this.cellIndex(sh.nodes[k * 2], sh.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.05 + sh.speed * 0.0012);
      }
    }
    if (world.pointer.active) {
      this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.08);
    }
  }

  /** Blur + decay so wakes spread out like ripples and fade. */
  private diffuse(dt: number) {
    const { cols, rows, energy, energyTmp: tmp, heat } = this;
    const decay = Math.exp(-dt * 1.5);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
    const heatDecay = Math.exp(-dt * 2.2);
    for (let i = 0; i < heat.length; i++) heat[i] *= heatDecay;
  }

  // ── sharks ──────────────────────────────────────────────────────────

  /**
   * Classify one point against the current shark (spine/arc already built).
   * Body coordinates: s along the spine (0 snout → 1 tail), v across it.
   * Writes hit* fields and returns whether the point is on the shark.
   */
  private sampleShark(px: number, py: number, L: number) {
    const { spine, arc } = this;
    const N = SHARK_NODES;
    let best = Infinity;
    let bestS = 0;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const qx = ax + sx * u;
      const qy = ay + sy * u;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / this.arcTotal;
        bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bestNx = (-sy / len) * bestSign;
        bestNy = (sx / len) * bestSign;
      }
    }

    const a = Math.sqrt(best);
    const s = bestS;
    const u = s * L;
    const shape = this.shape;
    const w = shape.halfWidth(s) * L;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * bestSign;
    this.hitAcross = w > 0 ? clamp(a / w, 0, 1.5) : 1;

    const head = this.shape.head;
    if (head && u < L * (head.sweep + head.depth + head.notch)) {
      // Cephalofoil: a wide wing across the snout, its tips swept back toward the eyes,
      // and on a great hammerhead a shallow notch in the middle of the front edge.
      const span = L * head.span;
      const r = a / span;
      const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
      // Full depth almost to the tips, so the wing reads as a solid bar rather than a thin line.
      const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
      if (r <= 1 && u >= front && u <= front + depth) {
        this.hitFlag = r > 0.84 ? FLAG_EYE : FLAG_BODY;
        this.hitShade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
        return true;
      }
    }

    if (a <= w) {
      const across = a / (w || 1);
      this.hitAcross = across;
      // Rounded back lit from the top-left; flanks fall off into shadow.
      const facing = (bestNx * -0.6 + bestNy * -0.8) * across;
      let shade = 0.58 - across * across * 0.42 + facing * 0.26;
      let flag = FLAG_BODY;
      if (s > shape.dorsal[0] && s < shape.dorsal[1] && across < 0.3) {
        // First dorsal fin, catching the light.
        flag = FLAG_RIDGE;
        shade = 1;
      } else if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
        shade = Math.max(shade, 0.82);
      } else if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.6) {
        flag = FLAG_EYE;
        shade = 0;
      } else if (s > shape.gills[0] && s < shape.gills[1] && across > 0.58) {
        // Five gill slits.
        if (Math.floor(((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0])) * 5) % 2 === 0) shade *= 0.45;
      } else if (s < 0.05) {
        // Pale snout tip.
        shade = Math.max(shade, 0.7);
      } else if (shape === SHAPES.zebra && s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08)) {
        // Zebra sharks carry pale ridges down the back.
        shade = Math.max(shade, 0.8);
      } else if (this.marked(s, a * bestSign, L, across)) {
        flag = FLAG_MARK;
      }
      this.hitFlag = flag;
      this.hitShade = shade;
      return true;
    }

    const tip = bestSign > 0 ? this.finTipRight : this.finTipLeft;
    const [p0, p1, p2] = shape.pectoral;
    if (
      inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
      // Falcate (sickle) fins get a concave trailing edge.
      !(shape.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))
    ) {
      this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
      this.hitShade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1));
      return true;
    }
    const [v0, v1, v2, vr] = shape.pelvic;
    if (
      inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) ||
      // Forked caudal fin.
      (shape.caudal > 0 && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * shape.caudal))
    ) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.36;
      return true;
    }
    return false;
  }

  /** Whether a body point (s along, v across) falls on a dark marking. */
  private marked(s: number, v: number, L: number, across: number) {
    if (this.shape === SHAPES.tiger) {
      // Wavy vertical bars over the back half, fading out toward the head.
      if (s < 0.2 || s > 0.9 || across > 0.85) return false;
      const wobble = 0.35 * Math.sin((v / L) * 25 + s * 5);
      const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
      return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
    }
    if (this.shape === SHAPES.zebra) {
      // Leopard spots on a jittered grid, so they ride along with the skin.
      if (s < 0.07) return false;
      const gu = (s * L) / (L * 0.06);
      const gv = v / (L * 0.045);
      const cu = Math.floor(gu);
      const cv = Math.floor(gv);
      const jx = hash3(cu, cv, this.sharkId) * 0.5 + 0.25;
      const jy = hash3(cu, cv, this.sharkId + 11) * 0.5 + 0.25;
      return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
    }
    return false;
  }

  /**
   * Build a smooth, undulating render spine from the sim spine, then
   * supersample every cell in the shark's bounding box against the shape.
   * Fully covered cells become solid skin; partial cells become edge glyphs.
   */
  private markingsFor(id: number) {
    let m = this.markingCache.get(id);
    if (!m) {
      m = koiMarkings(id);
      this.markingCache.set(id, m);
    }
    return m;
  }

  /** Cream / vermillion / sumi skin from body-space kohaku patches (daoho-style). */
  private skinRole(id: number, s: number, v: number, L: number, across: number): "white" | "red" | "black" {
    if (across > 0.9 || s > 0.74) return "white";
    const vn = v / L;
    const wobble = (valueNoise(s * 14 + id, vn * 30, id + 3) - 0.5) * 0.6;
    const markings = this.markingsFor(id);
    for (const m of markings.black) if (inPatch(m, s, vn, wobble)) return "black";
    for (const m of markings.red) if (inPatch(m, s, vn, wobble)) return "red";
    return "white";
  }

  private rasterizeSharks(sharks: Shark[], _t: number) {
    const {
      sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind, sharkShadow,
      sharkS, sharkV, sharkAcross, sharkCov, sharkOwner, sharkLen,
      spine, arc, cw, ch, cols, rows,
    } = this;
    sharkFlag.fill(0);
    sharkShadow.fill(0);
    sharkOwner.fill(-1);

    for (const sh of sharks) {
      const L = sh.length;
      const N = SHARK_NODES;
      const n = sh.nodes;
      const swim = clamp(sh.speed / 60, 0.4, 1.4);
      this.shape = SHAPES[sh.kind];
      this.sharkId = sh.id;
      const kindIndex = KINDS.indexOf(sh.kind);

      // Travelling body wave, growing toward the tail.
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim;
        const off = amp * Math.sin(sh.phase - s * 5.2);
        spine[k * 2] = n[k * 2] - ty * off;
        spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
      }
      arc[0] = 0;
      for (let k = 1; k < N; k++) {
        arc[k] =
          arc[k - 1] +
          Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
      }
      this.arcTotal = arc[N - 1] || 1;

      // Bank into turns: the inside fin foreshortens, the outside one spreads.
      const bank = clamp(sh.turn * 0.45, -0.35, 0.35);
      const flex = 1 + 0.06 * Math.sin(sh.phase * 0.5);
      const reachFin = this.shape.pectoral[3];
      this.finTipRight = L * reachFin * flex * (1 - bank);
      this.finTipLeft = L * reachFin * flex * (1 + bank);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      const reach = L * 0.36;
      const c0 = Math.max(0, Math.floor((minX - reach) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
      const r0 = Math.max(0, Math.floor((minY - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;

      const skipBeyond = reach + Math.hypot(cw, ch);
      const shadowDc = Math.round((L * 0.035) / cw) + 1;
      const shadowDr = Math.round((L * 0.02) / ch) + 1;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = this.sampleShark(x + cw / 2, y + ch / 2, L);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleShark(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;

          const i = r * cols + c;
          // Body-anchored key so each glyph rides along with the skin.
          const key = (hash3(Math.round(s * 90), Math.round(v / (cw * 0.8)), sh.id) * 4294967295) >>> 0;
          sharkKey[i] = key;
          sharkDepth[i] = sh.depth;
          sharkKind[i] = kindIndex;
          sharkS[i] = s;
          sharkV[i] = v;
          sharkAcross[i] = this.hitAcross;
          sharkCov[i] = coverage;
          sharkOwner[i] = sh.id;
          sharkLen[i] = L;

          if (centerHit && coverage >= 0.6) {
            sharkFlag[i] = flag;
            // Soft shade only — no per-frame flicker (keeps patches smooth).
            sharkShade[i] = clamp(shade, 0, 1);
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) sharkShadow[sr * cols + sc] = 1;
          } else {
            sharkFlag[i] = FLAG_EDGE;
            sharkShade[i] = coverage;
          }
        }
      }
    }
  }

  private drawSharks(t: number) {
    const {
      ctx, cols, cw, ch, palette,
      sharkFlag, sharkShade, sharkKey, sharkDepth,
      sharkS, sharkV, sharkAcross, sharkCov, sharkOwner, sharkLen,
    } = this;
    const n = sharkFlag.length;
    const [tile0, tile1] = palette.tile;

    for (let i = 0; i < n; i++) {
      const flag = sharkFlag[i];
      if (!flag) continue;
      const id = sharkOwner[i];
      if (id < 0) continue;

      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = sharkKey[i];
      const s = sharkS[i];
      const v = sharkV[i];
      const across = sharkAcross[i];
      const L = sharkLen[i] || 1;
      const coverage = sharkCov[i];
      const depth = sharkDepth[i];
      const dim = palette.alpha * (palette.depthFloor + (1 - palette.depthFloor) * depth);

      let tile: Rgb;
      let glyph = " ";
      let ink: Rgb;
      let inkAlpha = dim;

      if (flag === FLAG_EYE) {
        tile = mixRgb(palette.bg, palette.eye, 0.85);
        glyph = "o";
        ink = mixRgb(palette.bg, palette.white, 0.9);
      } else if (flag === FLAG_FIN || flag === FLAG_RIDGE) {
        tile = mixRgb(palette.bg, palette.fin, flag === FLAG_RIDGE ? 0.7 : 0.55);
        glyph =
          flag === FLAG_RIDGE
            ? SKIN_RAMP[clamp(3 + ((key >>> 8) % 3), 0, SKIN_RAMP.length - 1)]
            : key % 2 === 0
              ? "."
              : FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];
        ink = shadeRgb(tile, palette.ink + 0.15);
        inkAlpha = dim * 0.55 * coverage;
      } else if (flag === FLAG_EDGE) {
        const role = this.skinRole(id, s, v, L, Math.min(across, 0.95));
        const base =
          role === "red" ? palette.red : role === "black" ? palette.black : palette.white;
        tile = mixRgb(palette.bg, base, 0.35 + 0.35 * coverage);
        const set = coverage >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        glyph = set[(key >>> 8) % set.length];
        ink = shadeRgb(tile, palette.ink + 0.2);
        inkAlpha = dim * 0.55 * coverage;
      } else {
        // Solid body: kohaku patches + smooth lighting across a rounded back.
        const role = this.skinRole(id, s, v, L, across);
        const lum = clamp(0.22 + 0.5 * Math.sqrt(Math.max(0, 1 - across * across)) + 0.18 * sharkShade[i], 0, 1);

        if (role === "red") {
          const lean = (hash3(id, 5, 17) - 0.5) * 0.22;
          const grain = (valueNoise(s * 9 + id, (v / L) * 18, id + 21) - 0.5) * 0.18;
          const sheen = Math.max(0, Math.sin(s * 11 - t * 1.8 + id) - 0.7) / 0.3;
          // Bias toward the brighter end of the vermillion ramp for punchier markings.
          tile = rampRgb(palette.hi, 0.28 + 0.78 * lum + lean + grain + sheen * 0.4);
        } else if (role === "black") {
          tile = mixRgb(palette.bg, palette.black, tile0 + (tile1 - tile0) * lum);
        } else {
          tile = mixRgb(palette.bg, palette.white, tile0 + (tile1 - tile0) * lum);
        }

        const jitter = (key >>> 4) % 3;
        glyph = SKIN_RAMP[clamp(Math.round((1 - lum) * 4) + jitter, 0, SKIN_RAMP.length - 1)];
        ink = shadeRgb(tile, palette.ink);
        inkAlpha = dim * (role === "white" ? 0.55 : 0.85);

        // Occasional scale glint — rare, so patches stay readable.
        const tick = Math.floor(t * 1.4 + (key % 997) / 97);
        if (hash3(key, tick, 7) < 0.03) {
          tile = mixRgb(tile, palette.white, 0.35);
        }
      }

      ctx.globalAlpha = dim * (flag === FLAG_EDGE || flag === FLAG_FIN ? Math.max(0.35, coverage) : 1);
      ctx.fillStyle = rgbCss(tile);
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      if (glyph !== " ") {
        ctx.globalAlpha = inkAlpha;
        ctx.fillStyle = rgbCss(ink);
        ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ── fish, dots, heat ────────────────────────────────────────────────

  /**
   * Snap each fish to a cell and bucket it by brightness: far fish are dim,
   * near fish brighter, and turning or panicking fish glint. Nearer fish
   * claim a cell first when two land in the same one.
   */
  private markFish(world: World) {
    const { fishStamp, fishBuckets, sharkFlag } = this;
    const frame = ++this.frameId;
    for (const bucket of fishBuckets) bucket.length = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const f of world.fish) {
        if (!f.alive || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
        const i = this.cellIndex(f.x, f.y);
        if (i < 0 || fishStamp[i] === frame || sharkFlag[i]) continue;
        fishStamp[i] = frame;
        const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
        const v = 0.3 + (0.4 * (f.depth - 0.55)) / 0.45 + 0.3 * Math.max(glint, f.alarm);
        fishBuckets[clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1)].push(i);
      }
    }
  }

  private drawFish() {
    const { ctx, cw, ch, cols, fishBuckets, isLight } = this;
    for (let b = 0; b < fishBuckets.length; b++) {
      const bucket = fishBuckets[b];
      if (!bucket.length) continue;
      const alpha = FISH_ALPHAS[b];
      const fill = isLight
        ? `rgba(96, 90, 84, ${alpha.toFixed(2)})`
        : `rgba(210, 200, 188, ${alpha.toFixed(2)})`;
      const ink = isLight
        ? `rgba(40, 36, 32, ${Math.min(1, alpha + 0.15).toFixed(2)})`
        : `rgba(20, 18, 16, ${Math.min(1, alpha + 0.1).toFixed(2)})`;
      for (const i of bucket) {
        const x = (i % cols) * cw;
        const y = ((i / cols) | 0) * ch;
        ctx.fillStyle = fill;
        ctx.fillRect(x + 1, y + 2, cw - 2, ch - 4);
        ctx.fillStyle = ink;
        ctx.fillText("-", x + cw / 2, y + ch / 2 + 1);
      }
    }
  }

  private drawHeat() {
    const { ctx, heat, cols, cw, ch } = this;
    for (let i = 0; i < heat.length; i++) {
      const h = heat[i];
      if (h < 0.08) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      ctx.fillStyle = h > 0.5 ? `rgba(255,120,60,${h.toFixed(2)})` : `rgba(220,40,40,${(h * 1.6).toFixed(2)})`;
      ctx.fillText(h > 0.6 ? "*" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
  }

  /**
   * Every cell's dot twinkles on its own clock, is modulated by slow
   * caustic light bands, and flares cyan where the wake field is strong.
   * Dots are bucketed by colour/alpha so each bucket is one fillStyle.
   */
  private drawDots(t: number) {
    const { ctx, cols, rows, cw, ch, dotKind, dotPhase, dotFreq, energy, sharkFlag, sharkShadow, fishStamp, frameId } = this;
    const { bucketOf, bucketOrder, bucketCounts } = this;
    const n = cols * rows;
    const SKIP = bucketCounts.length - 1;
    bucketCounts.fill(0);

    for (let i = 0; i < n; i++) {
      const e = energy[i];
      const kind = dotKind[i];
      if (sharkFlag[i] || fishStamp[i] === frameId || (kind === 0 && e < 0.45)) {
        bucketOf[i] = SKIP;
        continue;
      }
      let bucket: number;
      if (e > 0.45) {
        const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
        bucket = WAKE * ALPHA_LEVELS + level;
      } else {
        const col = i % cols;
        const row = (i / cols) | 0;
        // Dots stay bright and crisp; the twinkle is a gentle breathe, not a fade.
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1);
        if (sharkShadow[i]) v *= 0.2;
        bucket = (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
      }
      bucketOf[i] = bucket;
      bucketCounts[bucket]++;
    }

    // Counting sort cells by bucket.
    const starts = new Int32Array(bucketCounts.length);
    for (let b = 1; b < bucketCounts.length; b++) starts[b] = starts[b - 1] + bucketCounts[b - 1];
    const cursor = starts.slice();
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b !== SKIP) bucketOrder[cursor[b]++] = i;
    }

    const small = Math.max(2, Math.round(cw * 0.19));
    const large = small + 1;
    for (let b = 0; b < SKIP; b++) {
      const count = bucketCounts[b];
      if (!count) continue;
      ctx.fillStyle = this.dotStyles[b];
      const size = b >= WAKE * ALPHA_LEVELS ? large : small;
      const start = starts[b];
      for (let k = start; k < start + count; k++) {
        const i = bucketOrder[k];
        const col = i % cols;
        const row = (i / cols) | 0;
        // Sit the dot low-right in its cell, as in the reference.
        ctx.fillRect(Math.round(col * cw + cw * 0.66 - size / 2), Math.round(row * ch + ch * 0.64 - size / 2), size, size);
      }
    }
  }
}
