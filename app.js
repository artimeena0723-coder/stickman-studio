// Stickman Studio v2 — all logic runs on the phone. Gemini REST API is called directly with the user's keys.
import * as MB from './mediabunny.min.mjs';
import { unzipSync } from './fflate.mjs';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const $ = id => document.getElementById(id);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = s => { s = Math.max(0, s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64 = buf => { let s = '', b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const NKEYS = 6;

/* ================= constants ================= */
const VOICES = [['Charon', 'Informative'], ['Gacrux', 'Mature'], ['Algenib', 'Gravelly'], ['Sadaltager', 'Knowledgeable'], ['Orus', 'Firm'], ['Iapetus', 'Clear'], ['Schedar', 'Even'], ['Rasalgethi', 'Informative'], ['Enceladus', 'Breathy'], ['Alnilam', 'Firm'], ['Kore', 'Firm'], ['Puck', 'Upbeat'], ['Zephyr', 'Bright'], ['Fenrir', 'Excitable'], ['Leda', 'Youthful'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'], ['Erinome', 'Clear'], ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'], ['Pulcherrima', 'Forward'], ['Achird', 'Friendly'], ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'], ['Sadachbia', 'Lively'], ['Sulafat', 'Warm']];
const MALE = ['Charon', 'Gacrux', 'Algenib', 'Sadaltager', 'Orus', 'Iapetus', 'Schedar', 'Rasalgethi', 'Enceladus', 'Alnilam', 'Puck', 'Fenrir', 'Umbriel', 'Algieba', 'Achird', 'Zubenelgenubi', 'Sadachbia'];
const FEMALE = ['Kore', 'Zephyr', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'];
const LANGS = {
  hi: { name: 'Hindi', codes: ['hi-IN'], wps: 2.4, consent: 'मैं इस आवाज का मालिक हूं और मैं सिंथेटिक आवाज मॉडल बनाने के लिए Google को इस आवाज का उपयोग करने की सहमति देता हूं', sample: 'आप तीसवीं मंज़िल पर रहते हैं। आज रात तक, यही आपके फ्लैट की सबसे बुरी बात थी। रात 9 बजकर 40 मिनट पर, बिल्डिंग का हर फ़ोन एक साथ चीख उठता है।' },
  en: { name: 'English', codes: ['en-US', 'en-IN', 'en-GB'], wps: 2.6, consent: 'I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model.', sample: 'You live on the 30th floor. Until tonight, that was the worst thing about your flat. At 9:40, every phone in the building screams at once.' }
};
const PRESETS = {
  survival: {
    min: 6, max: 8,
    voice: 'calm, tense, intimate documentary narrator, measured pace, building suspense',
    story: 'Second-person present tense ("you"/"aap"). Short punchy sentences. Time stamps and day counters. Structure as "First problem... Next problem..." with real survival facts woven in. Constant escalating threat, open loops, and a cliffhanger twist ending.',
    look: 'moody cinematic lighting, tension, survival atmosphere'
  },
  history: {
    min: 3, max: 5,
    voice: 'warm, curious, confident storyteller, engaging and slightly fast, documentary feel',
    story: 'Hook with a modern-vs-past contrast ("This morning... now rewind 50,000 years"). Ask the viewer direct questions, reveal surprising evidence (archaeology, history), walk through "a normal day", and end with an emotional payoff that makes the viewer rethink their own life.',
    look: 'bright warm daylight, historical settings, clear visual metaphors and comparisons (split screens, red X, before/after)'
  },
  custom: { min: 6, max: 8, voice: 'engaging cinematic storyteller', story: 'Follow the extra instructions.', look: '' }
};
const ART = 'Hand-drawn 2D cartoon illustration for a YouTube storytelling channel. Stickman characters with big round white heads, thick clean black outlines, simple black dot eyes, very expressive eyebrows and mouths, thin black stick arms and legs, minimal clothing accessories. Richly detailed, colourful painted backgrounds with soft cinematic lighting and depth. Clean composition, crisp lines, high detail.';
const NEG = 'No text, no letters, no numbers, no captions, no subtitles, no speech bubbles, no logos, no watermark, no signature, no sparkle or star icon, no border or frame. Fill the whole frame edge to edge.';
const TRANS = ['fade', 'slide', 'push', 'zoom', 'circle'];

/* ================= state ================= */
const S = { keys: [], keyIdx: 0, busy: false, stop: false, P: null, page: 0, fileCache: {}, anchorCache: {}, refs: [], bg: null, voiceFile: null, libVoices: [] };
const st = (id, v) => { const el = $(id); if (!el) return; if (v === undefined) return el.type === 'checkbox' ? el.checked : el.value; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; };

/* ================= IndexedDB ================= */
let dbp;
function db() { return dbp ||= new Promise((res, rej) => { const r = indexedDB.open('stickman_v2', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function put(k, v) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function get(k) { const d = await db(); return new Promise((res, rej) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function del(k) { const d = await db(); return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; }); }
async function clearAll() { const d = await db(); await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = res; }); try { const root = await navigator.storage.getDirectory(); for await (const [n] of root.entries()) await root.removeEntry(n).catch(() => { }); } catch (e) { } }
let saveT = 0;
async function saveP(now) { if (!S.P) return; if (!now && Date.now() - saveT < 1500) return; saveT = Date.now(); await put('proj', S.P); }

/* ================= UI basics ================= */
function showTab(t) { $$('nav button').forEach(x => x.classList.toggle('on', x.dataset.t === t)); $$('.tab').forEach(x => x.classList.toggle('on', x.id === 't-' + t)); if (t === 'board') renderBoard(); }
$$('nav button').forEach(b => b.onclick = () => showTab(b.dataset.t));
function seg(id, key, cb) {
  const v = localStorage.getItem('ss_' + key);
  $$('#' + id + ' button').forEach(b => { if (v) b.classList.toggle('on', b.dataset.v === v); b.onclick = () => { $$('#' + id + ' button').forEach(x => x.classList.remove('on')); b.classList.add('on'); localStorage.setItem('ss_' + key, b.dataset.v); cb && cb(b.dataset.v); }; });
}
const segVal = id => (document.querySelector('#' + id + ' button.on') || document.querySelector('#' + id + ' button')).dataset.v;
function setProgress(p, label) { p = Math.max(0, Math.min(100, p)); $('pfill').style.width = p + '%'; $('ppct').textContent = Math.floor(p) + '%'; if (label) $('plabel').textContent = label; }
function log(m) { const t = new Date().toLocaleTimeString(); const el = $('log'); el.textContent += `[${t}] ${m}\n`; if (el.textContent.length > 60000) el.textContent = el.textContent.slice(-40000); el.scrollTop = el.scrollHeight; }
const STEP_DEF = { tts: [['keys', 'API keys'], ['plan', 'Script → scenes + emotion + prompts'], ['voice', 'AI voice-over (emotion ke saath)'], ['images', 'Stickman images'], ['render', 'Video render (transitions)'], ['final', 'Final video (voice sync)']], upload: [['keys', 'API keys'], ['decode', 'Voice file padhna'], ['transcribe', 'Voice sunkar text + timing'], ['plan', 'Scenes + image prompts'], ['images', 'Stickman images'], ['render', 'Video render (transitions)'], ['final', 'Final video (voice sync)']] };
const WEIGHTS = { tts: { keys: 1, plan: 6, voice: 18, images: 45, render: 27, final: 3 }, upload: { keys: 1, decode: 4, transcribe: 8, plan: 5, images: 50, render: 29, final: 3 } };
function stepsFor() { return STEP_DEF[S.P?.mode || segVal('modeSeg')]; }
function step(id, state, sub, frac) {
  if (!S.P) return; S.P.steps ||= {}; S.P.steps[id] = { st: state, sub: sub || '', f: frac ?? (state === 'done' ? 1 : (S.P.steps[id]?.f || 0)) };
  renderSteps();
  const W = WEIGHTS[S.P.mode]; let tot = 0, sum = 0; for (const [k] of stepsFor()) { tot += W[k]; sum += W[k] * (S.P.steps[k]?.f || 0); }
  const name = (stepsFor().find(s => s[0] === id) || [, ''])[1];
  setProgress(100 * sum / tot, state === 'run' ? name + (sub ? ' — ' + sub : '') : state === 'err' ? '❌ ' + name + ' — Workflow dekho' : undefined);
}
function renderSteps() { renderKeyStat(); const ss = S.P?.steps || {}; $('steps').innerHTML = stepsFor().map(([id, n]) => { const s = ss[id] || {}; return `<div class="step"><span class="dot ${s.st || ''}"></span><span>${n}</span><span class="sp">${esc(s.sub || ({ done: '✓', err: 'error' }[s.st] || ''))}</span></div>`; }).join(''); }
let wakeLock = null;
async function keepAwake(on) { try { if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.onrelease = () => wakeLock = null; } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (S.busy) { if (document.hidden) log('⚠️ App background me gayi — phone kaam rok sakta hai. App screen par rakho.'); else keepAwake(true); } });
class Stop extends Error { }
const chk = () => { if (S.stop) throw new Stop('Paused'); };

/* ================= settings ================= */
const PERSIST = ['mText', 'minSec', 'maxSec', 'preset', 'notes', 'imgModel', 'lang', 'ttsModel', 'vStyle', 'testText', 'cloneName', 'accCount', 'kVoice'];
const PERSIST_CHK = ['enh', 'cropLogo', 'autoEmo', 'autoCast', 'useVoiceKey'];
function loadSettings() {
  const k = JSON.parse(localStorage.getItem('ss_keys') || '[]'); for (let i = 0; i < NKEYS; i++) st('k' + i, k[i] || '');
  PERSIST.forEach(id => { const v = localStorage.getItem('ss_' + id); if (v !== null && $(id)) st(id, v); });
  PERSIST_CHK.forEach(id => { const v = localStorage.getItem('ss_' + id); if (v !== null) st(id, v === '1'); });
  S.keys = k.filter(Boolean);
}
function saveSettings() { PERSIST.forEach(id => $(id) && localStorage.setItem('ss_' + id, st(id))); PERSIST_CHK.forEach(id => localStorage.setItem('ss_' + id, st(id) ? '1' : '0')); }
document.addEventListener('change', e => { if (e.target.id && (PERSIST.includes(e.target.id) || PERSIST_CHK.includes(e.target.id))) saveSettings(); });
function readKeys() { const k = []; for (let i = 0; i < NKEYS; i++) k.push(st('k' + i).trim()); localStorage.setItem('ss_keys', JSON.stringify(k)); S.keys = k.filter(Boolean); S.keyIdx = 0; return k; }
S.kst = {};
const KMSG = { 400: 'galat key', 401: 'galat key', 403: 'permission nahi', 429: 'quota khatam (baad me chalegi)', 404: 'model naam galat' };
function setKst(i, ok, msg) { S.kst[i] = { ok, msg, t: Date.now() }; const el = $('ks' + (i === 'paid' ? 'V' : i)); if (el) { el.textContent = msg; el.style.color = ok === null ? '' : ok ? 'var(--ok)' : 'var(--bad)'; } renderKeyStat(); }
function renderKeyStat() {
  const el = $('keyStat'); if (!el) return; const rows = [];
  for (let i = 0; i < NKEYS; i++) { const v = st('k' + i).trim(); if (!v) continue; const k = S.kst[i]; rows.push(`<div class="step"><span class="dot ${k ? (k.ok === null ? 'run' : k.ok ? 'done' : 'err') : ''}"></span><span>Key ${i + 1} <small class="hint">…${esc(v.slice(-4))}</small></span><span class="sp">${esc(k ? k.msg : 'check nahi hui')}</span></div>`); }
  if (st('kVoice').trim()) { const k = S.kst.paid; rows.push(`<div class="step"><span class="dot ${k ? (k.ok ? 'done' : 'err') : ''}"></span><span>Paid voice key</span><span class="sp">${esc(k ? k.msg : 'check nahi hui')}</span></div>`); }
  el.innerHTML = rows.length ? rows.join('') : '<div class="hint">Koi key nahi daali. Setup tab me key daalo.</div>';
}
async function testKeys() {
  const k = readKeys(); saveSettings(); showTab('flow');
  const one = async (key, i) => { setKst(i, null, '⏳ check ho rahi hai...'); try {
      const L = await fetch(`${API}/models?pageSize=1`, { headers: { 'x-goog-api-key': key } }); // free call, quota nahi khata
      if (!L.ok) { setKst(i, false, '❌ ' + L.status + ' ' + (KMSG[L.status] || 'key sahi nahi')); return false; }
      const r = await fetch(`${API}/models/${st('mText').trim()}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply OK' }] }] }) });
      if (r.ok) { setKst(i, true, '✅ verify ho gayi'); return true; }
      if (r.status === 429) { setKst(i, true, '✅ key sahi hai — par aaj ka free quota khatam (12:30 PM IST ke aas-paas reset)'); return true; }
      setKst(i, false, '❌ ' + r.status + ' ' + (KMSG[r.status] || '')); return false; } catch (e) { setKst(i, false, '❌ network/internet'); return false; } };
  let ok = 0; for (let i = 0; i < NKEYS; i++) { if (!k[i]) { delete S.kst[i]; $('ks' + i).textContent = ''; continue; } if (await one(k[i], i)) ok++; }
  if (st('kVoice').trim()) await one(st('kVoice').trim(), 'paid');
  renderKeyStat(); log(`🔑 API keys: ${ok}/${S.keys.length} verify ho gayi`);
}

/* ================= Gemini with auto key switch ================= */
class Fatal extends Error { }
class Skip extends Error { }
function keyList(purpose) { if (purpose === 'voice' && st('useVoiceKey') && st('kVoice').trim()) return [st('kVoice').trim()]; return S.keys; }
// fn(key, keyIndex) -> result; rotates keys on quota/network errors, waits and retries; never gives up quickly
async function withKeys(label, fn, { purpose = 'main', rounds = 8 } = {}) {
  const keys = keyList(purpose); if (!keys.length) throw new Fatal('Setup tab me kam se kam 1 API key daalo.');
  let last = '', skips = 0; const useIdx = purpose === 'voice' && keys !== S.keys ? { v: 0 } : null;
  for (let round = 0; round < rounds; round++) {
    for (let a = 0; a < keys.length; a++) {
      chk();
      const ki = useIdx ? 0 : S.keyIdx % keys.length;
      try { const r = await fn(keys[ki], useIdx ? 'paid' : ki); if (!S.kst[useIdx ? 'paid' : ki]?.ok) setKst(useIdx ? 'paid' : ki, true, '✅ chal rahi hai'); return r; }
      catch (e) {
        if (e instanceof Stop || e instanceof Fatal) throw e;
        if (e instanceof Skip) { skips++; if (skips >= keys.length * 2) throw new Fatal(label + ': ' + e.message); }
        last = e.message || String(e); if (!(e instanceof Skip) && !e.bad) setKst(useIdx ? 'paid' : ki, false, '❌ ' + (e.status ? e.status + ' ' + (KMSG[e.status] || '') : 'network'));
      }
      if (!useIdx && keys.length > 1) { S.keyIdx = (ki + 1) % keys.length; log(`⚠️ ${label}: Key ${ki + 1} fail (${last.slice(0, 80)}) → Key ${S.keyIdx + 1}`); }
      else log(`⚠️ ${label}: retry (${last.slice(0, 80)})`);
    }
    const wait = Math.min(60, 5 * 2 ** round); log(`⏳ ${label}: ${wait}s ruk kar dobara...`);
    for (let w = 0; w < wait * 2; w++) { chk(); await sleep(500); }
  }
  throw new Error(`${label} fail: ${last}`);
}
async function post(url, key, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
  const txt = await r.text();
  if (r.ok) return JSON.parse(txt || '{}');
  const e = new Error(`${r.status}: ${txt.slice(0, 220)}`); e.status = r.status; e.body = txt;
  if (r.status === 404) throw new Fatal(`Model nahi mila (${url.split('/models/')[1]?.split(':')[0]}). Setup me model naam check karo.`);
  if (r.status === 400 && !/quota|exhaust|billing|api key|API_KEY|location|permission|rate/i.test(txt)) { e.bad = true; }
  if ((r.status === 400 || r.status === 403) && /free tier|billing|FreeTier|limit: 0/i.test(txt)) e.billing = true;
  throw e;
}
const gen = (model, key, body) => post(`${API}/models/${model}:generateContent`, key, body);
const partsOf = j => j?.candidates?.[0]?.content?.parts || [];
const textOf = j => partsOf(j).filter(p => !p.thought).map(p => p.text || '').join('');
function parseJSON(t) { t = t.trim().replace(/^```(?:json)?/, '').replace(/```$/, ''); try { return JSON.parse(t); } catch (e) { const m = t.match(/[\[{][\s\S]*[\]}]/); return JSON.parse(m ? m[0] : t); } }
const TEXT_CHAIN = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.1-flash', 'gemini-3.1-flash-lite'];
async function askJSON(label, parts, maxTok = 32768) {
  const first = st('mText').trim(); const chain = [first, ...TEXT_CHAIN.filter(m => m !== first)];
  const once = (model, rounds) => withKeys(label + (model !== first ? ' [' + model.replace('gemini-', '') + ']' : ''), async key => {
    const j = await gen(model, key, { contents: [{ role: 'user', parts: typeof parts === 'function' ? await parts(key) : parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTok, temperature: 0.7 } });
    const t = textOf(j); if (!t) throw new Error('khali jawab'); return parseJSON(t);
  }, { rounds });
  S.txtBad ||= {};
  for (const m of chain) { if (S.txtBad[m] > Date.now()) continue; try { const r = await once(m, 1); if (m !== first && !S.txtNote) { S.txtNote = 1; log(`ℹ️ ${first} ki free limit khatam — ab ${m} se kaam ho raha hai`); } return r; } catch (e) { if (e instanceof Stop) throw e; S.txtBad[m] = Date.now() + 10 * 60e3; log(`⚠️ ${m}: kaam nahi bana (${(e.message || '').slice(0, 120)}) → agla model`); } }
  S.txtBad = {}; return once(first, 6);
}
async function uploadFile(key, blob, name) {
  const ck = key.slice(-8) + '|' + name + '|' + blob.size; if (S.fileCache[ck]) return S.fileCache[ck];
  const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', { method: 'POST', headers: { 'x-goog-api-key': key, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(blob.size), 'X-Goog-Upload-Header-Content-Type': blob.type || 'audio/wav', 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { display_name: name } }) });
  const url = start.headers.get('x-goog-upload-url'); if (!url) throw new Error('upload start fail ' + start.status);
  const up = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' }, body: blob });
  let f = (await up.json()).file;
  for (let i = 0; i < 120 && f.state === 'PROCESSING'; i++) { await sleep(2500); f = await (await fetch(`${API}/${f.name}`, { headers: { 'x-goog-api-key': key } })).json(); }
  if (f.state === 'FAILED') throw new Error('file process fail');
  return S.fileCache[ck] = { mime: f.mimeType, uri: f.uri };
}

/* ================= audio utils ================= */
const SR = 24000;
function parseWav(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF') return { sr: SR, ch: 1, pcm: new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + (bytes.byteLength & ~1))) };
  let p = 12, sr = SR, ch = 1, bits = 16;
  while (p + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.slice(p, p + 4)); let sz = v.getUint32(p + 4, true);
    if (id === 'fmt ') { ch = v.getUint16(p + 10, true); sr = v.getUint32(p + 12, true); bits = v.getUint16(p + 22, true); }
    if (id === 'data') { if (sz === 0xFFFFFFFF || p + 8 + sz > bytes.length) sz = bytes.length - p - 8; const d = bytes.slice(p + 8, p + 8 + (sz & ~1)); let pcm = new Int16Array(d.buffer); if (ch > 1) { const m = new Int16Array(pcm.length / ch); for (let i = 0; i < m.length; i++) { let s = 0; for (let c = 0; c < ch; c++) s += pcm[i * ch + c]; m[i] = s / ch; } pcm = m; } return { sr, ch: 1, pcm }; }
    p += 8 + sz + (sz & 1);
  }
  throw new Error('WAV parse fail');
}
function resampleI16(pcm, from, to) { if (from === to) return pcm; const n = Math.floor(pcm.length * to / from), o = new Int16Array(n), r = from / to; for (let i = 0; i < n; i++) { const x = i * r, a = Math.floor(x), f = x - a; o[i] = (pcm[a] || 0) * (1 - f) + (pcm[a + 1] ?? pcm[a] ?? 0) * f; } return o; }
function wavBlob(pcm, sr = SR) { const h = new ArrayBuffer(44), v = new DataView(h), n = pcm.length * 2; const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0))); w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n, true); return new Blob([h, pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + n)], { type: 'audio/wav' }); }
function trimSilence(pcm, pad = 0.06) { const th = 330; let a = 0, b = pcm.length - 1; while (a < b && Math.abs(pcm[a]) < th) a++; while (b > a && Math.abs(pcm[b]) < th) b--; a = Math.max(0, a - pad * SR); b = Math.min(pcm.length, b + pad * SR); return pcm.slice(a, b); }
function concatI16(arr, gapSec = 0) { const g = Math.round(gapSec * SR); const n = arr.reduce((s, a) => s + a.length, 0) + g * Math.max(0, arr.length - 1); const o = new Int16Array(n); let p = 0; arr.forEach((a, i) => { o.set(a, p); p += a.length + (i < arr.length - 1 ? g : 0); }); return o; }
async function decodeSmall(blob) { const ac = new OfflineAudioContext(1, 1, SR); const b = await ac.decodeAudioData(await blob.arrayBuffer()); const n = Math.ceil(b.duration * SR); const oc = new OfflineAudioContext(1, n, SR); const s = oc.createBufferSource(); s.buffer = b; s.connect(oc.destination); s.start(); const r = (await oc.startRendering()).getChannelData(0); const o = new Int16Array(r.length); for (let i = 0; i < r.length; i++) o[i] = Math.max(-1, Math.min(1, r[i])) * 32767; return o; }

// Voice enhance — stateful DSP so long audio is processed seamlessly
class Biquad {
  constructor(type, f, q, gain, sr) { const A = 10 ** (gain / 40), w = 2 * Math.PI * f / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q); let b0, b1, b2, a0, a1, a2;
    if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    else if (type === 'low') { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * c + sq); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - sq); a0 = (A + 1) + (A - 1) * c + sq; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - sq; }
    else { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq); a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq; }
    this.b = [b0 / a0, b1 / a0, b2 / a0]; this.a = [a1 / a0, a2 / a0]; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  run(x) { const y = this.b[0] * x + this.b[1] * this.x1 + this.b[2] * this.x2 - this.a[0] * this.y1 - this.a[1] * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
class VoiceFX {
  constructor(sr = SR, preGain = 1) { this.f = [new Biquad('hp', 80, 0.707, 0, sr), new Biquad('low', 160, 0.707, 1.5, sr), new Biquad('peak', 300, 1, -2.5, sr), new Biquad('peak', 3200, 0.9, 3.5, sr), new Biquad('high', 9000, 0.707, 2, sr)]; this.g = preGain; this.env = 0; this.lim = 1; this.aA = Math.exp(-1 / (0.005 * sr)); this.aR = Math.exp(-1 / (0.15 * sr)); this.lR = Math.exp(-1 / (0.06 * sr)); }
  process(buf) { // Float32 in-place
    for (let i = 0; i < buf.length; i++) {
      let x = buf[i] * this.g; for (const f of this.f) x = f.run(x);
      const a = Math.abs(x); this.env = a > this.env ? this.aA * this.env + (1 - this.aA) * a : this.aR * this.env + (1 - this.aR) * a;
      const db = 20 * Math.log10(this.env + 1e-9), over = db + 20; let gr = over > 0 ? -over * (1 - 1 / 3.5) : 0; x *= 10 ** ((gr + 4) / 20);
      const p = Math.abs(x) * this.lim; if (p > 0.9) this.lim = 0.9 / Math.abs(x); else this.lim = this.lR * this.lim + (1 - this.lR) * 1; x *= this.lim;
      buf[i] = x;
    }
    return buf;
  }
}
function rmsOf(pcm) { let s = 0, n = 0; for (let i = 0; i < pcm.length; i += 4) { const v = pcm[i] / 32768; if (Math.abs(v) > 0.01) { s += v * v; n++; } } return n ? Math.sqrt(s / n) : 0.1; }
function playPcm(pcm, enhance) { const f = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768; if (enhance) new VoiceFX(SR, Math.min(6, Math.max(0.5, 0.12 / rmsOf(pcm)))).process(f); const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) o[i] = Math.max(-1, Math.min(1, f[i])) * 32767; const a = $('testAudio'); a.src = URL.createObjectURL(wavBlob(o)); a.style.display = 'block'; a.play().catch(() => { }); return a; }

/* ================= voices ================= */
function customVoices() { return JSON.parse(localStorage.getItem('ss_custom') || '[]'); }
function saveCustom(list) { localStorage.setItem('ss_custom', JSON.stringify(list)); fillVoices(); }
function fillVoices() {
  const sel = $('voiceSel'), cur = localStorage.getItem('ss_voiceSel') || 'Charon';
  const rec = ['Charon', 'Gacrux', 'Algenib', 'Sadaltager', 'Orus', 'Iapetus', 'Schedar', 'Rasalgethi'];
  let h = '<optgroup label="⭐ Storytelling / History ke liye best">' + rec.map(v => `<option value="${v}">${v} — ${VOICES.find(x => x[0] === v)[1]}</option>`).join('') + '</optgroup>';
  h += '<optgroup label="Saari 30 voices">' + VOICES.filter(v => !rec.includes(v[0])).map(v => `<option value="${v[0]}">${v[0]} — ${v[1]}</option>`).join('') + '</optgroup>';
  const lang = st('lang'), lib = S.libVoices.filter(v => LANGS[lang].codes.some(c => (v.language_code || v.languageCode || '').toLowerCase().startsWith(c.slice(0, 2).toLowerCase())));
  if (lib.length) h += `<optgroup label="${LANGS[lang].name} voice library">` + lib.map(v => `<option value="lib:${esc(v.id)}">${esc(v.display_name || v.displayName || v.id)}${v.gender ? ' (' + v.gender + ')' : ''}</option>`).join('') + '</optgroup>';
  const cv = customVoices(); if (cv.length) h += '<optgroup label="🧬 Meri cloned voices">' + cv.map((v, i) => `<option value="cv:${i}">${esc(v.name)}</option>`).join('') + '</optgroup>';
  sel.innerHTML = h; sel.value = cur; if (!sel.value) sel.value = 'Charon';
}
// the voice string for a given key index ('paid' or number). Throws Skip if a custom voice has no id for that key.
function voiceFor(sel, ki) {
  if (sel.startsWith('lib:')) return sel.slice(4);
  if (sel.startsWith('cv:')) { const v = customVoices()[+sel.slice(3)]; const id = v?.ids?.[ki]; if (!id) throw new Skip(`"${v?.name}" voice is key ke project me nahi hai`); return id; }
  return sel;
}
function onLang() { const L = LANGS[st('lang')]; $('consentText').textContent = L.consent; if (!localStorage.getItem('ss_testText_' + st('lang'))) st('testText', L.sample); else st('testText', localStorage.getItem('ss_testText_' + st('lang'))); fillVoices(); }
async function loadLibrary() {
  if (!S.keys.length) return alert('Pehle Setup me API key daalo');
  try { const codes = LANGS[st('lang')].codes; const q = codes.map(c => 'language_code=' + encodeURIComponent(c)).join('&');
    const r = await fetch(`${API}/voices?${q}&type=prebuilt&page_size=300`, { headers: { 'x-goog-api-key': S.keys[0] } }); const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || r.status); S.libVoices = j.voices || []; fillVoices(); log(`🔎 ${S.libVoices.length} ${LANGS[st('lang')].name} library voices mili`); alert(`${S.libVoices.length} voices load hui — Voice character list dekho`);
  } catch (e) { alert('Voice library load nahi hui: ' + e.message); }
}
async function loadMine() {
  if (!S.keys.length) return alert('Pehle Setup me API key daalo');
  const map = {}; for (let ki = 0; ki < S.keys.length; ki++) { try { const r = await fetch(`${API}/voices?type=replicated&type=prompted&page_size=200`, { headers: { 'x-goog-api-key': S.keys[ki] } }); const j = await r.json(); for (const v of j.voices || []) { if (v.type === 'prebuilt') continue; const n = v.display_name || v.displayName || v.id; (map[n] ||= {})[ki] = v.id; } } catch (e) { } }
  const list = customVoices(); for (const [name, ids] of Object.entries(map)) { const ex = list.find(x => x.name === name); if (ex) Object.assign(ex.ids, ids); else list.push({ name, ids }); }
  saveCustom(list); alert(Object.keys(map).length ? `${Object.keys(map).length} cloned voice mili. Voice list me "Meri cloned voices" dekho.` : 'Koi cloned voice nahi mili in keys ke projects me.');
}
let rec = null;
async function record(btn, target) {
  if (rec) { rec.stop(); return; }
  try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }); const chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); rec = null; btn.textContent = '⏺ Record'; S[target] = new Blob(chunks, { type: rec?.mimeType || 'audio/webm' }); const pcm = await decodeSmall(S[target]); S[target + 'Pcm'] = pcm; $(target === 'cloneSrcB' ? 'srcInfo' : 'conInfo').textContent = `Record hua: ${(pcm.length / SR).toFixed(1)} sec`; };
    rec.start(); btn.textContent = '⏹ Stop';
  } catch (e) { alert('Mic nahi mila: ' + e.message); }
}
async function makeClone() {
  const name = st('cloneName').trim() || 'Meri Voice'; const src = S.cloneSrcBPcm, con = S.cloneConBPcm;
  if (!src || !con) return alert('Sample aur consent dono recording do');
  const sd = src.length / SR; if (sd < 10 || sd > 30) return alert(`Sample ${sd.toFixed(1)} sec ka hai — 10 se 30 sec ka chahiye`);
  if (!S.keys.length && !st('kVoice').trim()) return alert('Pehle API key daalo');
  const body = async () => ({ store: true, voice: { model: st('ttsModel'), type: 'replicated', display_name: name, replicated: { source_audio: { mime_type: 'audio/wav', data: b64(await wavBlob(src).arrayBuffer()) }, consent_audio: { mime_type: 'audio/wav', data: b64(await wavBlob(con).arrayBuffer()) } } } });
  const keys = S.keys.map((k, i) => [k, i]); if (st('kVoice').trim()) keys.push([st('kVoice').trim(), 'paid']);
  const ids = {}; let err = '';
  $('btnClone').disabled = true; $('btnClone').textContent = '⏳ Clone ban raha hai...';
  for (const [k, i] of keys) { try { const r = await post(`${API}/voices`, k, await body()); const id = r.id || r.voice?.id || (r.name || '').split('/').pop(); if (id) { ids[i] = id; log(`🧬 Key ${i === 'paid' ? 'paid' : i + 1}: voice clone bani`); } } catch (e) { err = e.message; log(`❌ Clone (key ${i === 'paid' ? 'paid' : i + 1}): ${e.message.slice(0, 150)}`); } }
  $('btnClone').disabled = false; $('btnClone').textContent = '🧬 Clone banao';
  if (!Object.keys(ids).length) return alert('Clone nahi bani: ' + err.slice(0, 200));
  const list = customVoices(); list.push({ name, ids }); saveCustom(list); $('voiceSel').value = 'cv:' + (list.length - 1); localStorage.setItem('ss_voiceSel', $('voiceSel').value);
  alert(`"${name}" voice ready! ${Object.keys(ids).length} key(s) par. Ab ▶ Voice test karo.`);
}

/* ================= TTS ================= */
const TTS_CHAIN = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'];
const isQuota = e => e && (e.status === 429 || e.billing || /quota|exhaust|RESOURCE_EXHAUSTED|limit: 0/i.test(e.message || ''));
async function ttsOnce(model, key, ki, text, voiceSel, style) {
  const voice = voiceFor(voiceSel, ki); const old = !/^gemini-3\.8/.test(model);
  const classic = () => gen(model, key, { contents: [{ parts: [{ text: style ? `Say in a ${style} way: ${text}` : text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: /^voice_|^voicekey_/.test(voice) ? 'Charon' : voice } } } } });
  let j;
  if (old) j = await classic();
  else {
    const body = { contents: [{ role: 'user', parts: [{ text, ...(style ? { speech_metadata: { style } } : {}) }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice } } } };
    try { j = await gen(model, key, body); }
    catch (e) { if (e.bad && /voice|speech_metadata|unknown name|field/i.test(e.body || '') && !/^voice_|^voicekey_/.test(voice)) j = await classic(); else throw e; }
  }
  const p = partsOf(j).find(p => p.inlineData || p.inline_data); if (!p) throw new Error('audio nahi aaya');
  const d = p.inlineData || p.inline_data; const raw = unb64(d.data);
  if (/l16|pcm/i.test(d.mimeType || d.mime_type || '') && !(raw[0] === 82 && raw[1] === 73)) { const i16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength >> 1); return resampleI16(i16, +((d.mimeType || d.mime_type).match(/rate=(\d+)/)?.[1] || 24000), SR); }
  const w = parseWav(raw); return resampleI16(w.pcm, w.sr, SR);
}
// tries every key on the chosen model; if ALL keys say quota (429), switches to the next voice model automatically
async function tts(text, voiceSel, style, label) {
  const first = st('ttsModel'); const custom = /^cv:/.test(voiceSel || '');
  const chain = [first, ...TTS_CHAIN.filter(m => m !== first && !(custom && !/^gemini-3\.8/.test(m)))];
  S.ttsBad ||= {}; let lastErr;
  for (const model of chain) {
    if (S.ttsBad[model] && S.ttsBad[model] > Date.now() && model !== chain[chain.length - 1]) continue;
    try { const r = await withKeys(label + ' [' + model.replace('gemini-', '') + ']', (key, ki) => ttsOnce(model, key, ki, text, voiceSel, style).catch(e => { if (isQuota(e) && ki !== 'paid') { e.quota = true; } throw e; }), { purpose: 'voice', rounds: 1 });
      if (model !== first && !S.ttsNote) { S.ttsNote = 1; log(`ℹ️ ${first} ki free limit khatam — ab ${model} se voice ban rahi hai`); } return r; }
    catch (e) { if (e instanceof Stop || e instanceof Fatal && !/Model nahi mila/.test(e.message)) throw e; lastErr = e; S.ttsBad[model] = Date.now() + 10 * 60e3; log(`⚠️ ${model}: sab keys par fail (${(e.message || '').slice(0, 160)}) → agla voice model`); }
  }
  // all models exhausted: wait-and-retry on the chosen model like before
  log('⏳ Saare voice models ki limit abhi bhari hai — thoda ruk kar dobara try...'); S.ttsBad = {};
  try { return await withKeys(label, (key, ki) => ttsOnce(first, key, ki, text, voiceSel, style), { purpose: 'voice', rounds: 4 }); }
  catch (e) { if (e instanceof Stop) throw e; throw new Fatal('Voice nahi bani (sab keys + sab models par limit): ' + (e.message || lastErr?.message || '').slice(0, 300) + ' — Har API key ALAG project se banao. Daily limit 12:30 PM IST ke aas-paas reset hoti hai.'); }
}
async function voiceTest() {
  readKeys(); saveSettings(); localStorage.setItem('ss_testText_' + st('lang'), st('testText')); localStorage.setItem('ss_voiceSel', st('voiceSel'));
  const b = $('btnTest'); b.disabled = true; b.textContent = '⏳ Voice ban rahi hai...';
  try { const pcm = await tts(st('testText'), st('voiceSel'), st('vStyle'), 'Voice test'); playPcm(trimSilence(pcm), st('enh')); }
  catch (e) { log('❌ Voice test: ' + e.message); alert('Voice test fail: ' + e.message.slice(0, 400)); }
  finally { b.disabled = false; b.textContent = '▶ Voice test karo'; }
}

/* ================= images helpers ================= */
async function shrink(blob, max = 1024, q = 0.88) { const bm = await createImageBitmap(blob); const s = Math.min(1, max / Math.max(bm.width, bm.height)); const c = new OffscreenCanvas(Math.round(bm.width * s), Math.round(bm.height * s)); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); bm.close(); return c.convertToBlob({ type: 'image/jpeg', quality: q }); }
async function toPart(blob) { return { inline_data: { mime_type: blob.type || 'image/jpeg', data: b64(await blob.arrayBuffer()) } }; }
async function storeSceneImage(i, blob) {
  const bm = await createImageBitmap(blob); const c = new OffscreenCanvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); bm.close();
  const full = await c.convertToBlob({ type: 'image/jpeg', quality: 0.93 }); const thumb = await shrink(full, 360, 0.8);
  await put('img:' + i, full); await put('thumb:' + i, thumb); const s = S.P.scenes[i]; s.img = 1; s.imgErr = '';
  if (!(await get('anchor:char'))) await put('anchor:char', await shrink(full)); if (s.loc && !(await get('anchor:loc:' + s.loc))) await put('anchor:loc:' + s.loc, await shrink(full));
  invalidate(s.start - 1, s.end + 1); updateCard(i);
}
function fullPrompt(i, forManual) {
  const P = S.P, s = P.scenes[i], sh = P.sheet || {}, pre = PRESETS[P.preset] || PRESETS.custom; const loc = sh.locations?.[s.loc] || '';
  return [forManual ? `Use the attached stickman reference image as the main character (same face, same style).` : '',
    `ART STYLE: ${ART} ${pre.look}`, `MAIN CHARACTER: ${sh.character || 'the stickman from the reference image'}. Keep exactly the same face identity, head shape, eyes, eyebrows, line thickness, colours and outfit.`,
    sh.cast?.length ? `OTHER CHARACTERS: ${sh.cast.map(c => `${c.name}: ${c.look || ''}`).join('; ')}` : '',
    `WORLD: ${sh.world || ''}`, loc ? `LOCATION (${s.loc}): ${loc}. Keep this place looking identical every time it appears.` : '',
    `SCENE: ${(s.prompt || '').trim() || ('Illustrate this exact story moment: ' + (s.text || '').trim())}`, s.shot ? `CAMERA: ${s.shot} shot.` : '', s.start < 60 ? 'This is part of the HOOK: make it dramatic, emotional and curiosity-driving.' : '',
    `Aspect ratio ${P.aspect}. ${NEG}`].filter(Boolean).join('\n');
}
async function genImage(i) {
  const P = S.P, s = P.scenes[i];
  const anchors = [];
  const ca = await get('anchor:char'), la = s.loc ? await get('anchor:loc:' + s.loc) : null, bg = await get('bgref');
  const parts = [];
  for (const r of (await get('refs')) || []) parts.push(await toPart(r));
  if (ca) { parts.push(await toPart(ca)); anchors.push('an earlier frame of this same video (match its art style, palette and character exactly)'); }
  if (la && la !== ca) { parts.push(await toPart(la)); anchors.push(`an earlier frame showing the location "${s.loc}" (keep the background identical)`); }
  if (bg) { parts.push(await toPart(bg)); anchors.push('a background/style reference'); }
  const nRef = ((await get('refs')) || []).length;
  parts.push({ text: `Create ONE frame for a stickman storytelling video.\nThe first ${nRef} attached image(s) show THE main character.${anchors.length ? ' The next attached images are, in order: ' + anchors.join('; ') + '.' : ''}\n${fullPrompt(i)}\n(Narration of this moment, for context only: "${s.text.slice(0, 300)}")` });
  const model = st('imgModel'), size = segVal('imgSizeSeg');
  let cfg = { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: P.aspect, imageSize: size } }, soft = false;
  const blob = await withKeys(`Image ${i + 1}`, async key => {
    let j;
    try { j = await gen(model, key, { contents: [{ role: 'user', parts }], generationConfig: cfg }); }
    catch (e) {
      if (e.billing) throw new Fatal('Image API ke liye billing chahiye (free key par images nahi banti). Create tab me "🆓 Free: main import karunga" chuno.');
      if (e.bad && /imageSize|image_size/i.test(e.body)) { cfg = { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: P.aspect } }; throw new Error('imageSize hata kar retry'); }
      if (e.bad && /modalit/i.test(e.body)) { cfg = { ...cfg, responseModalities: ['TEXT', 'IMAGE'] }; throw new Error('modalities retry'); }
      throw e;
    }
    const p = partsOf(j).find(p => (p.inlineData || p.inline_data) && !p.thought);
    if (!p) { if (!soft) { soft = true; parts[parts.length - 1].text += '\nKeep it family-friendly, non-graphic, cartoon style.'; } throw new Error('image nahi aayi (safety?)'); }
    const d = p.inlineData || p.inline_data; return new Blob([unb64(d.data)], { type: d.mimeType || d.mime_type || 'image/png' });
  }, { rounds: 6 });
  await storeSceneImage(i, blob);
}

/* ================= script → scenes ================= */
function splitScript(text, lang, minS, maxS) {
  const wps = LANGS[lang].wps, target = Math.max(4, Math.round((minS + maxS) / 2 * wps)), maxW = Math.max(target + 1, Math.floor(maxS * wps)), minW = Math.round(minS * wps * 0.75);
  const norm = text.replace(/\r/g, '').replace(/[“”]/g, '"');
  // quotes become their own pieces (dialogue)
  const raw = []; norm.split(/("[^"\n]{1,400}")/).forEach(seg => { if (!seg.trim()) return; if (/^".*"$/.test(seg)) raw.push(seg.trim()); else seg.split(/(?<=[।!?.…])\s+|\n+/).forEach(x => x.trim() && raw.push(x.trim())); });
  const pieces = [];
  for (const s of raw) { const w = s.split(/\s+/); if (w.length <= maxW) { pieces.push(s); continue; }
    const commas = s.split(/(?<=[,;:—–])\s+/); let cur = [];
    for (const c of commas) { const cw = c.split(/\s+/); if (cw.length > maxW) { if (cur.length) { pieces.push(cur.join(' ')); cur = []; } for (let k = 0; k < cw.length; k += target) pieces.push(cw.slice(k, k + target).join(' ')); continue; } if (cur.length + cw.length > maxW) { pieces.push(cur.join(' ')); cur = []; } cur.push(...cw); }
    if (cur.length) pieces.push(cur.join(' '));
  }
  const scenes = []; let cur = [], cw = 0;
  const flush = () => { if (cur.length) scenes.push(cur.join(' ')); cur = []; cw = 0; };
  for (const p of pieces) { const w = p.split(/\s+/).length; if (cw && cw + w > maxW) flush(); cur.push(p); cw += w; if (cw >= target) flush(); }
  flush();
  if (scenes.length > 1 && scenes[scenes.length - 1].split(/\s+/).length < minW / 2) { const l = scenes.pop(); scenes[scenes.length - 1] += ' ' + l; }
  return scenes;
}
async function sheetPhase(fullText) {
  const P = S.P, pre = PRESETS[P.preset] || PRESETS.custom; const refs = (await get('refs')) || [];
  const parts = []; for (const r of refs) parts.push(await toPart(r));
  parts.push({ text: `You are the art director of a high-retention faceless STICKMAN storytelling YouTube channel.
The attached image(s) show THE main stickman character. Study him precisely.
Story style: ${pre.story} ${P.notes || ''}
Read the narration below and return ONLY JSON:
{"title":"short catchy video title in ${LANGS[P.lang].name}",
 "character":"precise fixed visual description of the main character copied from the reference (head shape, eyes, eyebrows, mouth, line weight, colours, clothes/accessories)",
 "world":"fixed description of the setting/era/palette/lighting so backgrounds stay consistent",
 "locations":{"key_name":"fixed detailed description of each recurring place (5-15 places)"},
 "cast":[{"name":"exact name or label used in the story (e.g. Neighbour, Old Woman)","gender":"male|female","age":"child|young|adult|old","look":"fixed visual description as a stickman","voice_hint":"how they sound"}],
 "hook":"one line: what visual hook the first 60 seconds use"}
NARRATION:
${fullText.slice(0, 400000)}` });
  const d = await askJSON('Story samajhna', parts, 16384);
  P.sheet = { title: d.title || 'Stickman video', character: d.character || '', world: d.world || '', locations: d.locations || {}, cast: Array.isArray(d.cast) ? d.cast.slice(0, 12) : [], hook: d.hook || '' };
  autoCast(); log(`🎭 ${P.sheet.cast.length} characters, ${Object.keys(P.sheet.locations).length} locations. Hook: ${P.sheet.hook}`);
}
function autoCast() {
  const P = S.P; const narr = st('voiceSel'); P.castVoice ||= {};
  let m = 0, f = 0; const avoid = new Set([narr]);
  for (const c of P.sheet.cast) { if (P.castVoice[c.name]) continue; const pool = (c.gender === 'female' ? FEMALE : MALE).filter(v => !avoid.has(v)); const pick = c.age === 'old' ? (c.gender === 'female' ? 'Vindemiatrix' : 'Gacrux') : c.age === 'child' ? (c.gender === 'female' ? 'Leda' : 'Puck') : pool[(c.gender === 'female' ? f++ : m++) % pool.length]; P.castVoice[c.name] = avoid.has(pick) ? pool[0] : pick; avoid.add(P.castVoice[c.name]); }
  renderCast();
}
function renderCast() {
  const P = S.P; const box = $('castList'); if (!P?.sheet?.cast?.length) { box.textContent = 'Abhi koi character nahi.'; return; }
  const opts = VOICES.map(v => `<option value="${v[0]}">${v[0]} — ${v[1]}</option>`).join('');
  box.innerHTML = P.sheet.cast.map((c, i) => `<div class="row" style="margin:4px 0"><div style="flex:1.2"><b>${esc(c.name)}</b> <span class="hint">${esc(c.gender || '')} ${esc(c.age || '')}</span></div><select data-cast="${i}" style="flex:1">${opts}</select><button class="sec" data-ctest="${i}" style="flex:none;padding:8px 10px">▶</button></div>`).join('');
  P.sheet.cast.forEach((c, i) => { box.querySelector(`[data-cast="${i}"]`).value = P.castVoice[c.name] || 'Puck'; });
  box.querySelectorAll('[data-cast]').forEach(sel => sel.onchange = () => { const c = P.sheet.cast[+sel.dataset.cast]; P.castVoice[c.name] = sel.value; P.scenes.forEach((s, i) => { if (s.lines?.some(l => l.spk === c.name)) { s.audStale = 1; } }); saveP(true); log(`🎭 ${c.name} ki voice: ${sel.value} (unke scenes ki voice dobara banegi)`); });
  box.querySelectorAll('[data-ctest]').forEach(b => b.onclick = async () => { const c = P.sheet.cast[+b.dataset.ctest]; try { b.textContent = '⏳'; const line = P.scenes.flatMap(s => s.lines || []).find(l => l.spk === c.name)?.text || st('testText'); playPcm(trimSilence(await tts(line, P.castVoice[c.name], c.voice_hint || '', 'Character voice')), st('enh')); } catch (e) { alert(e.message); } b.textContent = '▶'; });
}
async function promptsPhase() {
  const P = S.P, pre = PRESETS[P.preset] || PRESETS.custom; const todo = P.scenes.map((s, i) => i).filter(i => !P.scenes[i].prompt);
  if (!todo.length) return; const B = 30; let done = P.scenes.length - todo.length;
  const castNames = (P.sheet.cast || []).map(c => c.name);
  for (let b = 0; b < todo.length; b += B) {
    chk(); const ids = todo.slice(b, b + B); const prev = P.scenes.slice(Math.max(0, ids[0] - 2), ids[0]).map(s => s.prompt).filter(Boolean);
    const list = ids.map(i => ({ i, text: P.scenes[i].text, t: Math.round(P.scenes[i].start || 0) }));
    const d = await askJSON(`Image prompts ${b + 1}-${b + ids.length}`, [{ text: `You direct a high-retention STICKMAN storytelling video. Style: ${pre.story}
Main character: ${P.sheet.character}
World: ${P.sheet.world}
Locations (use these keys): ${JSON.stringify(P.sheet.locations)}
Characters: ${JSON.stringify(castNames)}
Previous scene prompts (for continuity): ${JSON.stringify(prev)}
For EACH scene below write a concrete visual for ONE illustration that matches the narration exactly: what the characters do, their emotion/expression, props, setting and camera shot. Vary shots (wide / medium / close-up / over-shoulder / top-down) to stay engaging. Scenes in the first 60 seconds (t<60) are the HOOK: most dramatic and curious.
${P.mode === 'tts' && st('autoEmo') ? `Also split each scene's narration into "lines" by speaker: Narrator or a character name from the list (only quoted dialogue belongs to a character). For each line give the EXACT text (copy verbatim, nothing added or removed, keep all words) and a short delivery "style" with the real emotion (e.g. "angry, shouting", "calm and soft", "terrified whisper", "excited", "sad, slow"). ${st('autoCast') ? '' : 'Use speaker Narrator for everything.'}` : ''}
Return ONLY JSON: {"scenes":[{"i":0,"prompt":"English visual description","loc":"location_key","shot":"wide|medium|close-up","trans":"fade|slide|push|zoom|circle"${P.mode === 'tts' && st('autoEmo') ? ',"lines":[{"spk":"Narrator","text":"...","style":"..."}]' : ''}}]}
SCENES: ${JSON.stringify(list)}` }], 32768);
    for (const r of d.scenes || []) { const s = P.scenes[r.i]; if (!s || !ids.includes(r.i)) continue; s.prompt = (typeof r.prompt === 'string' ? r.prompt.trim() : '') || s.text; s.loc = P.sheet.locations?.[r.loc] ? r.loc : ''; s.shot = r.shot || ''; s.trans = TRANS.includes(r.trans) ? r.trans : TRANS[r.i % 5];
      if (Array.isArray(r.lines) && r.lines.length) { const joined = r.lines.map(l => l.text || '').join(' ').replace(/\s+/g, ' ').trim(); const orig = s.text.replace(/\s+/g, ' ').trim(); if (Math.abs(joined.length - orig.length) <= Math.max(6, orig.length * 0.08)) s.lines = r.lines.map(l => ({ spk: castNames.includes(l.spk) ? l.spk : 'Narrator', text: l.text, style: l.style || '' })); } }
    for (const i of ids) { const s = P.scenes[i]; if (!s.prompt) { s.prompt = s.text; s.trans = TRANS[i % 5]; } }
    done += ids.length; step('plan', 'run', `prompts ${done}/${P.scenes.length}`, 0.3 + 0.7 * done / P.scenes.length); await saveP(true);
  }
}

/* ================= TTS phase ================= */
async function voiceScene(i) {
  const P = S.P, s = P.scenes[i], base = st('vStyle') || PRESETS[P.preset].voice, narr = st('voiceSel');
  const lines = (s.lines && st('autoEmo')) ? s.lines : [{ spk: 'Narrator', text: s.text, style: '' }];
  const clips = [];
  for (const l of lines) { if (!l.text?.trim()) continue; const isChar = l.spk !== 'Narrator' && st('autoCast') && P.castVoice?.[l.spk];
    const voice = isChar ? P.castVoice[l.spk] : narr; const style = [isChar ? (P.sheet.cast.find(c => c.name === l.spk)?.voice_hint || '') : base, l.style].filter(Boolean).join(', ');
    clips.push(trimSilence(await tts(l.text, voice, style, `Voice ${i + 1}`), 0.04)); }
  const pcm = concatI16(clips, 0.18); const tail = new Int16Array(Math.round(0.22 * SR)); const full = concatI16([pcm, tail]);
  await put('aud:' + i, full); const old = s.dur; s.dur = full.length / SR; s.aud = 1; s.audStale = 0;
  if (Math.abs((old || 0) - s.dur) > 0.01) retime(i); else invalidate(-1, -1, true);
}
function retime(fromIdx = 0) { const sc = S.P.scenes; let t = fromIdx > 0 ? sc[fromIdx - 1].end : 0; for (let i = fromIdx; i < sc.length; i++) { sc[i].start = t; t += sc[i].dur || 0; sc[i].end = t; } S.P.total = t; invalidate(sc[fromIdx]?.start ?? 0, Infinity); }
async function pool(items, n, fn, onDone) { let k = 0; const errs = []; await Promise.all([...Array(Math.max(1, n))].map(async () => { while (k < items.length) { chk(); const it = items[k++]; try { await fn(it); } catch (e) { if (e instanceof Stop || e instanceof Fatal) throw e; errs.push(it); log('❌ ' + e.message.slice(0, 200)); } onDone && onDone(); } })); return errs; }
async function voicePhase() {
  const P = S.P; let todo = P.scenes.map((s, i) => i).filter(i => !P.scenes[i].aud || P.scenes[i].audStale); const tot = P.scenes.length; let done = tot - todo.length;
  const upd = () => step('voice', 'run', `${done}/${tot}`, done / tot); upd();
  const workers = st('useVoiceKey') && st('kVoice').trim() ? 3 : Math.min(3, S.keys.length);
  let errs = await pool(todo, workers, async i => { await voiceScene(i); }, () => { done++; upd(); saveP(); });
  if (errs.length) { log(`🔁 ${errs.length} voice dobara try...`); errs = await pool(errs, 1, voiceScene, () => { }); }
  retime(0); await saveP(true);
  if (errs.length) { step('voice', 'err', `${errs.length} fail`); throw new Fatal(`Scenes ${errs.map(x => x + 1).slice(0, 20).join(', ')} ki voice nahi bani. ▶ Resume dabao.`); }
  step('voice', 'done', fmt(P.total));
}

/* ================= upload mode ================= */
async function decodePhase() {
  const P = S.P; if (P.decoded) return;
  const file = S.voiceFile || await get('voiceFile'); if (!file) throw new Fatal('Voice file dobara upload karo (Create tab).');
  step('decode', 'run', 'padh rahe hain', 0);
  const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack(); if (!track) throw new Fatal('Is file me audio nahi mila');
  const dur = await track.computeDuration(); log(`🎤 Voice length: ${fmt(dur)}`);
  const sink = new MB.AudioBufferSink(track); const CH = 60 * SR; let chunk = new Int16Array(CH), cp = 0, n = 0;
  let lp = null, srcSr = 0, pos = 0, prev = 0;
  for await (const { buffer } of sink.buffers()) {
    chk(); if (!lp) { srcSr = buffer.sampleRate; lp = srcSr > SR ? new Biquad('lp', 10500, 0.707, 0, srcSr) : null; }
    const chs = buffer.numberOfChannels, L = buffer.getChannelData(0), R = chs > 1 ? buffer.getChannelData(1) : null; const ratio = srcSr / SR;
    for (let i = 0; i < L.length; i++) { let x = R ? (L[i] + R[i]) / 2 : L[i]; if (lp) x = lp.run(x);
      // linear resample: emit output samples whose source position falls in [pos, pos+1)
      while (pos >= 0 && pos < 1) { const v = prev + (x - prev) * pos; chunk[cp++] = Math.max(-1, Math.min(1, v)) * 32767; if (cp === CH) { await put('raw:' + n++, chunk); chunk = new Int16Array(CH); cp = 0; } pos += ratio; }
      pos -= 1; prev = x; }
    step('decode', 'run', `${fmt(n * 60 + cp / SR)} / ${fmt(dur)}`, Math.min(0.99, (n * 60 + cp / SR) / dur));
  }
  if (cp) await put('raw:' + n++, chunk.slice(0, cp));
  P.rawChunks = n; P.rawDur = (n - 1) * 60 + (cp || CH) / SR; P.decoded = 1; await saveP(true); step('decode', 'done', fmt(P.rawDur));
}
const rawCache = new Map();
async function rawChunk(n) { if (rawCache.has(n)) return rawCache.get(n); const c = await get('raw:' + n); rawCache.set(n, c); if (rawCache.size > 4) rawCache.delete(rawCache.keys().next().value); return c; }
async function rawSlice(t0, t1) { const a = Math.max(0, Math.round(t0 * SR)), b = Math.round(t1 * SR); const out = new Int16Array(Math.max(0, b - a)); let p = 0; while (p < out.length) { const g = a + p, n = Math.floor(g / (60 * SR)), off = g - n * 60 * SR; const c = await rawChunk(n); if (!c) break; const take = Math.min(c.length - off, out.length - p); if (take <= 0) break; out.set(c.subarray(off, off + take), p); p += take; } return out.subarray(0, p); }
async function transcribePhase() {
  const P = S.P; const CL = 600; const nCl = Math.ceil(P.rawDur / CL); P.segs ||= {};
  for (let c = 0; c < nCl; c++) {
    if (P.segs[c]) continue; chk(); step('transcribe', 'run', `${c + 1}/${nCl} hissa`, c / nCl);
    const t0 = c * CL, t1 = Math.min(P.rawDur, t0 + CL); const pcm16 = resampleI16(await rawSlice(t0, t1), SR, 16000); const blob = wavBlob(pcm16, 16000);
    const d = await askJSON(`Transcribe ${c + 1}/${nCl}`, async key => { const f = await uploadFile(key, blob, `voice_part_${c}`); return [{ file_data: { mime_type: f.mime, file_uri: f.uri } }, { text: `Transcribe this narration audio EXACTLY, word for word, in its original language and script (Hindi in Devanagari, English in Latin). Split it into short segments of one sentence or phrase each (maximum 8 seconds). Timestamps in seconds from the start of THIS clip, accurate to 0.1 s, continuous, covering the entire clip (${(t1 - t0).toFixed(1)} s).
Return ONLY JSON: {"segments":[{"text":"...","start":0.0,"end":0.0}]}` }]; }, 65536);
    const segs = (d.segments || []).filter(x => (x.text || '').trim()).map(x => ({ text: x.text.trim(), start: t0 + Math.max(0, +x.start || 0), end: t0 + Math.min(t1 - t0, +x.end || 0) }));
    if (!segs.length) throw new Error(`Hissa ${c + 1} ka text nahi aaya`);
    P.segs[c] = segs; await saveP(true);
  }
  step('transcribe', 'done', `${nCl} hisse`);
}
async function lowEnergyNear(t, win = 0.35) { const pcm = await rawSlice(t - win, t + win); if (pcm.length < 960) return t; const fr = 480; let best = 0, bv = Infinity; for (let i = 0; i + fr <= pcm.length; i += 240) { let s = 0; for (let k = i; k < i + fr; k += 2) s += Math.abs(pcm[k]); if (s < bv) { bv = s; best = i + fr / 2; } } return Math.max(0, t - win) + best / SR; }
async function buildUploadScenes() {
  const P = S.P; if (P.scenes?.length) return; const minS = P.minSec, maxS = P.maxSec;
  let segs = Object.keys(P.segs).sort((a, b) => a - b).flatMap(k => P.segs[k]); segs.sort((a, b) => a.start - b.start);
  const parts = []; // split long segments
  for (const g of segs) { const d = g.end - g.start; if (d <= maxS + 0.5) { parts.push(g); continue; } const n = Math.ceil(d / ((minS + maxS) / 2)); const w = g.text.split(/\s+/); for (let k = 0; k < n; k++) { const a = Math.round(k * w.length / n), b = Math.round((k + 1) * w.length / n); if (b > a) parts.push({ text: w.slice(a, b).join(' '), start: g.start + d * a / w.length, end: g.start + d * b / w.length }); } }
  const sc = []; let cur = null;
  for (const g of parts) { if (!cur) { cur = { ...g }; continue; } const dur = cur.end - cur.start; if (dur >= minS || g.end - cur.start > maxS) { sc.push(cur); cur = { ...g }; } else { cur.text += ' ' + g.text; cur.end = g.end; } }
  if (cur) sc.push(cur);
  // contiguous, snapped boundaries
  for (let i = 1; i < sc.length; i++) { const b = await lowEnergyNear((sc[i - 1].end + sc[i].start) / 2); sc[i - 1].end = b; sc[i].start = b; }
  sc[0].start = 0; sc[sc.length - 1].end = P.rawDur;
  P.scenes = sc.map((s, i) => ({ text: s.text, start: s.start, end: s.end, dur: s.end - s.start, prompt: '', trans: TRANS[i % 5] }));
  for (let i = 0; i < P.scenes.length; i++) { chk(); const s = P.scenes[i]; await put('aud:' + i, await rawSlice(s.start, s.end)); s.aud = 1; if (i % 50 === 0) step('plan', 'run', `voice cut ${i}/${P.scenes.length}`, 0.05); }
  retime(0); P.total = P.scenes[P.scenes.length - 1].end; await saveP(true);
  log(`🎬 ${P.scenes.length} scenes bane (har scene ${minS}-${maxS} sec)`);
}

/* ================= images phase ================= */
async function imagesPhase() {
  const P = S.P; const tot = P.scenes.length; let todo = P.scenes.map((s, i) => i).filter(i => !P.scenes[i].img); let done = tot - todo.length;
  const upd = () => step('images', 'run', `${done}/${tot}`, done / tot); upd();
  if (P.imgSrc === 'import') {
    if (!todo.length) { step('images', 'done', `${tot}/${tot}`); return; }
    step('images', 'err', `${todo.length} images chahiye`, done / tot); renderBoard(); showTab('board');
    throw new Fatal(`${todo.length} scenes ki images chahiye. Storyboard me 📋 se prompts copy karo, Gemini/Flow me images banao, phir 📥 se import karo. Uske baad ▶ Resume.`);
  }
  if (todo.length && !(await get('anchor:char'))) { await genImage(todo.shift()); done++; upd(); }
  const workers = Math.min(4, Math.max(1, S.keys.length));
  let errs = await pool(todo, workers, genImage, () => { done++; upd(); saveP(); });
  if (errs.length) { log(`🔁 ${errs.length} images dobara try...`); errs = await pool(errs, 1, genImage, () => { }); }
  await saveP(true);
  if (errs.length) { step('images', 'err', `${errs.length} fail`); throw new Fatal(`Scenes ${errs.map(x => x + 1).slice(0, 20).join(', ')} ki image nahi bani. Storyboard me 🔄 ya 📤 karo, phir ▶ Resume.`); }
  step('images', 'done', `${tot}/${tot}`);
}
function promptsText(acc, of) {
  const P = S.P; const miss = P.scenes.map((s, i) => i).filter(i => !P.scenes[i].img); const per = Math.ceil(miss.length / of); const mine = miss.slice(acc * per, (acc + 1) * per);
  return { ids: mine, text: `Account ${acc + 1}/${of} — ${mine.length} images. Har image ${P.aspect} me banao, reference stickman image attach karo. Model: Nano Banana 2.1.\n\n` + mine.map(i => `#${i + 1}\n${fullPrompt(i, true)}`).join('\n\n----------\n\n') };
}
function imgType(d) { if (d[0] === 0x89 && d[1] === 0x50) return 'image/png'; if (d[0] === 0xFF && d[1] === 0xD8) return 'image/jpeg'; if (d[0] === 0x52 && d[1] === 0x49 && d[8] === 0x57 && d[9] === 0x45) return 'image/webp'; return ''; }
async function unzipImages(file) {
  const b = new Uint8Array(await file.arrayBuffer()); if (!(b[0] === 0x50 && b[1] === 0x4B)) throw new Error('ye ZIP file nahi lag rahi');
  const all = unzipSync(b); const out = []; let k = 0;
  for (const [name, data] of Object.entries(all)) {
    if (name.endsWith('/') || name.includes('__MACOSX') || !data.length) continue; const base = name.split('/').pop(); if (base.startsWith('.')) continue;
    if (/\.zip$/i.test(base)) { try { out.push(...await unzipImages(new File([data], base))); } catch (e) { } continue; }
    const t = imgType(data); if (!t) continue; out.push(new File([data], base, { type: t, lastModified: k++ }));
  }
  if (!out.length) throw new Error('ZIP me koi PNG/JPG/WEBP image nahi mili');
  return out;
}
async function importImages(files) {
  const P = S.P; if (!P?.scenes?.length) return alert('Pehle storyboard banao');
  let all = []; for (const f of files) { if (/\.zip$/i.test(f.name) || /zip/.test(f.type) || (f.size > 4 && (await f.slice(0, 2).text()) === 'PK')) { try { const z = await unzipImages(f); log(`🗜️ ${f.name}: ${z.length} images mili`); all.push(...z); } catch (e) { log('❌ ZIP ' + f.name + ': ' + e.message); alert('ZIP nahi khuli: ' + e.message); } } else all.push(f); }
  const N = P.scenes.length; const sn = f => { const b = f.name.replace(/\.[a-z0-9]+$/i, ''); let m = b.match(/scene[_\s-]*(\d+)/i) || b.match(/^(\d{1,4})(?!\d)/) || b.match(/(?:^|[^a-z0-9])(\d{1,4})(?:[^a-z0-9]|$)/i); const v = m ? +m[1] : NaN; return v >= 1 && v <= N ? v : NaN; };
  files = all.map(f => ({ f, n: sn(f) })).sort((a, b) => { const x = isNaN(a.n), y = isNaN(b.n); if (x !== y) return x ? 1 : -1; if (!x && a.n !== b.n) return a.n - b.n; return (a.f.lastModified - b.f.lastModified) || a.f.name.localeCompare(b.f.name, undefined, { numeric: true }); });
  const used = new Set(files.filter(x => !isNaN(x.n)).map(x => x.n - 1)); let k = 0; const miss = P.scenes.map((s, i) => i).filter(i => !used.has(i) && !P.scenes[i].img); const map = [];
  for (const { f, n } of files) { const i = !isNaN(n) ? n - 1 : miss[k++]; if (i == null || !P.scenes[i]) { log('↷ ' + f.name + ' chhod di (extra)'); continue; } try { await storeSceneImage(i, f); map.push(`#${i + 1}←${f.name}`); } catch (e) { log('❌ import ' + f.name + ': ' + e.message); } }
  log('🧩 ' + map.join(', '));
  files = map;
  await saveP(true); const left = P.scenes.filter(s => !s.img).length; log(`📥 ${files.length} images import hui. Baaki: ${left}`); renderBoard(); $('importHint').textContent = left ? `${left} scenes ki image baaki` : '✅ Saari images aa gayi — ▶ Resume ya 🎞️ Render dabao';
  alert(files.length ? `✅ ${files.length} images lag gayi. Baaki scenes: ${left}` : '❌ Koi image nahi mili');
}

/* ================= render ================= */
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function dims() { const k = S.P.res === '4k' ? 2 : 1; return S.P.aspect === '16:9' ? [1920 * k, 1080 * k] : [1080 * k, 1920 * k]; }
function invalidate(t0, t1, finalOnly) { const P = S.P; if (!P) return; P.finalDone = 0; if (finalOnly || !P.parts) return; const L = P.partLen || 300; for (const k of Object.keys(P.parts)) { const a = k * L, b = a + L; if (b >= t0 && a <= t1) delete P.parts[k]; } }
const bmCache = new Map();
async function bitmap(i, W, H) {
  if (bmCache.has(i)) return bmCache.get(i);
  const blob = await get('img:' + i); let bm;
  if (blob) { const src = await createImageBitmap(blob); const crop = S.P.cropLogo ? [src.width * 0.03, src.height * 0.03, src.width * 0.88, src.height * 0.88] : [0, 0, src.width, src.height];
    const sc = Math.max(W / crop[2], H / crop[3]) * 1.2; const c = new OffscreenCanvas(Math.round(crop[2] * sc), Math.round(crop[3] * sc)); const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, ...crop, 0, 0, c.width, c.height); src.close(); bm = c.transferToImageBitmap(); }
  else { const c = new OffscreenCanvas(W, H); const x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, W, H); bm = c.transferToImageBitmap(); }
  bmCache.set(i, bm); for (const k of [...bmCache.keys()]) if (k < i - 1 || k > i + 2) { bmCache.get(k).close(); bmCache.delete(k); }
  return bm;
}
function drawKB(ctx, bm, i, lt, dur, W, H, alpha = 1, extraZ = 1, ox = 0, oy = 0) {
  const p = Math.max(0, Math.min(1, lt / dur)), zin = i % 2 === 0; const z = (zin ? 1.04 + 0.10 * p : 1.14 - 0.10 * p) * extraZ;
  const base = Math.max(W / bm.width, H / bm.height) * z, dw = bm.width * base, dh = bm.height * base;
  const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][i % 4], room = [(dw - W) / 2, (dh - H) / 2];
  const px = dir[0] * room[0] * 0.6 * (p - 0.5) * 2, py = dir[1] * room[1] * 0.6 * (p - 0.5) * 2;
  ctx.globalAlpha = alpha; ctx.drawImage(bm, (W - dw) / 2 + px + ox, (H - dh) / 2 + py + oy, dw, dh); ctx.globalAlpha = 1;
}
const TR = 0.5;
async function drawFrame(ctx, t, W, H, hint) {
  const sc = S.P.scenes; let i = hint.i || 0; while (i < sc.length - 1 && t >= sc[i].end) i++; while (i > 0 && t < sc[i].start) i--; hint.i = i;
  const s = sc[i], A = await bitmap(i, W, H), dur = s.end - s.start + TR, tIn = t - s.start + (i > 0 ? TR : 0), nextT = s.end - t;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (i < sc.length - 1 && nextT < TR) {
    const B = await bitmap(i + 1, W, H), n = sc[i + 1], nd = n.end - n.start + TR, p = ease(1 - nextT / TR), bl = TR - nextT;
    switch (s.trans) {
      case 'slide': drawKB(ctx, A, i, tIn, dur, W, H, 1, 1, -p * W, 0); drawKB(ctx, B, i + 1, bl, nd, W, H, 1, 1, (1 - p) * W, 0); break;
      case 'push': drawKB(ctx, A, i, tIn, dur, W, H, 1, 1, 0, -p * H); drawKB(ctx, B, i + 1, bl, nd, W, H, 1, 1, 0, (1 - p) * H); break;
      case 'zoom': drawKB(ctx, B, i + 1, bl, nd, W, H); drawKB(ctx, A, i, tIn, dur, W, H, 1 - p, 1 + p * 0.6); break;
      case 'circle': drawKB(ctx, A, i, tIn, dur, W, H); ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, p * Math.hypot(W, H) / 2, 0, 7); ctx.clip(); drawKB(ctx, B, i + 1, bl, nd, W, H); ctx.restore(); break;
      default: drawKB(ctx, A, i, tIn, dur, W, H); drawKB(ctx, B, i + 1, bl, nd, W, H, p);
    }
  } else drawKB(ctx, A, i, tIn, dur, W, H);
}
async function opfs() { return navigator.storage.getDirectory(); }
async function fileExists(name) { try { await (await opfs()).getFileHandle(name); return true; } catch (e) { return false; } }
async function renderPhase() {
  const P = S.P; if (P.scenes.some(s => !s.img)) throw new Fatal('Kuch scenes ki image baaki hai.');
  if (!window.VideoEncoder) throw new Fatal('Is browser me video encoder nahi hai. Android par latest Chrome use karo.');
  try { await navigator.storage.persist(); } catch (e) { }
  let [W, H] = dims(); const fps = +segVal('fpsSeg') || 24; P.fps = fps;
  let br = W * H > 3e6 ? 12e6 : 6e6;
  if (!(await MB.canEncodeVideo('avc', { width: W, height: H, bitrate: br }))) { if (W * H > 3e6) { log('⚠️ Is phone par 4K encoder nahi mila — 1080p me bana rahe hain'); W /= 2; H /= 2; br = 6e6; P.res = '1080'; } if (!(await MB.canEncodeVideo('avc', { width: W, height: H, bitrate: br }))) throw new Fatal('H.264 encoder nahi mila'); }
  P.W = W; P.H = H; P.partLen ||= 300; P.parts ||= {};
  const L = P.partLen, total = P.total, nParts = Math.ceil(total / L);
  try { const est = await navigator.storage.estimate(); const need = br / 8 * total * 2.1; if (est.quota && est.quota - est.usage < need) log(`⚠️ Jagah kam lag rahi hai: ~${(need / 1e9).toFixed(1)} GB chahiye`); } catch (e) { }
  const cv = new OffscreenCanvas(W, H), ctx = cv.getContext('2d', { alpha: false }); ctx.imageSmoothingQuality = 'high';
  const prev = $('cv'), pctx = prev.getContext('2d'); prev.width = P.aspect === '16:9' ? 640 : 360; prev.height = P.aspect === '16:9' ? 360 : 640;
  showTab('export'); await keepAwake(true); const t0 = performance.now(); let framesDone = 0;
  const totalFrames = Math.round(total * fps); const doneFrames = () => Object.keys(P.parts).reduce((s, k) => s + (Math.round(Math.min(total, (+k + 1) * L) * fps) - Math.round(k * L * fps)), 0);
  log(`🎞️ Render: ${W}x${H}, ${fps}fps, ${fmt(total)}, ${nParts} parts`);
  for (let p = 0; p < nParts; p++) {
    if (P.parts[p] && await fileExists(`part_${p}.mp4`)) continue; chk();
    const f0 = Math.round(p * L * fps), f1 = Math.round(Math.min(total, (p + 1) * L) * fps);
    const fh = await (await opfs()).getFileHandle(`part_${p}.mp4`, { create: true }); const wr = await fh.createWritable();
    const out = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.StreamTarget(wr, { chunked: true }) });
    const src = new MB.CanvasSource(cv, { codec: 'avc', bitrate: br, bitrateMode: 'variable', keyFrameInterval: 2, latencyMode: 'quality' });
    out.addVideoTrack(src, { frameRate: fps }); await out.start(); const hint = {};
    try {
      for (let f = f0; f < f1; f++) {
        if (S.stop) { await out.cancel(); throw new Stop('Paused'); }
        await drawFrame(ctx, f / fps, W, H, hint); await src.add((f - f0) / fps, 1 / fps); framesDone++;
        if (f % 12 === 0) { pctx.drawImage(cv, 0, 0, prev.width, prev.height); const all = (doneFrames() + (f - f0)) / totalFrames, el = (performance.now() - t0) / 1000, rate = framesDone / el, eta = (totalFrames - doneFrames() - (f - f0)) / Math.max(rate, 0.1); step('render', 'run', `${Math.floor(all * 100)}% • ${rate.toFixed(0)} fps • ~${fmt(eta)} baaki`, all); await sleep(0); }
      }
      await out.finalize();
    } catch (e) { try { await wr.close(); } catch (x) { } throw e; }
    P.parts[p] = 1; P.finalDone = 0; await saveP(true); log(`✅ Part ${p + 1}/${nParts} ready`);
  }
  step('render', 'done', `${nParts} parts`); bmCache.forEach(b => b.close()); bmCache.clear();
}
function isQuotaErr(e) { return e && (e.name === 'QuotaExceededError' || /quota|storage|space/i.test(e.message || '')); }
async function finalPhase(diskHandle) {
  try { return await finalPhaseInner(diskHandle); }
  catch (e) {
    if (e instanceof Stop || !isQuotaErr(e)) throw e;
    try { await (await opfs()).removeEntry('final.mp4'); } catch (x) { }
    step('final', 'err', 'jagah khatam');
    $('dlBox').innerHTML = window.showSaveFilePicker ? '<button id="btnFinalDisk2">💾 Final video seedha PC me save karo (app storage nahi lagegi)</button>' : '<div class="hint">Phone me jagah khaali karo (purani videos/apps hatao), phir ▶ Resume dabao — render dobara nahi hoga, sirf final jodna hoga.</div>';
    const b = $('btnFinalDisk2'); if (b) b.onclick = finalToDisk; showTab('export');
    throw new Fatal('Browser ki storage bhar gayi (final video jodte waqt). ' + (window.showSaveFilePicker ? 'Export tab me 💾 button dabao — video seedha PC folder me save hogi.' : 'Phone me 2-3 GB jagah khaali karke ▶ Resume dabao.'));
  }
}
async function finalToDisk() {
  if (!S.P) return; if (!window.showSaveFilePicker) return alert('Ye option sirf PC Chrome/Edge me hai');
  if (!Object.keys(S.P.parts || {}).length) return alert('Pehle 🎞️ Render chalao');
  const name = `${(S.P.sheet?.title || 'stickman_video').replace(/[^\w\u0900-\u097F]+/g, '_').slice(0, 40)}.mp4`;
  let h; try { h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] }); } catch (e) { return; }
  guard(async () => { try { await (await opfs()).removeEntry('final.mp4'); } catch (x) { } S.P.finalDone = 0; await finalPhase(h); });
}
async function finalPhaseInner(diskHandle) {
  const P = S.P; if (!diskHandle && P.finalDone && await fileExists('final.mp4')) return showFinal();
  step('final', 'run', 'voice jod rahe hain', 0); const total = P.total, L = P.partLen, nParts = Math.ceil(total / L);
  const acodec = (await MB.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, bitrate: 192000 })) ? 'aac' : 'opus';
  const root = await opfs(); if (!diskHandle) { try { await root.removeEntry('final.mp4'); } catch (x) { } }
  const wr = diskHandle ? await diskHandle.createWritable() : await (await root.getFileHandle('final.mp4', { create: true })).createWritable();
  const out = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.StreamTarget(wr, { chunked: true }) });
  const vsrc = new MB.EncodedVideoPacketSource('avc'); const asrc = new MB.AudioBufferSource({ codec: acodec, bitrate: 192000 });
  out.addVideoTrack(vsrc, { frameRate: P.fps }); out.addAudioTrack(asrc); await out.start();
  // audio feeder: scene clips → enhance → 48k stereo AudioBuffers
  let rms = 0, cnt = 0; for (let i = 0; i < P.scenes.length; i += Math.max(1, Math.floor(P.scenes.length / 60))) { const a = await get('aud:' + i); if (a) { rms += rmsOf(a); cnt++; } }
  const fx = P.enh ? new VoiceFX(SR, Math.min(6, Math.max(0.5, 0.12 / (rms / Math.max(1, cnt) || 0.1)))) : null;
  let ai = 0, aT = 0, carry = 0; const BL = 48000;
  const feedTo = async (T) => {
    while (aT < T && ai < P.scenes.length) {
      const pcm = (await get('aud:' + ai)) || new Int16Array(Math.round((P.scenes[ai].dur || 1) * SR)); ai++;
      const f = new Float32Array(pcm.length); for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 32768; if (fx) fx.process(f);
      const n = Math.floor(f.length * 2); const up = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / 2, a = Math.floor(x), fr = x - a; up[i] = (f[a] || 0) * (1 - fr) + (f[a + 1] ?? f[a] ?? 0) * fr; }
      for (let o = 0; o < up.length; o += BL) { const seg = up.subarray(o, Math.min(up.length, o + BL)); const ab = new AudioBuffer({ length: seg.length, numberOfChannels: 2, sampleRate: 48000 }); ab.copyToChannel(seg, 0); ab.copyToChannel(seg, 1); await asrc.add(ab); }
      aT += up.length / 48000;
    }
  };
  let first = true;
  for (let p = 0; p < nParts; p++) {
    chk(); const file = await (await root.getFileHandle(`part_${p}.mp4`)).getFile();
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS }); const vt = await input.getPrimaryVideoTrack();
    const cfg = await vt.getDecoderConfig(); const sink = new MB.EncodedPacketSink(vt); const off = p * L;
    for await (const pk of sink.packets()) { const T = off + pk.timestamp; await feedTo(T + 0.5); await vsrc.add(pk.clone({ timestamp: T }), first ? { decoderConfig: cfg } : undefined); first = false; }
    step('final', 'run', `${p + 1}/${nParts}`, (p + 1) / nParts * 0.95);
  }
  await feedTo(Infinity); await out.finalize();
  if (diskHandle) { step('final', 'done', 'PC me save'); setProgress(100, '✅ Video PC me save ho gayi!'); log('✅ Final video aapke chune folder me save ho gayi: ' + diskHandle.name); $('dlBox').innerHTML = `<div class="hint">✅ ${esc(diskHandle.name)} save ho gayi. File Explorer me dekho.</div>`; showTab('export'); return; }
  P.finalDone = 1; await saveP(true); step('final', 'done', 'ready'); showFinal();
}
async function showFinal() {
  const P = S.P; const file = await (await (await opfs()).getFileHandle('final.mp4')).getFile();
  const url = URL.createObjectURL(file); $('outVid').src = url; $('outVid').style.display = 'block';
  const name = `${(P.sheet?.title || 'stickman_video').replace(/[^\w\u0900-\u097F]+/g, '_').slice(0, 40)}_${P.W}x${P.H}.mp4`;
  $('dlBox').innerHTML = `<a class="dl" href="${url}" download="${name}">⬇️ Video download (${(file.size / 1e9 >= 1 ? (file.size / 1e9).toFixed(2) + ' GB' : (file.size / 1e6).toFixed(0) + ' MB')})</a>`;
  $('expInfo').textContent = `Ready: ${P.W}x${P.H}, ${fmt(P.total)}, ${P.scenes.length} scenes`;
  setProgress(100, '✅ Video ready!'); log('✅ Final video ready: ' + name); showTab('export');
}

/* ================= pipeline ================= */
async function newProjectFromUI() {
  readKeys(); saveSettings();
  const mode = segVal('modeSeg'), lang = st('lang'), preset = st('preset');
  const refs = S.refs.length ? S.refs : (await get('refs')) || []; if (!refs.length) throw new Fatal('Create tab me stickman reference image do.');
  let minS = Math.max(2, +st('minSec') || 6), maxS = Math.min(8, Math.max(minS + 0.5, +st('maxSec') || 8)); if (minS > maxS - 0.5) minS = maxS - 1;
  const P = { v: 2, mode, lang, preset, notes: st('notes'), aspect: segVal('aspSeg'), res: segVal('resSeg'), imgSrc: segVal('imgSrcSeg'), cropLogo: st('cropLogo'), enh: st('enh'), minSec: minS, maxSec: maxS, scenes: [], steps: {}, created: Date.now() };
  if (mode === 'tts') { const sc = st('script').trim(); if (sc.split(/\s+/).length < 5) throw new Fatal('Script daalo (Create tab).'); await put('script', sc); }
  else { const f = S.voiceFile || await get('voiceFile'); if (!f) throw new Fatal('Voice file upload karo (Create tab).'); if (S.voiceFile) await put('voiceFile', S.voiceFile); }
  // fresh project: clear old scene data but keep inputs
  const keep = { refs, bg: await get('bgref'), script: await get('script'), vf: await get('voiceFile') };
  await clearAll(); await put('refs', keep.refs); if (keep.bg) await put('bgref', keep.bg); if (keep.script && mode === 'tts') await put('script', keep.script); if (keep.vf && mode === 'upload') await put('voiceFile', keep.vf);
  S.P = P; await saveP(true); projInfo(); return P;
}
async function pipeline() {
  const P = S.P; renderSteps(); showTab('flow');
  readKeys(); if (!S.keys.length) throw new Fatal('Setup tab me API key daalo.'); step('keys', 'done', `${S.keys.length} keys`);
  if (P.mode === 'tts') {
    if (!P.scenes.length) { step('plan', 'run', 'script tod rahe hain', 0.02); const sc = await get('script'); P.scenes = splitScript(sc, P.lang, P.minSec, P.maxSec).map(t => ({ text: t, prompt: '', dur: 0 })); log(`✂️ ${P.scenes.length} scenes (har ek ~${P.minSec}-${P.maxSec} sec)`); await saveP(true); }
    if (!P.sheet) { step('plan', 'run', 'story samajh rahe hain', 0.1); await sheetPhase(await get('script')); await saveP(true); }
    if (P.scenes.some(s => !(s.prompt || '').trim())) { await promptsPhase(); }
    step('plan', 'done', `${P.scenes.length} scenes`); renderCast();
    await voicePhase();
  } else {
    await decodePhase(); await transcribePhase();
    step('plan', 'run', 'scenes bana rahe hain', 0); await buildUploadScenes();
    if (!P.sheet) await sheetPhase(P.scenes.map(s => s.text).join(' ')); await saveP(true);
    if (P.scenes.some(s => !(s.prompt || '').trim())) await promptsPhase(); step('plan', 'done', `${P.scenes.length} scenes`);
  }
  renderBoard(); updateImgCost();
  await imagesPhase();
  await renderPhase();
  await finalPhase();
}
async function guard(fn) {
  if (S.busy) { alert('Ek kaam already chal raha hai — Workflow tab dekho.'); return; }
  S.busy = true; S.stop = false; await keepAwake(true);
  try { await fn(); }
  catch (e) {
    if (e instanceof Stop) { log('⏸ Ruk gaya. ▶ Resume se wahi se shuru hoga.'); setProgress(+$('ppct').textContent.replace('%', ''), '⏸ Paused'); }
    else { console.error(e); log('❌ ' + e.message); const run = Object.entries(S.P?.steps || {}).find(([k, v]) => v.st === 'run'); if (run) step(run[0], 'err', run[1].sub); if (!(e instanceof Fatal)) log('ℹ️ ▶ Resume dabao — jahan ruka tha wahi se chalega.'); alert(e.message); }
  } finally { S.busy = false; await saveP(true); keepAwake(false); projInfo(); }
}
function projInfo() { const P = S.P; $('projInfo').textContent = P ? `${P.scenes.length} scenes • ${fmt(P.total)}` : ''; $('projStatus').textContent = P ? `Project: ${P.sheet?.title || '(naya)'} — ${P.mode === 'tts' ? 'AI voice' : 'meri voice'}, ${P.aspect}, ${P.res}, ${P.scenes.length} scenes, ${fmt(P.total)}. Images: ${P.scenes.filter(s => s.img).length}/${P.scenes.length}` : 'Koi project nahi.'; }
function updateImgCost() { const P = S.P; const n = P ? P.scenes.filter(s => !s.img).length : 0; const w = st('script').trim().split(/\s+/).length; const mid = ((+st('minSec') || 6) + (+st('maxSec') || 8)) / 2; const est = n || Math.ceil(w / (LANGS[st('lang')].wps * mid)); $('imgCost').textContent = w > 3 || n ? `Andaazan ${est} images banengi.` : ''; $('scriptInfo').textContent = w > 3 ? `${w} words • ~${fmt(w / LANGS[st('lang')].wps)} ki video` : ''; }

/* ================= storyboard UI ================= */
const PER = 20; const thumbUrls = [];
async function renderBoard() {
  const P = S.P, box = $('scenes'); thumbUrls.splice(0).forEach(u => URL.revokeObjectURL(u));
  if (!P?.scenes?.length) { box.innerHTML = '<div class="hint" style="padding:12px 0">Abhi koi storyboard nahi. Create tab se 🚀 dabao.</div>'; $('pagerTop').innerHTML = $('pagerBot').innerHTML = ''; return; }
  document.body.classList.toggle('v916', P.aspect === '9:16');
  const pages = Math.ceil(P.scenes.length / PER); S.page = Math.min(S.page, pages - 1);
  const pager = `<button class="sec" data-pg="-1">◀</button><select id="pgSel">${[...Array(pages)].map((_, i) => `<option value="${i}" ${i === S.page ? 'selected' : ''}>${i * PER + 1}-${Math.min(P.scenes.length, (i + 1) * PER)}</option>`).join('')}</select><button class="sec" data-pg="1">▶</button>`;
  $('pagerTop').innerHTML = pager; $('pagerBot').innerHTML = pager.replace('id="pgSel"', '');
  $$('.pager button').forEach(b => b.onclick = () => { S.page = Math.max(0, Math.min(pages - 1, S.page + +b.dataset.pg)); renderBoard(); });
  $$('.pager select').forEach(s => s.onchange = () => { S.page = +s.value; renderBoard(); });
  const a = S.page * PER, b = Math.min(P.scenes.length, a + PER); let h = '';
  for (let i = a; i < b; i++) { const s = P.scenes[i];
    h += `<div class="scene" id="sc${i}"><div><div class="pic" id="pic${i}">Scene ${i + 1}</div><div class="hint">#${i + 1} • ${fmt(s.start)}–${fmt(s.end)}</div>${s.start < 60 ? '<span class="tag hook">HOOK</span>' : ''}${s.loc ? `<span class="tag">${esc(s.loc)}</span>` : ''}${s.lines?.some(l => l.spk !== 'Narrator') ? '<span class="tag">🎭 dialogue</span>' : ''}</div>
    <div><textarea data-f="text" data-i="${i}">${esc(s.text)}</textarea><textarea data-f="prompt" data-i="${i}" style="margin-top:6px" placeholder="image prompt">${esc(s.prompt)}</textarea>
    <div class="btns"><button class="sec" data-a="play" data-i="${i}">▶</button><button class="${s.audStale ? 'warn' : 'sec'}" data-a="revoice" data-i="${i}">🎙️${s.audStale ? ' update' : ''}</button><button class="sec" data-a="upaud" data-i="${i}">🎵</button><button class="sec" data-a="regen" data-i="${i}">🔄</button><button class="sec" data-a="upimg" data-i="${i}">📤</button><button class="sec" data-a="copy" data-i="${i}">📋</button>
    <select data-f="trans" data-i="${i}">${TRANS.map(t => `<option ${t === s.trans ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div></div>`; }
  box.innerHTML = h;
  for (let i = a; i < b; i++) if (P.scenes[i].img) updateCard(i);
  box.querySelectorAll('[data-f]').forEach(el => el.onchange = () => { const s = P.scenes[+el.dataset.i]; const f = el.dataset.f; s[f] = el.value; if (f === 'text') { s.audStale = P.mode === 'tts' ? 1 : s.audStale; s.lines = null; } if (f === 'trans') invalidate(s.end - 1, s.end + 1); saveP(true); if (f === 'text') renderBoard(); });
  box.querySelectorAll('[data-a]').forEach(el => el.onclick = () => sceneAction(el.dataset.a, +el.dataset.i, el));
}
async function updateCard(i) { const el = $('pic' + i); if (!el) return; const t = await get('thumb:' + i); if (!t) return; const u = URL.createObjectURL(t); thumbUrls.push(u); el.outerHTML = `<img class="pic" id="pic${i}" src="${u}">`; }
function pick(accept, multiple) { return new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = !!multiple; inp.onchange = () => res(inp.files); inp.click(); }); }
async function sceneAction(a, i, btn) {
  const P = S.P, s = P.scenes[i];
  try {
    if (a === 'play') { const pcm = await get('aud:' + i); if (!pcm) return alert('Is scene ki voice abhi nahi bani'); playPcm(pcm, P.enh); }
    if (a === 'copy') { await navigator.clipboard.writeText(fullPrompt(i, true)); btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋', 1200); }
    if (a === 'upimg') { const f = (await pick('image/*'))[0]; if (f) { await storeSceneImage(i, f); await saveP(true); log(`Scene ${i + 1}: apni image lagi`); } }
    if (a === 'regen') { if (S.busy) return alert('Pehle chalta kaam rukne do'); await guard(async () => { step('images', 'run', `scene ${i + 1}`); await genImage(i); await saveP(true); step('images', P.scenes.every(x => x.img) ? 'done' : 'run'); }); }
    if (a === 'revoice') { if (S.busy) return alert('Pehle chalta kaam rukne do'); await guard(async () => { btn.textContent = '⏳'; await voiceScene(i); await saveP(true); log(`🎙️ Scene ${i + 1} ki voice nayi bani (${s.dur.toFixed(1)}s)`); renderBoard(); }); }
    if (a === 'upaud') { const f = (await pick('audio/*'))[0]; if (!f) return; const pcm = await decodeSmall(f); await put('aud:' + i, pcm); s.dur = pcm.length / SR; s.aud = 1; s.audStale = 0; retime(i); await saveP(true); log(`🎵 Scene ${i + 1}: apni audio lagi (${s.dur.toFixed(1)}s)`); renderBoard(); }
  } catch (e) { alert(e.message); }
}

/* ================= wire up ================= */
loadSettings();
seg('aspSeg', 'aspect'); seg('resSeg', 'res'); seg('fpsSeg', 'fps'); seg('imgSizeSeg', 'imgSize');
seg('imgSrcSeg', 'imgSrc', v => { $('imgSrcHint').textContent = v === 'import' ? 'Free mode: app har scene ka prompt degi. Gemini app / Flow me reference image ke saath images banao, phir Storyboard me 📥 se ek saath import karo.' : 'API mode: images Nano Banana se khud banengi — key par billing ON honi chahiye (free tier me image nahi banti).'; });
seg('modeSeg', 'mode', v => { $('modeTts').style.display = v === 'tts' ? '' : 'none'; $('modeUpload').style.display = v === 'upload' ? '' : 'none'; if (!S.P) renderSteps(); });
$('modeTts').style.display = segVal('modeSeg') === 'tts' ? '' : 'none'; $('modeUpload').style.display = segVal('modeSeg') === 'upload' ? '' : 'none';
$('imgSrcSeg').querySelector('button.on')?.click();
if (!localStorage.getItem('ss_imgModel')) st('imgModel', 'gemini-nano-banana-2.1');
$('preset').onchange = () => { const p = PRESETS[st('preset')]; st('minSec', p.min); st('maxSec', p.max); st('vStyle', p.voice); saveSettings(); updateImgCost(); };
if (!localStorage.getItem('ss_vStyle')) st('vStyle', PRESETS[st('preset')].voice);
$('lang').onchange = () => { saveSettings(); onLang(); updateImgCost(); }; onLang();
$('voiceSel').onchange = () => localStorage.setItem('ss_voiceSel', st('voiceSel'));
$('btnCopyLog').onclick = async () => { const t = $('log').textContent.slice(-6000); try { await navigator.clipboard.writeText(t); alert('Log copy ho gaya — chat me paste kar do'); } catch (e) { prompt('Ye text copy karo:', t.slice(-1500)); } };
$('btnKeys').onclick = testKeys; $('btnKeys2').onclick = testKeys; $('btnTest').onclick = voiceTest; $('btnLib').onclick = loadLibrary; $('btnMine').onclick = loadMine; $('btnClone').onclick = makeClone;
$('recSrc').onclick = e => record(e.target, 'cloneSrcB'); $('recCon').onclick = e => record(e.target, 'cloneConB');
$('cloneSrc').onchange = async e => { const f = e.target.files[0]; if (!f) return; S.cloneSrcB = f; S.cloneSrcBPcm = await decodeSmall(f); $('srcInfo').textContent = `${(S.cloneSrcBPcm.length / SR).toFixed(1)} sec`; };
$('cloneCon').onchange = async e => { const f = e.target.files[0]; if (!f) return; S.cloneConB = f; S.cloneConBPcm = await decodeSmall(f); $('conInfo').textContent = `${(S.cloneConBPcm.length / SR).toFixed(1)} sec`; };
$('refIn').onchange = async e => { const fs = [...e.target.files].slice(0, 3); $('refThumbs').innerHTML = ''; S.refs = []; for (const f of fs) { S.refs.push(await shrink(f, 1024, 0.9)); const im = document.createElement('img'); im.src = URL.createObjectURL(f); $('refThumbs').appendChild(im); } await put('refs', S.refs); log(`${S.refs.length} reference image add hui`); };
$('bgIn').onchange = async e => { const f = e.target.files[0]; $('bgThumbs').innerHTML = ''; if (!f) { await del('bgref'); return; } await put('bgref', await shrink(f, 1024, 0.9)); const im = document.createElement('img'); im.src = URL.createObjectURL(f); $('bgThumbs').appendChild(im); };
$('scriptIn').onchange = async e => { const f = e.target.files[0]; if (f) { st('script', await f.text()); updateImgCost(); log('Script upload hui: ' + f.name); } };
document.addEventListener('input', e => { if (/^k\d$|^kVoice$/.test(e.target.id)) { readKeys(); saveSettings(); const i = e.target.id === 'kVoice' ? 'paid' : +e.target.id[1]; delete S.kst[i]; const el = $('ks' + (i === 'paid' ? 'V' : i)); if (el) el.textContent = ''; renderKeyStat(); } });
$('script').addEventListener('input', () => { clearTimeout(S.sT); S.sT = setTimeout(() => { updateImgCost(); put('scriptDraft', st('script')); }, 600); });
$('voiceIn').onchange = e => { const f = e.target.files[0]; S.voiceFile = f || null; if (f) $('voiceInfo').textContent = `Voice: ${f.name} (${(f.size / 1e6).toFixed(1)} MB)`; };
$('minSec').onchange = $('maxSec').onchange = () => { if (+st('maxSec') > 8) st('maxSec', 8); updateImgCost(); saveSettings(); };
$('btnHook').onclick = async () => { const sc = st('script').trim(); if (!sc) return alert('Pehle script daalo'); readKeys(); const b = $('btnHook'); b.disabled = true; b.textContent = '⏳ Hook ban raha hai...';
  try { const words = sc.split(/\s+/); const head = words.slice(0, 260).join(' '), rest = words.slice(260).join(' '); const pre = PRESETS[st('preset')];
    const j = await withKeys('Hook', key => gen(st('mText').trim(), key, { contents: [{ parts: [{ text: `You are a top YouTube scriptwriter for faceless stickman storytelling channels. Rewrite ONLY this opening of a narration script in ${LANGS[st('lang')].name} so the first 60 seconds are an irresistible HOOK (curiosity, stakes, a shocking or relatable moment, an open loop). Style: ${pre.story} Keep the same facts and flow so it connects smoothly to the rest. Short spoken sentences. Return ONLY the rewritten opening text.\n\nOPENING:\n${head}\n\nTHE SCRIPT CONTINUES WITH:\n${rest.slice(0, 1500)}` }] }], generationConfig: { temperature: 0.9 } }));
    const nh = textOf(j).trim(); if (nh) { st('script', nh + '\n' + rest); updateImgCost(); log('✨ Hook strong ho gaya (sirf shuru ka hissa badla)'); } }
  catch (e) { alert(e.message); } finally { b.disabled = false; b.textContent = '✨ Pehle 1 min ka hook strong karo'; } };
$('btnRun').onclick = () => { if (S.P?.scenes?.length && !confirm('Naya project shuru hoga aur purana storyboard hat jayega. Continue?')) return; guard(async () => { await newProjectFromUI(); await pipeline(); }); };
$('btnResume').onclick = () => { if (!S.P) return alert('Koi project nahi — Create tab se shuru karo'); guard(pipeline); };
$('btnPause').onclick = () => { if (S.busy) { S.stop = true; log('⏸ Rok rahe hain...'); } };
$('btnMissing').onclick = () => { if (!S.P) return; guard(async () => { if (S.P.mode === 'tts') await voicePhase(); await imagesPhase(); }); };
$('btnRender').onclick = () => { if (!S.P) return; guard(async () => { if (S.P.mode === 'tts' && S.P.scenes.some(s => !s.aud || s.audStale)) await voicePhase(); await renderPhase(); await finalPhase(); }); };
$('btnNew').onclick = async () => { if (!confirm('Sab clear ho jayega (storyboard, images, voice, video). Pakka?')) return; await clearAll(); S.P = null; renderBoard(); renderSteps(); projInfo(); log('🗑️ Naya project'); };
$('btnCopyPrompts').onclick = async () => { if (!S.P) return; const of = +st('accCount'); const acc = +(prompt(`Kaun sa account? (1-${of})`, '1') || 0) - 1; if (acc < 0 || acc >= of) return; const bad = S.P.scenes.filter(s => !(s.prompt || '').trim() || s.prompt === s.text).length; if (bad && !confirm(`⚠️ ${bad} scenes ke AI prompt nahi bane (quota ki wajah se), isliye images kahani se match nahi karengi. Pehle ✍️ 'Scene prompts banao' dabao. Phir bhi copy karu?`)) return; const r = promptsText(acc, of); if (!r.ids.length) return alert('Is account ke liye koi image baaki nahi'); try { await navigator.clipboard.writeText(r.text); } catch (e) { prompt('Copy karo:', r.text); } alert(`Account ${acc + 1}: scenes #${r.ids[0] + 1} se #${r.ids[r.ids.length - 1] + 1} (${r.ids.length}) ke prompts copy ho gaye. Images isi order me download karo, phir 📥 se SAARI ek saath select karke upload karo.`); };
$('btnDlPrompts').onclick = () => { if (!S.P) return; const of = +st('accCount'); let t = ''; for (let a = 0; a < of; a++) t += promptsText(a, of).text + '\n\n==========================\n\n'; const u = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = 'image_prompts.txt'; l.click(); };
$('btnRePrompt').onclick = () => { const P = S.P; if (!P?.scenes?.length) return alert('Pehle storyboard banao'); readKeys(); if (!S.keys.length) return alert('Setup me API key daalo');
  guard(async () => { showTab('flow'); let n = 0; for (const s of P.scenes) if (!(s.prompt || '').trim() || s.prompt === s.text) { s.prompt = ''; n++; } if (!n) { if (!confirm('Saare scenes ke prompt bane hue hain. Sab dobara banau?')) return; P.scenes.forEach(s => s.prompt = ''); }
    if (!P.sheet) { step('plan', 'run', 'story samajh rahe hain', 0.1); await sheetPhase(P.scenes.map(s => s.text).join(' ')); }
    await promptsPhase(); step('plan', 'done', `${P.scenes.length} scenes`); await saveP(true); renderBoard(); log('✍️ Scene prompts ban gaye — ab 📋 se copy karo'); alert('✅ Prompts ban gaye. Ab 📋 se copy karke images banao.'); }); };
$('btnFinalDisk').onclick = finalToDisk;
if (!window.showSaveFilePicker) $('btnFinalDisk').style.display = 'none';
$('btnZip').onclick = async () => { const fs = await pick('.zip,application/zip,application/x-zip-compressed,application/octet-stream', true); if (fs?.length) importImages(fs); };
$('btnImport').onclick = async () => { const fs = await pick('image/*', true); if (fs?.length) importImages(fs); };
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });

(async () => { S.P = await get('proj') || null; const d = await get('scriptDraft'); if (d && !st('script')) st('script', d); const refs = await get('refs'); if (refs) { S.refs = refs; refs.forEach(r => { const im = document.createElement('img'); im.src = URL.createObjectURL(r); $('refThumbs').appendChild(im); }); }
  if (S.P) { renderSteps(); renderCast(); projInfo(); log(`📂 Pichhla project khula: ${S.P.scenes.length} scenes. ▶ Resume se aage chalao.`); if (S.P.finalDone && await fileExists('final.mp4')) showFinal(); }
  renderSteps(); updateImgCost(); })();
window.__S = S; window.__imp = importImages; window.__rb = renderBoard; // debug/testing
