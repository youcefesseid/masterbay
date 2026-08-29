// Static wiring check: the browser can't be clicked here, so verify that every
// element app.js reaches for exists, every translation key resolves, and every
// option value the UI can emit is one the API whitelist accepts.
import { promises as fs } from 'node:fs';
const html = await fs.readFile('public/index.html', 'utf8');
const js   = await fs.readFile('public/app.js', 'utf8');
const api  = await fs.readFile('src/api.js', 'utf8');
let bad = 0;
const fail = (m) => { bad++; console.log(`  ✗ ${m}`); };
const pass = (m) => console.log(`  ✓ ${m}`);

// 1. every $('id') must exist in the markup
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
// Ids accessed with optional chaining ($('x')?.) are created at runtime on purpose.
const wanted = [...new Set(
  [...js.matchAll(/\$\('([A-Za-z0-9_]+)'\)(\?)?/g)].filter((m) => !m[2]).map((m) => m[1]),
)];
const missing = wanted.filter((id) => !htmlIds.has(id));
missing.length ? fail(`app.js reaches for missing ids: ${missing.join(', ')}`)
               : pass(`all ${wanted.length} referenced element ids exist in index.html`);

// 2. every data-i18n key must have a translation entry
const keys = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];
const dict = js.slice(js.indexOf('const T = {'), js.indexOf('\n};', js.indexOf('const T = {')));
const noTrans = keys.filter((k) => !new RegExp(`^\\s*${k}:`, 'm').test(dict));
noTrans.length ? fail(`data-i18n keys with no translation: ${noTrans.join(', ')}`)
               : pass(`all ${keys.length} data-i18n keys have ar/en entries`);

// 3. every t('key') used in app.js must exist too
const used = [...new Set([...js.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]))];
const undef = used.filter((k) => !new RegExp(`^\\s*${k}:`, 'm').test(dict));
undef.length ? fail(`t() called with undefined keys: ${undef.join(', ')}`)
             : pass(`all ${used.length} t() lookups resolve`);

// 4. every enum value the UI can send must be accepted by the API whitelist
const enums = {};
const block = api.slice(api.indexOf('const ENUMS = {'), api.indexOf('\n};', api.indexOf('const ENUMS = {')));
for (const m of block.matchAll(/(\w+):\s*\[([^\]]+)\]/g)) {
  enums[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
}
let enumBad = 0;
for (const m of js.matchAll(/seg\('(\w+)',\s*\[([^\]]+)\]\)/g)) {
  const key = m[1];
  const offered = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  const rejected = offered.filter((v) => !enums[key]?.includes(v));
  if (rejected.length) { fail(`UI offers ${key}=${rejected.join('/')} but the API rejects it`); enumBad++; }
}
if (!enumBad) pass(`every option the UI can send passes the API whitelist`);

// 4b. numeric options from UI must exist in NUMERIC
const numBlock = api.slice(api.indexOf('const NUMERIC = {'), api.indexOf('\n};', api.indexOf('const NUMERIC = {')));
const numKeys = new Set([...numBlock.matchAll(/(\w+):\s*\{/g)].map((m) => m[1]));
for (const m of js.matchAll(/type:\s*'range',\s*key:\s*'(\w+)'/g)) {
  const key = m[1];
  if (!numKeys.has(key)) fail(`UI range for ${key} but API NUMERIC has no such key`);
}

// 5. option keys the UI writes must exist in the sanitised shape
const boolKeys = [...new Set([...js.matchAll(/key:\s*'([A-Za-z.]+)'/g)].map((m) => m[1]))];
const known = new Set([...Object.keys(enums), ...numKeys, 'autoCrop','deband','upscale','tonemapHdr','forceStereo','hwAccel','stripMetadata','padColor','variation.enabled','variation.mirror','variation.zoom','variation.speed']);
const strays = boolKeys.filter((k) => !known.has(k));
strays.length ? fail(`UI writes unknown option keys: ${strays.join(', ')}`)
              : pass(`all ${boolKeys.length} option keys the UI writes are real`);

// 6. CSS classes the JS toggles should be defined somewhere in the stylesheet
const css = await fs.readFile('public/styles.css', 'utf8');
const toggled = [...new Set([...js.matchAll(/classList\.(?:add|toggle|remove)\('([a-z-]+)'/g)].map((m) => m[1]))];
const undefined_ = toggled.filter((c) => !css.includes(`.${c}`));
undefined_.length ? fail(`JS toggles classes with no CSS: ${undefined_.join(', ')}`)
                  : pass(`all ${toggled.length} toggled classes have styles`);

console.log('');
process.exit(bad ? 1 : 0);
