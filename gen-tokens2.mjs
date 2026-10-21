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

const surface0Dark = [0.16, 0.01, 260];

function bestDark(hue, tintDark, maxC) {
  let best = null, bestScore = -1;
  for (let l = 0.995; l >= 0.55; l -= 0.002) {
    for (let c = maxC; c >= 0.0; c -= 0.0025) {
      if (!inGamutRgb(l,c,hue)) continue;
      const textRgb = toRgb255(l,c,hue);
      const a = Math.abs(apca(textRgb, toRgb255(...surface0Dark)));
      const b = Math.abs(apca(textRgb, toRgb255(...tintDark)));
      const score = Math.min(a,b);
      if (score > bestScore) { bestScore = score; best = {l,c,h:hue,a,b}; }
      if (a >= 90.3 && b >= 90.3) return {l,c,h:hue,a,b, exact:true};
    }
  }
  return best ? {...best, exact:false} : null;
}

const domains = { strategy: 280, people: 260, finance: 160, operations: 100, risk: 0, knowledge: 120 };
console.log('DOMAIN INK DARK');
for (const [name, hue] of Object.entries(domains)) {
  const tintDark = [0.26, 0.03, hue];
  console.log(name, bestDark(hue, tintDark, 0.16));
}

console.log('\nSEMANTIC INK DARK');
const semantics = { success: 145, warn: 80, danger: 25, info: 235 };
for (const [name, hue] of Object.entries(semantics)) {
  const tintDark = [0.28, 0.035, hue];
  console.log(name, bestDark(hue, tintDark, 0.17));
}
