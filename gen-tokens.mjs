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
  let sapc, polarity;
  if (Yb > Yt) { sapc = (Math.pow(Yb,0.56)-Math.pow(Yt,0.57))*1.14; polarity='n'; }
  else { sapc = (Math.pow(Yb,0.65)-Math.pow(Yt,0.62))*1.14; polarity='r'; }
  if (Math.abs(sapc) < 0.1) return 0;
  const signed = sapc > 0 ? sapc - 0.027 : sapc + 0.027;
  return signed*100;
}

const surface0Light = [0.970, 0.004, 250];
const surface0Dark = [0.16, 0.01, 260];

const domains = {
  strategy: 280, people: 260, finance: 160, operations: 100, risk: 0, knowledge: 120,
};

function findInk(hue, bgLight, bgDark, tintLight, tintDark, baseC=0.14) {
  let lightResult = null;
  for (let l = 0.40; l >= 0.10; l -= 0.002) {
    for (let c = baseC; c >= 0.06; c -= 0.005) {
      if (!inGamutRgb(l,c,hue)) continue;
      const textRgb = toRgb255(l,c,hue);
      const a = Math.abs(apca(textRgb, toRgb255(...bgLight)));
      const b = Math.abs(apca(textRgb, toRgb255(...tintLight)));
      if (a >= 90.3 && b >= 90.3) { lightResult = {l,c,h:hue}; break; }
    }
    if (lightResult) break;
  }
  let darkResult = null;
  for (let l = 0.99; l <= 0.999; l += 1) {} // noop
  for (let l = 0.99; l >= 0.70; l -= 0.002) {
    for (let c = baseC; c >= 0.06; c -= 0.005) {
      if (!inGamutRgb(l,c,hue)) continue;
      const textRgb = toRgb255(l,c,hue);
      const a = Math.abs(apca(textRgb, toRgb255(...bgDark)));
      const b = Math.abs(apca(textRgb, toRgb255(...tintDark)));
      if (a >= 90.3 && b >= 90.3) { darkResult = {l,c,h:hue}; break; }
    }
    if (darkResult) break;
  }
  return { lightResult, darkResult };
}

console.log('DOMAIN INK');
for (const [name, hue] of Object.entries(domains)) {
  const tintLight = [0.965, 0.018, hue];
  const tintDark = [0.26, 0.03, hue];
  const { lightResult, darkResult } = findInk(hue, surface0Light, surface0Dark, tintLight, tintDark);
  console.log(name, 'LIGHT', lightResult, 'DARK', darkResult);
}

console.log('\nSEMANTIC INK');
const semantics = { success: 145, warn: 80, danger: 25, info: 235 };
for (const [name, hue] of Object.entries(semantics)) {
  const tintLight = [0.965, 0.020, hue];
  const tintDark = [0.28, 0.035, hue];
  const { lightResult, darkResult } = findInk(hue, surface0Light, surface0Dark, tintLight, tintDark, 0.15);
  console.log(name, 'LIGHT', lightResult, 'DARK', darkResult);
}
