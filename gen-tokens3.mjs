import { converter } from 'culori';
const toRgb = converter('rgb');

function inGamutRgb(l,c,h) {
  const r = toRgb({mode:'oklch', l, c, h});
  return r.r >= -0.0005 && r.r <= 1.0005 && r.g >= -0.0005 && r.g <= 1.0005 && r.b >= -0.0005 && r.b <= 1.0005;
}
function toRgb255(l,c,h) {
  const r = toRgb({mode:'oklch', l, c, h});
  const clamp = v => Math.max(0, Math.min(255, Math.round(v*255)));
  return [clamp(r.r), clamp(r.g), clamp(r.b)];
}
function apcaY([r,g,b]) {
  const toLin = v => Math.pow(v/255, 2.4);
  const y = 0.2126729*toLin(r) + 0.7151522*toLin(g) + 0.072175*toLin(b);
  return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
}
function apca(text, bg) {
  const Yt = apcaY(text), Yb = apcaY(bg);
  if (Math.abs(Yb-Yt) < 0.0005) return 0;
  let sapc;
  if (Yb > Yt) { sapc = (Math.pow(Yb,0.56)-Math.pow(Yt,0.57))*1.14; }
  else { sapc = (Math.pow(Yb,0.65)-Math.pow(Yt,0.62))*1.14; }
  if (Math.abs(sapc) < 0.1) return 0;
  const signed = sapc > 0 ? sapc - 0.027 : sapc + 0.027;
  return signed*100;
}

function maxChromaAt(l, h, ceiling=0.22) {
  for (let c = ceiling; c >= 0; c -= 0.0015) {
    if (inGamutRgb(l,c,h)) return c;
  }
  return 0;
}

function findBestInk({ hue, bg, tint, lRange, ceiling, floor = 92 }) {
  let best = null;
  for (let l = lRange[0]; l <= lRange[1]; l += 0.002) {
    const c = maxChromaAt(l, hue, ceiling);
    if (c <= 0.005) continue;
    const textRgb = toRgb255(l, c, hue);
    const a = Math.abs(apca(textRgb, toRgb255(...bg)));
    const b = Math.abs(apca(textRgb, toRgb255(...tint)));
    if (a >= floor && b >= floor) {
      if (!best || c > best.c) best = { l, c, h: hue, a, b };
    }
  }
  return best;
}

const surface0Light = [0.970, 0.004, 250];
const surface0Dark = [0.16, 0.01, 260];
const domains = { strategy: 280, people: 260, finance: 160, operations: 100, risk: 0, knowledge: 120 };

console.log('DOMAIN INK LIGHT (search l 0.15-0.45)');
const lightInk = {};
for (const [name, hue] of Object.entries(domains)) {
  const tintLight = [0.965, 0.018, hue];
  const best = findBestInk({ hue, bg: surface0Light, tint: tintLight, lRange: [0.15, 0.45], ceiling: 0.20 });
  lightInk[name] = best;
  console.log(name, best);
}

console.log('\nDOMAIN INK DARK (search l 0.55-0.95)');
const darkInk = {};
for (const [name, hue] of Object.entries(domains)) {
  const tintDark = [0.26, 0.03, hue];
  const best = findBestInk({ hue, bg: surface0Dark, tint: tintDark, lRange: [0.55, 0.97], ceiling: 0.20 });
  darkInk[name] = best;
  console.log(name, best);
}

const semantics = { success: 145, warn: 80, danger: 25, info: 235 };
console.log('\nSEMANTIC INK LIGHT');
const lightSem = {};
for (const [name, hue] of Object.entries(semantics)) {
  const tintLight = [0.965, 0.020, hue];
  const best = findBestInk({ hue, bg: surface0Light, tint: tintLight, lRange: [0.15, 0.45], ceiling: 0.22 });
  lightSem[name] = best;
  console.log(name, best);
}
console.log('\nSEMANTIC INK DARK');
const darkSem = {};
for (const [name, hue] of Object.entries(semantics)) {
  const tintDark = [0.28, 0.035, hue];
  const best = findBestInk({ hue, bg: surface0Dark, tint: tintDark, lRange: [0.55, 0.97], ceiling: 0.22 });
  darkSem[name] = best;
  console.log(name, best);
}

console.log('\nJSON', JSON.stringify({ lightInk, darkInk, lightSem, darkSem }));
