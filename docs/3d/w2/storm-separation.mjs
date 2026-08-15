// ../../../../../../../Users/nik/Downloads/usclaude-main/packages/gl/src/look/colour.ts
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 31308e-7 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
var HEX = /^#?([0-9a-fA-F]{6})$/;
function hexToLinear(hex) {
  const m = HEX.exec(hex.trim());
  if (!m) throw new Error(`hexToLinear: expected #RRGGBB, got ${JSON.stringify(hex)}`);
  const h = m[1];
  return [0, 2, 4].map((i) => srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255));
}
function linearToHex(c) {
  const b = c.map((v) => {
    const s2 = linearToSrgb(Math.min(1, Math.max(0, v)));
    return Math.round(s2 * 255).toString(16).padStart(2, "0");
  });
  return `#${b.join("")}`;
}
var BRAND_HEX = {
  /** The anchor. Every data encoding starts here. */
  brand: "#2C6BFF",
  /** High end of the density ramp — brand blue lifted, same hue family. */
  brandBright: "#7FB2FF",
  /** Low end. Not black: a data colour that reaches black is indistinguishable from absent. */
  brandDeep: "#12326E",
  /** REFERENCE marks — percentiles, thresholds, targets. Deliberately not a data hue. */
  reference: "#FF8A3D",
  /** REFUSAL / withheld. Reads as "no measurement", never as a low value. */
  refusal: "#6B7A99",
  /** Structure — axes, rules, ticks. Recedes. */
  rule: "#26355A",
  /** Plate background, before the gradient. */
  plate: "#0E1628"
};
var BRAND = Object.freeze(
  Object.fromEntries(
    Object.keys(BRAND_HEX).map((k) => [k, Object.freeze(hexToLinear(BRAND_HEX[k]))])
  )
);

// search2.ts
import { readFileSync as readFileSync2 } from "node:fs";

// ../../../../../../../Users/nik/Downloads/usclaude-main/packages/gl/src/look/tonemap.ts
var TONE_SHOULDER = 0.4;
function toneMapComposite(c) {
  return [
    c[0] / (1 + c[0] * TONE_SHOULDER),
    c[1] / (1 + c[1] * TONE_SHOULDER),
    c[2] / (1 + c[2] * TONE_SHOULDER)
  ];
}
var TONE_MAP_GLSL = `vec3 lcxToneMap(vec3 c){ return c/(1.0+c*${TONE_SHOULDER.toFixed(2)}); }`;

// ../../../../../../../Users/nik/Downloads/usclaude-main/packages/gl/src/look/theme.ts
var THEMES = Object.freeze({
  dark: Object.freeze({
    name: "dark",
    ground: hexToLinear("#070B14"),
    structure: hexToLinear("#141F35"),
    plate: hexToLinear("#0E1628"),
    rule: hexToLinear("#26355A"),
    skyHorizon: hexToLinear("#131C31"),
    skyZenith: hexToLinear("#050810"),
    ambientGain: 1.15,
    keyGain: 5.2,
    shadowStrength: 0.9,
    fog: hexToLinear("#131C31")
  }),
  light: Object.freeze({
    name: "light",
    /*
     * NOT WHITE. #FFFFFF as a ground leaves a lit surface nowhere to go: every highlight clips to
     * the same value as the floor and the object loses its silhouette. #E8EDF6 is the platform's
     * own page tint deepened just enough that a white specular still reads as brighter than the
     * ground it sits on, which is the whole job of a ground.
     */
    ground: hexToLinear("#E8EDF6"),
    structure: hexToLinear("#C3CEE0"),
    /* Matches --card (#FFFFFF) so a panel on a light page is the page's own card, not a grey box. */
    plate: hexToLinear("#FFFFFF"),
    /* --line is 185 198 224 (#B9C6E0); the scene's rule is that role, so it takes that value. */
    rule: hexToLinear("#B9C6E0"),
    skyHorizon: hexToLinear("#DCE5F3"),
    skyZenith: hexToLinear("#F4F7FC"),
    ambientGain: 0.62,
    keyGain: 7.4,
    shadowStrength: 0.62,
    fog: hexToLinear("#DCE5F3")
  })
});
function sceneTheme(theme) {
  return THEMES[theme];
}

// ../../../../../../../Users/nik/Downloads/usclaude-main/packages/gl/src/look/categorical.ts
var WHITE = [0.95047, 1, 1.08883];
function labOf(c) {
  const f2 = (t) => t > 216 / 24389 ? Math.cbrt(t) : 841 / 108 * t + 4 / 29;
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / WHITE[0];
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / WHITE[2];
  return [116 * f2(Y) - 16, 500 * (f2(X) - f2(Y)), 200 * (f2(Y) - f2(Z))];
}
function deltaE2000Lab(p, q) {
  const [L1, a1, b1] = p;
  const [L2, a2, b2] = q;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const A1 = (1 + G) * a1;
  const A2 = (1 + G) * a2;
  const Cp1 = Math.hypot(A1, b1);
  const Cp2 = Math.hypot(A2, b2);
  const hue = (x, y) => {
    if (x === 0 && y === 0) return 0;
    const d = Math.atan2(y, x) * 180 / Math.PI;
    return d < 0 ? d + 360 : d;
  };
  const h1 = hue(A1, b1);
  const h2 = hue(A2, b2);
  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh2 = 0;
  if (Cp1 * Cp2 !== 0) {
    dh2 = h2 - h1;
    if (dh2 > 180) dh2 -= 360;
    else if (dh2 < -180) dh2 += 360;
  }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh2 * Math.PI / 360);
  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  let hbar;
  if (Cp1 * Cp2 === 0) hbar = h1 + h2;
  else if (Math.abs(h1 - h2) <= 180) hbar = (h1 + h2) / 2;
  else hbar = h1 + h2 >= 360 ? (h1 + h2 - 360) / 2 : (h1 + h2 + 360) / 2;
  const T = 1 - 0.17 * Math.cos((hbar - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbar * Math.PI / 180) + 0.32 * Math.cos((3 * hbar + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hbar - 63) * Math.PI / 180);
  const dTheta = 30 * Math.exp(-Math.pow((hbar - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cpbar, 7) / (Math.pow(Cpbar, 7) + Math.pow(25, 7)));
  const SL = 1 + 0.015 * Math.pow(Lbar - 50, 2) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
  const SC = 1 + 0.045 * Cpbar;
  const SH = 1 + 0.015 * Cpbar * T;
  const RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;
  return Math.sqrt(
    Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH)
  );
}
function chromaOf(c) {
  const [, a, b] = labOf(c);
  return Math.hypot(a, b);
}
var SCENERY_FIELDS = new Set(Object.keys(sceneTheme("dark")));
var ANCHOR = "brand";
var ALL_KEYS = Object.keys(BRAND_HEX);
var RAMP_KEYS = Object.freeze(
  ALL_KEYS.filter((k) => !SCENERY_FIELDS.has(k) && k.startsWith(ANCHOR))
);
var RAMP_CHROMA_FLOOR = Math.min(...RAMP_KEYS.map((k) => chromaOf(BRAND[k])));
function classify(key) {
  if (SCENERY_FIELDS.has(key)) return "scenery";
  if (key.startsWith(ANCHOR)) return "density";
  return chromaOf(BRAND[key]) < RAMP_CHROMA_FLOOR ? "absence" : "annotation";
}
var PALETTE_CATEGORIES = Object.freeze(
  Object.fromEntries(ALL_KEYS.map((k) => [k, classify(k)]))
);
var CLAIM_CATEGORIES = Object.freeze(["density", "annotation", "absence"]);
var CATEGORICAL_FLOOR_DE2000 = 10;
var SEPARATION_PERCENTILE = 0.05;
var CATEGORICAL_POLICY = "Two palette entries that encode DIFFERENT CATEGORIES must stay at least " + CATEGORICAL_FLOOR_DE2000 + ' CIEDE2000 apart at 95% of the fragments a reader can see, in every theme the surface admits. This is NOT order preservation and order preservation does not imply it: a monotone tone map is not injective, and the shipped composite maps brand #2C6BFF and refusal #6B7A99 to within 4.6 of each other at the brightest fragment of a lit marker. ORDER is about a scale; this is about "measured" and "no measurement exists" being different claims \u2014 docs/3d/w2/CATEGORICAL_SEPARATION.md.';
var TONE_ASYMPTOTE = 1 / TONE_SHOULDER;
var ENCODE_CLIP_RADIANCE = 1 / (1 - TONE_SHOULDER);

// entry.ts
import { readFileSync } from "node:fs";
var SRC_PATH = process.env.STORM_SRC ?? "/Users/nik/Downloads/usclaude-main/apps/web/src/components/risk/StormReliefGl.tsx";
var SRC = readFileSync(SRC_PATH, "utf8");
var LINES = SRC.split("\n");
function parseMaterials() {
  const start = LINES.findIndex((l) => /const MAT = \{/.test(l));
  if (start < 0) throw new Error("MAT block not found");
  const out = [];
  for (let i = start + 1; i < LINES.length; i++) {
    const l = LINES[i];
    if (/^\s*\} as const;/.test(l)) break;
    const m = /^\s*(\w+):\s*\{\s*baseColour:\s*hexToLinear\('(#[0-9A-Fa-f]{6})'\),\s*roughness:\s*([\d.]+),\s*metalness:\s*([\d.]+)\s*\}/.exec(l);
    if (m) out.push({ key: m[1], hex: m[2], roughness: Number(m[3]), metalness: Number(m[4]), line: i + 1 });
  }
  if (out.length === 0) throw new Error("no materials parsed");
  return out;
}
function parseRig() {
  const triple = (name) => {
    const re = new RegExp(`${name}:\\s*\\[([-\\d., ]+)\\]`);
    const m = re.exec(SRC);
    if (!m) throw new Error(`sky stop ${name} not found`);
    return m[1].split(",").map((s2) => Number(s2.trim()));
  };
  const lc = /lightColour:\s*\[([-\d., ]+)\]/.exec(SRC);
  const ld = /const lightDir:\s*\[number, number, number\] = \[([-\d., ]+)\]/.exec(SRC);
  const ag = /ambientGain:\s*([\d.]+)/.exec(SRC);
  const cl = /const CLEAR = hexToLinear\('(#[0-9A-Fa-f]{6})'\)/.exec(SRC);
  if (!lc || !ld || !ag || !cl) throw new Error("rig not fully parsed");
  return {
    sky: { zenith: triple("zenith"), horizon: triple("horizon"), ground: triple("ground") },
    lightColour: lc[1].split(",").map((s2) => Number(s2.trim())),
    lightDir: ld[1].split(",").map((s2) => Number(s2.trim())),
    ambientGain: Number(ag[1]),
    clear: cl[1]
  };
}
function parseElevation() {
  const cal = readFileSync("/Users/nik/Downloads/usclaude-main/apps/web/src/components/risk/stormCalibration.ts", "utf8");
  const m = /export const ELEVATION_DEG = ([\d.]+)/.exec(cal);
  if (!m) throw new Error("ELEVATION_DEG not found");
  return Number(m[1]);
}
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
var add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var mul3 = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
var scale3 = (a, s2) => [a[0] * s2, a[1] * s2, a[2] * s2];
var mixV = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function skyColour(dir, sky) {
  const smooth = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const h = Math.max(-1, Math.min(1, dir[1]));
  return h >= 0 ? mixV(sky.horizon, sky.zenith, smooth(0, 0.85, h)) : mixV(sky.horizon, sky.ground, smooth(0, 0.55, -h));
}
function distributionGGX(NdotH, rough) {
  const a = rough * rough, a2 = a * a;
  const d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / Math.max(1e-16, Math.PI * d * d);
}
function geometrySmith(NdotV, NdotL, rough) {
  const k = (rough + 1) * (rough + 1) / 8;
  return NdotV / (NdotV * (1 - k) + k) * (NdotL / (NdotL * (1 - k) + k));
}
function fresnelSchlick(c, f0) {
  const f2 = Math.pow(Math.max(0, Math.min(1, 1 - c)), 5);
  return [f0[0] + (1 - f0[0]) * f2, f0[1] + (1 - f0[1]) * f2, f0[2] + (1 - f0[2]) * f2];
}
function envDFG(NdotV, rough) {
  const c0 = [-1, -0.0275, -0.572, 0.022], c1 = [1, 0.0425, 1.04, -0.04];
  const r = [rough * c0[0] + c1[0], rough * c0[1] + c1[1], rough * c0[2] + c1[2], rough * c0[3] + c1[3]];
  const a004 = Math.min(r[0] * r[0], Math.pow(2, -9.28 * NdotV)) * r[0] + r[1];
  return [-1.04 * a004 + r[2], 1.04 * a004 + r[3]];
}
function litFragment(base, roughness, metalness, N, V, rig) {
  const L = norm(scale3(rig.lightDir, -1));
  const H = norm(add3(V, L));
  const NdotL = Math.max(dot(N, L), 0);
  const NdotV = Math.max(dot(N, V), 1e-4);
  const NdotH = Math.max(dot(N, H), 0);
  const VdotH = Math.max(dot(V, H), 0);
  const b = [base[0], base[1], base[2]];
  const f0 = mixV([0.04, 0.04, 0.04], b, metalness);
  const rough = Math.max(0.045, Math.min(1, roughness));
  const D = distributionGGX(NdotH, rough);
  const G = geometrySmith(NdotV, NdotL, rough);
  const F = fresnelSchlick(VdotH, f0);
  const denom = Math.max(1e-6, 4 * NdotV * NdotL + 1e-4);
  const spec = [D * G * F[0] / denom, D * G * F[1] / denom, D * G * F[2] / denom];
  const kd = [(1 - F[0]) * (1 - metalness), (1 - F[1]) * (1 - metalness), (1 - F[2]) * (1 - metalness)];
  const diffuse = [kd[0] * b[0] / Math.PI, kd[1] * b[1] / Math.PI, kd[2] * b[2] / Math.PI];
  const direct = scale3(mul3(add3(diffuse, spec), rig.lightColour), NdotL);
  const R = add3(scale3(N, 2 * dot(N, V)), scale3(V, -1));
  const [dx, dy] = envDFG(NdotV, rough);
  const Ess = dx + dy;
  const specWeight = [Math.max(0, f0[0] * dx + dy), Math.max(0, f0[1] * dx + dy), Math.max(0, f0[2] * dx + dy)];
  const inv = 1 / Math.max(1e-3, Ess);
  const msComp = [1 + f0[0] * (inv - 1), 1 + f0[1] * (inv - 1), 1 + f0[2] * (inv - 1)];
  const envDiff = mul3(
    mul3(skyColour(N, rig.sky), b),
    [(1 - specWeight[0]) * (1 - metalness), (1 - specWeight[1]) * (1 - metalness), (1 - specWeight[2]) * (1 - metalness)]
  );
  const envSpec = mul3(mul3(skyColour(norm(mixV(R, N, rough * rough)), rig.sky), specWeight), msComp);
  const ambient = scale3(add3(envDiff, envSpec), rig.ambientGain);
  return add3(direct, ambient);
}
var toByte = (v) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255);
var srgbToLin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
function present(lit) {
  const t = toneMapComposite(lit);
  const px = [toByte(t[0]), toByte(t[1]), toByte(t[2])];
  return [srgbToLin(px[0] / 255), srgbToLin(px[1] / 255), srgbToLin(px[2] / 255)];
}

// sphere.ts
var norm2 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
var HARNESS = { W: 128, H: 128, eye: [0, 0, 3.2], fovY: 0.6, radius: 1 };
function harnessFragments(scale = 1) {
  const W2 = HARNESS.W * scale, H = HARNESS.H * scale;
  const t = Math.tan(HARNESS.fovY / 2);
  const aspect = W2 / H;
  const eye = HARNESS.eye;
  const out = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W2; i++) {
      const x = (i + 0.5) / W2 * 2 - 1;
      const y = (j + 0.5) / H * 2 - 1;
      const d = norm2([x * t * aspect, y * t, -1]);
      const b = eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2];
      const c = eye[0] * eye[0] + eye[1] * eye[1] + eye[2] * eye[2] - HARNESS.radius * HARNESS.radius;
      const disc = b * b - c;
      if (disc < 0) continue;
      const tt = -b - Math.sqrt(disc);
      if (tt <= 0) continue;
      const world = [eye[0] + tt * d[0], eye[1] + tt * d[1], eye[2] + tt * d[2]];
      const N = norm2(world);
      const V = norm2([eye[0] - world[0], eye[1] - world[1], eye[2] - world[2]]);
      out.push({ N, V });
    }
  }
  return out;
}

// search2.ts
var mats = parseMaterials();
var rig0 = parseRig();
var elev = parseElevation();
var byKey = Object.fromEntries(mats.map((m) => [m.key, m]));
var RIG_HARNESS = { sky: rig0.sky, lightColour: rig0.lightColour, lightDir: [0, 0, -1], ambientGain: rig0.ambientGain };
var RIG_STORM = { sky: rig0.sky, lightColour: rig0.lightColour, lightDir: rig0.lightDir, ambientGain: rig0.ambientGain };
var HUE_BUCKET_DEG = Number(/export const HUE_BUCKET_DEG = ([\d.]+)/.exec(readFileSync2("/Users/nik/Downloads/usclaude-main/packages/gl/src/look/semantic.ts", "utf8"))[1]);
var hueOf = (c) => {
  const [, a, b] = labOf(c);
  const d = Math.atan2(b, a) * 180 / Math.PI;
  return d < 0 ? d + 360 : d;
};
var lightOf = (c) => labOf(c)[0];
var LID_HUE = hueOf(hexToLinear(byKey.lid.hex));
var SRC2 = readFileSync2("/Users/nik/Downloads/usclaude-main/apps/web/src/components/risk/StormReliefGl.tsx", "utf8");
var num = (name) => {
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(SRC2);
  if (!m) throw new Error(`${name} not found`);
  return Function(`"use strict";const DAY_M=0.5;return (${m[1]})`)();
};
var TILE_T = num("TILE_T");
var TILE_D = num("TILE_D");
var LANE_W = num("LANE_W");
function tileFaces() {
  const el = elev * Math.PI / 180;
  const V = [0, Math.sin(el), Math.cos(el)];
  return [
    { N: [0, 1, 0], V, w: LANE_W * TILE_D * Math.sin(el) },
    // top face, projected area
    { N: [0, 0, 1], V, w: LANE_W * TILE_T * Math.cos(el) }
    // near face, projected area
  ];
}
var FULL_SPHERE = harnessFragments(1).map((f2) => ({ ...f2, w: 1 }));
function labsFor(hex, rough, metal, frags, rig) {
  const base = hexToLinear(hex);
  return frags.map(({ N, V }) => labOf(present(litFragment(base, rough, metal, N, V, rig))));
}
function sepFrom(a, b, frags) {
  const rows = a.map((x, i) => ({ d: deltaE2000Lab(x, b[i]), w: frags[i].w })).sort((x, y) => x.d - y.d);
  const total = rows.reduce((s2, r) => s2 + r.w, 0);
  const at = (q) => {
    let acc = 0;
    for (const r of rows) {
      acc += r.w;
      if (acc >= q * total) return r.d;
    }
    return rows[rows.length - 1].d;
  };
  return { min: rows[0].d, p05: at(SEPARATION_PERCENTILE), median: at(0.5) };
}
function lumaOn(hex, rough, metal, frags, rig) {
  const base = hexToLinear(hex);
  let m = 0;
  for (const { N, V } of frags) {
    const c = present(litFragment(base, rough, metal, N, V, rig));
    m = Math.max(m, 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  }
  return m;
}
var OTHERS = mats.filter((m) => m.key !== "withheldTile");
var CHROMA_CEIL = Math.min(...["tile", "gate"].map((k) => chromaOf(hexToLinear(byKey[k].hex))));

// verdict.ts
var FACES = tileFaces();
var REQUIRED = ["tile", "gutter", "week"];
var W = byKey.withheldTile;
console.log("\u2500\u2500 PRESENTED PIXEL of every material on the floor face, Storm's own key \u2500\u2500");
for (const m of mats) {
  const p = present(litFragment(hexToLinear(m.hex), m.roughness, m.metalness, FACES[0].N, FACES[0].V, RIG_STORM));
  console.log(`  ${m.key.padEnd(13)} albedo ${m.hex} -> pixel ${linearToHex(p)}   peak luma ${lumaOn(m.hex, m.roughness, m.metalness, FACES, RIG_STORM).toFixed(5)}`);
}
var lin = hexToLinear(W.hex);
var dh = Math.abs(hueOf(lin) - LID_HUE);
if (dh > 180) dh = 360 - dh;
console.log(`
\u2500\u2500 withheldTile AS IT NOW SHIPS: ${W.hex} r${W.roughness} m${W.metalness}`);
console.log(`   L* ${lightOf(lin).toFixed(1)}  chroma ${chromaOf(lin).toFixed(1)}  hue ${hueOf(lin).toFixed(1)} (${dh.toFixed(1)} deg from the lid)`);
var LID_PEAK = lumaOn(byKey.lid.hex, byKey.lid.roughness, byKey.lid.metalness, FACES, RIG_STORM);
var peak = lumaOn(W.hex, W.roughness, W.metalness, FACES, RIG_STORM);
console.log(`   peak presented luminance ${peak.toFixed(5)} vs lid ${LID_PEAK.toFixed(5)} \u2014 ${peak < LID_PEAK ? "DIMMER, ok" : "BRIGHTER THAN THE LID \u2014 constraint (c) FAILS"}`);
var s = labsFor(W.hex, W.roughness, W.metalness, FULL_SPHERE, RIG_HARNESS);
var f = labsFor(W.hex, W.roughness, W.metalness, FACES, RIG_STORM);
var sphLabs = Object.fromEntries(OTHERS.map((m) => [m.key, labsFor(m.hex, m.roughness, m.metalness, FULL_SPHERE, RIG_HARNESS)]));
var faceLabs = Object.fromEntries(OTHERS.map((m) => [m.key, labsFor(m.hex, m.roughness, m.metalness, FACES, RIG_STORM)]));
console.log(`
   pair                sphere min/p05/med      real tile face          verdict`);
var fails = 0;
for (const o of OTHERS) {
  const a = sepFrom(s, sphLabs[o.key], FULL_SPHERE), b = sepFrom(f, faceLabs[o.key], FACES);
  const req = REQUIRED.includes(o.key);
  const ok = !req || Math.min(a.p05, b.p05) >= CATEGORICAL_FLOOR_DE2000;
  if (!ok) fails++;
  console.log(`   withheldTile/${o.key.padEnd(7)} ${a.min.toFixed(1).padStart(5)}/${a.p05.toFixed(1)}/${a.median.toFixed(1)}`.padEnd(48) + `${b.min.toFixed(1).padStart(5)}/${b.p05.toFixed(1)}/${b.median.toFixed(1)}`.padEnd(24) + (req ? ok ? "PASS" : "*** FAIL \u2014 under the floor of 10 ***" : "same category, floor does not govern"));
}
console.log(`
   ${fails === 0 ? "ALL GOVERNED PAIRS PASS" : `${fails} GOVERNED PAIR(S) FAIL`}`);
process.exitCode = fails === 0 ? 0 : 1;
