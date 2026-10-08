/* Speedy List AI app logic. Real AI photo analysis (server endpoint) + copy-and-open posting to marketplaces. */
(function () {
'use strict';
const SL = window.SL;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
             set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const POSTABLE = SL.MARKETS.filter(m => m.method !== 'planned');
const byId = id => SL.MARKETS.find(m => m.id === id);
const mono = m => `<span class="mono" style="background:${m.hue}">${esc(m.mono)}</span>`;
const nmH = m => esc(m.name).replace(/([a-z])([A-Z])/g, '$1<wbr>$2');
const badge = m => `<span class="mbadge ${m.method}">${m.method === 'direct' ? 'Direct' : m.method === 'assisted' ? 'Assisted' : 'Planned'}</span>`;

/* ---------- toast ---------- */
let tt; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- theme ---------- */
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next); LS.set('sla.theme', next); localStorage.setItem('sla.theme', next);
  $$('meta[name=theme-color]').forEach(m => m.setAttribute('content', next === 'light' ? '#f6f5f2' : '#0b0c0e'));
});

/* ---------- PWA: service worker + install ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
$('#installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true; });

/* ---------- connections (localStorage) ---------- */
const CONN_KEY = 'sla.connections.v1';
let conns = LS.get(CONN_KEY, {});
Object.keys(conns).forEach(k => { if (conns[k] && conns[k].status === 'connected') { conns[k].status = 'ready'; delete conns[k].account; } }); // old saved state
const connStatus = id => (conns[id] && conns[id].status) || null; // 'connected' | 'ready' | null
function setConn(id, status, extra) {
  if (status) conns[id] = Object.assign({ status, at: Date.now() }, extra || {}); else delete conns[id];
  if (status && st.checked) st.checked.add(id);
  LS.set(CONN_KEY, conns); renderConnGrid(); renderPostChecks(); renderMkGrid();
}
const anyConn = () => POSTABLE.some(m => connStatus(m.id));

/* ---------- modal ---------- */
let modalResolve = null;
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').hidden = false; document.body.style.overflow = 'hidden';
  const f = $('#modalBox [data-autofocus]') || $('#modalBox button'); f && f.focus(); return new Promise(r => { modalResolve = r; }); }
function closeModal(val) { $('#modal').hidden = true; document.body.style.overflow = ''; const r = modalResolve; modalResolve = null; r && r(val); }
$('#modal').addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (!a) return;
  if (a.dataset.act === 'close') closeModal(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(false); });
const mhead = t => `<div class="mhead"><h3 id="modalTitle">${t}</h3><button class="mclose" data-act="close" aria-label="Close">${ICON_X}</button></div>`;

/* Add a marketplace: one-time explanation of how posting works */
async function siteSetup(m) {
  const p = openModal(`${mhead('Add ' + esc(m.name))}<div class="mbody">
    <p>How posting to ${esc(m.name)} works:</p>
    <ol class="steps3"><li>Speedy List writes the listing from your photos.</li><li>Tap <b>Copy &amp; open</b>: your title, price and description are copied and ${esc(m.name)} opens.</li><li>Paste, add your photos and tap <b>Publish</b>. That's it.</li></ol>
    ${m.method === 'direct' ? `<p class="tiny">${esc(m.name)} has an official seller API, so one-tap auto-posting is on the way.</p>` : ''}
    <p class="tiny">Use your normal ${esc(m.name)} login on their site. Speedy List never asks for your password.</p>
    <div class="mfoot"><button class="btn primary" id="gotIt" data-autofocus>Got it</button></div></div>`);
  $('#gotIt').addEventListener('click', () => closeModal(true));
  const ok = await p;
  if (ok) { setConn(m.id, 'ready'); toast(`${m.name} added`); }
  return ok;
}
function connectOne(id) { const m = byId(id); if (!m) return; if (m.method === 'direct' || m.method === 'assisted') return siteSetup(m); toast(m.name + ' is planned - not available yet'); }

/* Connect all with progress list */
async function connectAll() {
  const rows = POSTABLE.map(m => `<li data-id="${m.id}">${mono(m)}<span class="nm">${esc(m.name)}</span><span class="st">${connStatus(m.id) ? 'Already set' : 'Waiting'}</span></li>`).join('');
  const p = openModal(`${mhead('Add all marketplaces')}<div class="mbody">
    <div class="cbar"><i id="cbarFill"></i></div><ul class="clist">${rows}</ul>
    <p class="tiny" id="callNote">Adding your sites so every listing is ready to copy and post.</p>
    <div class="mfoot"><button class="btn primary" id="callDone" disabled>Adding...</button></div></div>`);
  $('#callDone').addEventListener('click', () => closeModal(true));
  let i = 0;
  for (const m of POSTABLE) {
    i++;
    const li = $(`.clist li[data-id="${m.id}"]`); const st = li && li.querySelector('.st');
    if (!li || $('#modal').hidden) break;
    li.scrollIntoView({ block: 'nearest' });
    if (!connStatus(m.id)) {
      st.innerHTML = '<span class="spinner"></span>Adding...';
      await sleep(140);
      if (st.checked) st.checked.add(m.id);
      conns[m.id] = { status: 'ready', at: Date.now() };
    }
    const s = connStatus(m.id);
    st.className = 'st ' + (s === 'connected' ? 'ok' : 'rd');
    st.innerHTML = s === 'connected' ? `<span class="check">${ICON_CHECK}</span>Connected` : `<span class="check or">${ICON_CHECK}</span>Ready`;
    const f = $('#cbarFill'); if (f) f.style.width = (i / POSTABLE.length * 100) + '%';
  }
  LS.set(CONN_KEY, conns); renderConnGrid(); renderPostChecks(); renderMkGrid();
  const b = $('#callDone'); if (b) { b.disabled = false; b.textContent = 'Done'; }
  const n = $('#callNote'); if (n) n.innerHTML = `<b>All set.</b> ${POSTABLE.filter(m => connStatus(m.id)).length} sites ready. Each listing gets a Copy &amp; open button for every site.`;
  await p;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a || a.closest('#modal')) return;
  const act = a.dataset.act;
  if (act === 'connect-all') { e.preventDefault(); hideSheet(); connectAll(); }
  if (act === 'connect') { e.preventDefault(); connectOne(a.dataset.id); }
  if (act === 'disconnect') { e.preventDefault(); const m = byId(a.dataset.id); setConn(a.dataset.id, null); toast(m.name + ' removed'); }
});

/* ---------- Connect grid ---------- */
function renderConnGrid() {
  $('#connGrid').innerHTML = POSTABLE.map(m => {
    const s = connStatus(m.id);
    const stat = s ? `<div class="stat ready"><span class="check or">${ICON_CHECK}</span> <b>Ready</b> - we copy your listing and open the site, you paste and tap Publish.</div>`
      : `<div class="stat">${m.method === 'direct' ? 'Copy &amp; open today. One-tap auto-posting coming.' : 'No login needed here. We copy, you paste and tap Publish.'}</div>`;
    const btn = s ? `<button class="btn ${s === 'connected' ? 'ok' : 'ready'} sm" data-act="connect" data-id="${m.id}">${ICON_CHECK.replace('<svg', '<svg width="16" height="16"')} Ready</button><button class="linkbtn" data-act="disconnect" data-id="${m.id}">Remove</button>`
      : `<button class="btn primary sm" data-act="connect" data-id="${m.id}">Add</button>`;
    return `<div class="ccard ${s === 'connected' ? 'on' : s === 'ready' ? 'ready' : ''}"><div class="ccard-top">${mono(m)}<h3>${nmH(m)}</h3>${badge(m)}</div>${stat}<div class="row">${btn}</div></div>`;
  }).join('');
  const n = POSTABLE.filter(m => connStatus(m.id)).length;
  $('#connSummary').textContent = `${n} of ${POSTABLE.length} set up`;
}

/* ---------- Where we list grid ---------- */
let mkFilter = 'all';
function renderMkGrid() {
  $('#mkGrid').innerHTML = SL.MARKETS.filter(m => mkFilter === 'all' || m.method === mkFilter).map(m => {
    const host = m.src.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return `<article class="mk ${m.method}"><div class="mk-top">${mono(m)}<div><h3>${nmH(m)}</h3><span class="region">${esc(m.region)}</span></div>${badge(m)}</div>
      <p>${esc(m.good)}</p><p class="api">${esc(m.how)}</p><a class="src" href="${esc(m.src)}" target="_blank" rel="noopener">Source: ${esc(host)}</a></article>`;
  }).join('');
}
$$('.filter .chip').forEach(c => c.addEventListener('click', () => { $$('.filter .chip').forEach(x => x.classList.toggle('on', x === c)); mkFilter = c.dataset.filter; renderMkGrid(); }));
$$('.hero-stats b')[1].textContent = POSTABLE.length;
$('#mkMoreBtn').textContent = `Show all ${SL.MARKETS.length} marketplaces`;
$('#mkMoreBtn').addEventListener('click', () => { $('#mkGrid').classList.remove('collapsed'); $('#mkMore').remove(); });

/* ---------- Listing flow ---------- */
/* Photo rule (same as the Local Liquidators app): 4 required angles + data plate + brand logo, max 7 per item.
   Plate and logo are required too unless the seller ticks "No plate" / "No logo". */
const SHOTS = [
  { k: 'front', n: 'Front', h: 'Straight on, whole unit in frame', req: true, role: 'front' },
  { k: 'side', n: 'Side / angle', h: 'Step left or right, full side', req: true, role: 'side' },
  { k: 'back', n: 'Back / hookups', h: 'Back panel, cords, gas or water', req: true, role: 'back' },
  { k: 'inside', n: 'Inside / top', h: 'Open it up or show it working', req: true, role: 'interior' },
  { k: 'plate', n: 'Data plate', h: 'Model, serial, volts. Fill the frame', key: 'No plate on it', role: 'plate' },
  { k: 'brand', n: 'Brand logo', h: 'Close-up of the brand name', key: 'No logo', role: 'brand logo close-up' },
  { k: 'extra', n: 'Extra', h: 'Optional: detail, wear or accessories', role: 'closeup' }];
const MIN_REQ = 4, MAX_SHOTS = SHOTS.length; // 7
const st = { shots: {}, shotUrls: {}, skip: {}, sample: false, files: [], urls: [], item: null, run: 0, cond: 'good', retail: 0, bonus: 0, price: 0, priceDirty: false, titleDirty: false, descDirty: false, checked: null };
const fileIn = $('#fileIn'), drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
fileIn.addEventListener('change', () => { addFiles(fileIn.files); fileIn.value = ''; });
// whole-page drop goes to the box too
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (!drop.contains(e.target) && e.dataTransfer.files.length) { showStep('stepDrop'); $('#list').scrollIntoView(); addFiles(e.dataTransfer.files); } });
$('#sampleBtn').addEventListener('click', async () => {
  try { const r = await fetch('img/sample-reach-in.jpg'); const b = await r.blob(); runSample(new File([b], 'sample-true-reach-in.jpg', { type: 'image/jpeg' })); }
  catch (e) { toast('Example photo unavailable offline'); }
});

/* ---------- AI analysis (server endpoint; the OpenAI key never reaches the browser) ---------- */
const AI_URL = (window.SL_CONFIG && window.SL_CONFIG.analyzeEndpoint) || 'https://www.justaskmiggy.com/api/ll-analyze';
const CAT_LABEL = { oven: 'Cooking', mixer: 'Food Prep', refrig: 'Refrigeration', prep: 'Prep Tables', smallwares: 'Smallwares', racks: 'Shelving & Racks', furniture: 'Furniture', pos: 'POS', other: 'Equipment' };
const COND_ID = { 'Like New': 'like', 'Good': 'good', 'Workhorse': 'work' };
const BLANK = { name: 'Your equipment', brand: '-', model: '-', cat: 'Equipment', retail: 0, specs: [], desc: '', review: [], ai: false };
// Shrink photos to ~1280px JPEG before upload (fast on phones, keeps the request small).
function toDataUrl(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}
// AI gets up to 6 photos (server limit): data plate first so it can read model/serial, then brand logo, then the angles.
const AI_ORDER = ['plate', 'brand', 'front', 'side', 'back', 'inside', 'extra'];
async function analyzeFiles(list) {
  const imgs = [], roles = [];
  for (const x of list.slice(0, 6)) { try { imgs.push(await toDataUrl(x.file)); roles.push(x.role); } catch (e) {} }
  if (!imgs.length) throw Object.assign(new Error('photo'), { why: "I couldn't read that photo. Try a JPG or PNG." });
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 75000);
  let r;
  try {
    r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ images: imgs.map((d, i) => ({ role: roles[i] || 'closeup', dataUrl: d })), hints: { type: 'item', notes: [st.skip.plate && 'Seller says there is no data plate.', st.skip.brand && 'Seller says there is no brand logo.'].filter(Boolean).join(' ') || undefined } }) });
  } catch (e) { throw Object.assign(e, { why: navigator.onLine === false ? "You're offline. Check your signal and tap Analyze again." : "I couldn't reach Speedy AI just now. Tap Analyze again in a minute." }); }
  finally { clearTimeout(to); }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || typeof j.title !== 'string') {
    const why = r.status === 429 ? 'Too many scans in a row. Wait a minute and tap Analyze again.'
      : r.status === 503 ? "Speedy AI isn't available right now. Tap Analyze again in a bit."
      : "Speedy AI couldn't finish this one. Tap Analyze again.";
    throw Object.assign(new Error('backend ' + r.status), { why });
  }
  return j;
}
// Never let AI text carry prices or phone numbers into the description (price is set by the formula below).
const cleanText = t => String(t || '').split(/(?<=[.!?])\s+/).filter(x => x && !/\$\s?\d|(\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/.test(x)).join(' ').trim();
const rangeOf = r => { const lo = Math.round(+(r && r.low) || 0), hi = Math.round(+(r && r.high) || 0); return hi > 0 ? { low: Math.min(lo || hi, hi), high: Math.max(lo, hi) } : null; };
function fromAI(j) {
  const name = (j.title || [j.make, j.model].filter(Boolean).join(' ') || 'Your equipment').slice(0, 120);
  const used = j.usedRange && j.usedRange.high ? Math.round(j.usedRange.high) : 0;
  return { ai: true, name, brand: j.make || '-', model: j.model || '-', cat: CAT_LABEL[j.category] || 'Equipment',
    retail: Math.round(+j.newPrice || 0) || (used ? used * 2 : 0),
    // No new price? Fall back to the AI's resale range (valueRange, then usedRange) for a direct suggestion.
    range: rangeOf(j.valueRange) || rangeOf(j.usedRange),
    specs: [j.size, j.power, j.included && 'Included: ' + j.included, j.conditionReason].filter(Boolean),
    desc: cleanText(String(j.description || '').replace(/\s*Buyer arranges pickup\.?\s*$/i, '')),
    review: Array.isArray(j.needsReview) ? j.needsReview.slice(0, 4) : [], confidence: j.confidence || 'low', cond: COND_ID[j.condition] || 'good' };
}
function showStep(id) { ['stepDrop', 'stepId', 'stepResult'].forEach(s => { $('#' + s).hidden = s !== id; }); }

const isImg = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name);
const filled = () => SHOTS.filter(x => st.shots[x.k]);
const reqDone = () => SHOTS.filter(x => x.req && st.shots[x.k]).length;
const keyOk = k => !!(st.shots[k] || st.skip[k]);
function setShot(k, f) { if (st.shotUrls[k]) URL.revokeObjectURL(st.shotUrls[k]); if (f) { st.shots[k] = f; st.shotUrls[k] = URL.createObjectURL(f); delete st.skip[k]; } else { delete st.shots[k]; delete st.shotUrls[k]; } }
// Several photos at once (drop / library): fill the empty slots in order, never more than 7.
function addFiles(list) {
  const files = Array.from(list || []).filter(isImg);
  if (!files.length) { toast('Drop an image file (JPG, PNG, HEIC...)'); return; }
  showStep('stepDrop'); st.sample = false;
  const open = SHOTS.filter(x => !st.shots[x.k]);
  if (!open.length) { toast(`That's ${MAX_SHOTS} photos, the max per item. Remove one to swap it.`); return; }
  files.slice(0, open.length).forEach((f, i) => setShot(open[i].k, f));
  if (files.length > open.length) toast(`Max ${MAX_SHOTS} photos per item. ${files.length - open.length} extra photo${files.length - open.length === 1 ? ' was' : 's were'} left out.`);
  renderShots();
}
function renderShots() {
  const n = filled().length, r = reqDone();
  $('#shots').innerHTML = SHOTS.map((x, i) => { const u = st.shotUrls[x.k], sk = !!st.skip[x.k];
    const tag = x.req ? 'Required' : x.key ? (u ? 'Added' : sk ? 'Skipped' : 'Needed') : 'Optional';
    return `<div class="shot ${x.req ? 'req' : ''} ${x.key ? 'key' : ''} ${u ? 'done' : ''} ${sk ? 'skipped' : ''}" role="listitem">
      <div class="box"><label class="pick" title="${esc(x.h)}"><span class="num">${i + 1}</span>${u ? `<img src="${u}" alt="${esc(x.n)} photo"><span class="tick">${ICON_CHECK}</span>` : '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'}
        <input type="file" accept="image/*" data-slot="${x.k}" aria-label="${u ? 'Replace' : 'Add'} ${esc(x.n)} photo"></label>
      ${u ? `<button type="button" class="rm" data-rm="${x.k}" aria-label="Remove ${esc(x.n)} photo">${ICON_X}</button>` : ''}</div>
      <span class="nm">${esc(x.n)}</span><span class="tag">${tag}</span>
      ${x.key && !u ? `<label class="skipchk"><input type="checkbox" data-skip="${x.k}" ${sk ? 'checked' : ''}>${esc(x.key)}</label>` : ''}</div>`; }).join('');
  const c = $('#shotCount'); c.innerHTML = `${r}/${MIN_REQ} required &middot; ${n} of ${MAX_SHOTS} max`; c.classList.toggle('ok', r >= MIN_REQ && keyOk('plate') && keyOk('brand'));
  const flag = (k, lbl) => `<span class="sflag ${st.shots[k] ? 'ok' : st.skip[k] ? '' : 'need'}">${st.shots[k] ? '&#10003; ' : st.skip[k] ? 'No ' : ''}${lbl}</span>`;
  $('#shotFlags').innerHTML = flag('plate', 'Data plate') + flag('brand', 'Brand logo');
  const b = $('#analyzeBtn'), why = $('#analyzeWhy');
  const miss = SHOTS.filter(x => x.req && !st.shots[x.k]).map(x => x.n);
  const keys = [!keyOk('plate') && 'the data plate', !keyOk('brand') && 'the brand logo'].filter(Boolean);
  b.disabled = !!miss.length || !!keys.length;
  b.textContent = miss.length ? `Add ${miss.length} more required photo${miss.length === 1 ? '' : 's'}` : keys.length ? `Add ${keys.join(' and ')}` : `Analyze ${n} photo${n === 1 ? '' : 's'}`;
  why.textContent = miss.length ? `Still needed: ${miss.join(', ')}.` : keys.length ? `Snap ${keys.join(' and ')}, or tick ${[!keyOk('plate') && '"No plate on it"', !keyOk('brand') && '"No logo"'].filter(Boolean).join(' / ')} if the unit doesn't have one.` : n < MAX_SHOTS ? `Ready. You can add ${MAX_SHOTS - n} more (up to ${MAX_SHOTS}).` : `All ${MAX_SHOTS} photos in.`;
}
$('#shots').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.slot) { const f = Array.from(t.files || []).find(isImg); t.value = ''; if (f) { st.sample = false; setShot(t.dataset.slot, f); renderShots(); } }
  if (t.dataset.skip) { if (t.checked) st.skip[t.dataset.skip] = true; else delete st.skip[t.dataset.skip]; renderShots(); }
});
$('#shots').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; e.preventDefault(); setShot(b.dataset.rm, null); renderShots(); });
function resetShots() { SHOTS.forEach(x => setShot(x.k, null)); st.skip = {}; st.sample = false; renderShots(); }
$('#analyzeBtn').addEventListener('click', () => {
  if (reqDone() < MIN_REQ) { toast(`Add the ${MIN_REQ} required photos first`); return; }
  if (!keyOk('plate') || !keyOk('brand')) { toast('Add the data plate and brand logo, or tick No plate / No logo'); return; }
  st.files = AI_ORDER.filter(k => st.shots[k]).map(k => ({ file: st.shots[k], role: SHOTS.find(x => x.k === k).role }));
  st.urls = SHOTS.filter(x => st.shots[x.k]).map(x => st.shotUrls[x.k]);
  startAnalysis();
});
// Example photo (not the seller's item): one stock photo, clearly an example, so the 4-photo rule doesn't apply.
async function runSample(file) { st.sample = true; st.files = [{ file, role: 'front' }]; st.urls = [URL.createObjectURL(file)]; startAnalysis(); }
async function startAnalysis() {
  $('#thumbs').innerHTML = st.urls.map((u, i) => `<img src="${u}" alt="Photo ${i + 1}">`).join('');
  $('#scanImg').src = st.urls[0];
  st.priceDirty = st.titleDirty = st.descDirty = false; st.checked = null;
  await runAnalysis();
  $('#postProgress').hidden = true; $('#doneRow').hidden = true; $('#postBtn').disabled = false;
  $('#flow').scrollIntoView({ behavior: 'smooth', block: 'start' });
  maybeOnboard();
}
async function runAnalysis() {
  const run = ++st.run;
  showStep('stepId');
  const lis = $$('#identSteps li'); lis.forEach(l => l.className = '');
  const anim = (async () => { for (const li of lis) { if (run !== st.run) return; li.className = 'on'; await sleep(900); li.className = 'done'; } })();
  let item, why = '';
  try { item = fromAI(await analyzeFiles(st.files)); }
  catch (e) { console.info('[Speedy AI]', e.message); item = Object.assign({}, BLANK); why = e.why || "Speedy AI couldn't finish this one. Tap Analyze again."; }
  await anim; if (run !== st.run) return;
  st.item = item; st.aiWhy = why;
  if (item.ai) { st.cond = item.cond; $$('#condSeg button').forEach(x => { const on = x.dataset.c === st.cond; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); }
  st.priceDirty = st.titleDirty = st.descDirty = false;
  loadItem();
  showStep('stepResult');
}
const goldKey = b => Object.keys(SL.GOLD).find(k => String(b || '').toLowerCase().includes(k.toLowerCase()));
function loadItem() {
  const it = st.item;
  $('#itemImg').src = st.urls[0];
  $('#itemName').textContent = it.name; $('#itemBrand').textContent = it.brand; $('#itemModel').textContent = it.model; $('#itemCat').textContent = it.cat;
  const conf = $('#itemConf');
  conf.textContent = it.ai ? ({ high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[it.confidence] || 'AI read') : 'Not identified yet';
  conf.className = 'badge ' + (it.ai && it.confidence !== 'low' ? 'ok' : 'demo');
  $('#aiNote').innerHTML = it.ai
    ? 'Read by Speedy AI from your photos. ' + (it.review.length ? '<b>Double-check:</b> ' + it.review.map(esc).join(', ') + '.' : 'Double-check the details, then edit anything below.')
    : esc(st.aiWhy) + ' You can also type the details into the listing below.';
  $('#retryBtn').textContent = it.ai ? 'Not right? Analyze again' : 'Analyze again';
  st.retail = it.retail; $('#retailIn').value = it.retail || '';
  const gk = goldKey(it.brand), gold = gk ? SL.GOLD[gk] : 0;
  st.bonus = gold || 0;
  $('#bonusIn').value = gold || 50; $('#bonusIn').disabled = !gold;
  $('#goldTag').hidden = !gold;
  $('#bonusNote').textContent = gold ? `${gk} is a gold-standard brand: bonus $50-$200 (default ${money(gold)}).` : `${it.ai && it.brand !== '-' ? it.brand + " isn't" : "This brand isn't"} on the gold-standard list (True, Hobart, Vulcan, Imperial Brown), so B = $0.`;
  reprice();
}
$('#retryBtn').addEventListener('click', () => { if (st.files.length) runAnalysis(); });

// condition segmented control
$('#condSeg').innerHTML = SL.CONDITIONS.map(c => `<button type="button" role="radio" data-c="${c.id}" aria-checked="${c.id === st.cond}" class="${c.id === st.cond ? 'on' : ''}">${c.label}<small>&times; ${c.c.toFixed(2)}</small></button>`).join('');
$('#condSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.cond = b.dataset.c;
  $$('#condSeg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); reprice(); });
$('#retailIn').addEventListener('input', e => { st.retail = Math.max(0, +e.target.value || 0); reprice(); });
$('#bonusIn').addEventListener('input', e => { st.bonus = +e.target.value; reprice(); });
$('#priceIn').addEventListener('input', e => { st.priceDirty = true; st.price = Math.max(0, +e.target.value || 0); priceState(); if (!st.titleDirty || !st.descDirty) writeListing(); });
$('#titleIn').addEventListener('input', e => { st.titleDirty = true; $('#titleCount').textContent = e.target.value.length + '/80'; });
$('#descIn').addEventListener('input', () => { st.descDirty = true; });

function reprice() {
  const c = SL.CONDITIONS.find(x => x.id === st.cond);
  const B = goldKey(st.item.brand) ? st.bonus : 0;
  const rg = st.item.range;
  // R known: use the formula. No R but a resale range: suggest its midpoint. Neither: no suggestion (never $0).
  const V = st.retail > 0 ? st.retail * c.c + B : rg ? (rg.low + rg.high) / 2 : 0;
  $('#bonusOut').textContent = money(B);
  $('#calc').innerHTML = st.retail > 0 ? `V = (<b>${money(st.retail)}</b> &times; <b>${c.c.toFixed(2)}</b>) + <b>${money(B)}</b> = <b>${money(V)}</b>`
    : rg ? `No new price found, so this is Speedy AI's used-value estimate: <b>${money(rg.low)}${rg.high !== rg.low ? ' - ' + money(rg.high) : ''}</b>. Add the new retail price above to use the formula.`
    : `No price found from the photos. Type the new retail price above, or enter your asking price below.`;
  $('#calc').classList.toggle('wrap', !(st.retail > 0));
  $('#vOut').textContent = V > 0 ? money(V) : '-';
  if (!st.priceDirty) { st.price = V > 0 ? Math.round(V / 5) * 5 : 0; $('#priceIn').value = st.price || ''; }
  priceState();
  writeListing();
}
// Seller must have a real asking price before anything is copied or prepared.
function priceState() { const need = !(st.price > 0); $('#priceIn').classList.toggle('need', need); $('#priceNeed').hidden = !need; return !need; }
function requirePrice() { if (priceState()) return true; toast('Enter your asking price first'); $('#priceIn').focus(); $('#priceIn').scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
function writeListing() {
  const it = st.item, c = SL.CONDITIONS.find(x => x.id === st.cond);
  if (!st.titleDirty) {
    let t = it.ai ? `${it.name} - Used, ${c.label}` : ''; if (t.length > 80) t = it.name.slice(0, 80 - 8 - c.label.length).trim() + ` - Used, ${c.label}`; t = t.slice(0, 80);
    $('#titleIn').value = t; $('#titleCount').textContent = t.length + '/80';
  }
  if (!st.descDirty) {
    $('#descIn').value = !it.ai ? '' : `${it.name}\n\n${it.desc ? it.desc + '\n\n' : ''}Condition: ${c.label} - ${c.hint.toLowerCase()}.\nBrand: ${it.brand}  |  Model: ${it.model}  |  Category: ${it.cat}\n${it.specs.length ? '\nDetails:\n' + it.specs.map(s => '- ' + s).join('\n') + '\n' : ''}${st.price > 0 ? `\nPrice: ${money(st.price)}${st.retail ? ` (new runs about ${money(st.retail)})` : ''}.\n` : '\n'}Local pickup, or freight at buyer's expense. Message with questions or to schedule a look.\n\nListed with Speedy List AI`;
  }
}

/* post step: chips + checkboxes (auto-check connected/ready) */
function renderPostChecks() {
  if (!$('#mkChecks')) return;
  const prev = st.checked;
  const STARTER = ['ebay', 'facebook', 'craigslist', '86deadstock']; // first-run default before anything is connected
  const isChecked = m => prev ? prev.has(m.id) : anyConn() ? !!connStatus(m.id) : STARTER.includes(m.id);
  const rd = POSTABLE.filter(m => connStatus(m.id));
  $('#connChips').innerHTML = rd.length
    ? rd.map(m => `<span class="cchip ready">${ICON_CHECK}${esc(m.name)}</span>`).join('')
    : '<span class="cchip">No sites picked yet</span>';
  $('#connNudge').hidden = anyConn();
  const group = (method, label) => {
    const list = POSTABLE.filter(m => m.method === method);
    return `<div class="mk-group"><span>${label}</span><button class="linkbtn" type="button" data-all="${method}">Select all</button></div><div class="mk-row">` +
      list.map(m => { const s = connStatus(m.id); return `<label class="mcheck"><input type="checkbox" value="${m.id}" ${isChecked(m) ? 'checked' : ''}>${mono(m)}<span class="nm">${esc(m.name)}</span><span class="mstate ${s === 'connected' ? 'on' : s === 'ready' ? 'ready' : ''}" title="${s ? 'ready' : 'not added'}"></span></label>`; }).join('') + '</div>';
  };
  $('#mkChecks').innerHTML = group('direct', 'Direct - seller API, auto-post coming') + group('assisted', 'Assisted - copy, open, Publish');
  updatePostBtn();
}
function checkedIds() { return $$('#mkChecks input:checked').map(i => i.value); }
function updatePostBtn() { const n = checkedIds().length; const b = $('#postBtn'); if (!b.dataset.busy) { b.disabled = !n; b.lastChild.textContent = n ? ` Get it ready for ${n} site${n === 1 ? '' : 's'}` : ' Pick at least one marketplace'; } }
$('#mkChecks').addEventListener('change', () => { st.checked = new Set(checkedIds()); updatePostBtn(); });
$('#mkChecks').addEventListener('click', e => { const b = e.target.closest('[data-all]'); if (!b) return;
  const boxes = $$(`#mkChecks input`).filter(i => byId(i.value).method === b.dataset.all); const all = boxes.every(i => i.checked);
  boxes.forEach(i => { i.checked = !all; }); st.checked = new Set(checkedIds()); updatePostBtn(); });

function listingText() { return `${$('#titleIn').value}\n${money(+$('#priceIn').value || 0)}\n\n${$('#descIn').value}`; }

$('#postBtn').addEventListener('click', async () => {
  const ids = checkedIds(); if (!ids.length) return;
  if (!$('#titleIn').value.trim()) { toast('Add a title first'); $('#titleIn').focus(); return; }
  if (!requirePrice()) return;
  const b = $('#postBtn'); b.dataset.busy = '1'; b.disabled = true; b.lastChild.textContent = ' Preparing...';
  const ol = $('#postProgress'); ol.hidden = false;
  ol.innerHTML = ids.map(id => { const m = byId(id); return `<li data-id="${id}">${mono(m)}<span class="nm">${esc(m.name)}</span><span class="bar"><i></i></span><span class="st">Queued</span></li>`; }).join('');
  ol.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  for (const id of ids) {
    const li = $(`li[data-id="${id}"]`, ol), s = li.querySelector('.st'), bar = li.querySelector('.bar i');
    s.innerHTML = '<span class="spinner"></span>Preparing...';
    bar.style.width = '55%'; await sleep(220); bar.style.width = '100%'; await sleep(100);
    s.innerHTML = `<button type="button" data-finish="site">Copy &amp; open</button>`;
  }
  delete b.dataset.busy; b.lastChild.textContent = ' Ready - prepare again'; b.disabled = false;
  $('#doneRow').hidden = false;
  toast(`Ready for ${ids.length} site${ids.length === 1 ? '' : 's'}. Tap Copy & open on each.`);
});
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch (er) { const x = $('#copyBox'); if (x) { x.select(); document.execCommand('copy'); return true; } return false; } }
$('#postProgress').addEventListener('click', async e => {
  const btn = e.target.closest('[data-finish]'); if (!btn) return;
  if (!requirePrice()) return;
  const li = btn.closest('li'), m = byId(li.dataset.id), s = li.querySelector('.st');
  const text = listingText();
  copyText(text).then(ok => ok && toast('Listing copied'));
  const p = openModal(`${mhead('Post on ' + esc(m.name))}<div class="mbody">
    <p>Your listing is copied. Open ${esc(m.name)}, paste it in, add your photos and tap <b>Publish</b>.</p>
    <textarea class="copybox" readonly id="copyBox">${esc(text)}</textarea>
    <div class="mfoot"><button class="btn ghost" id="copyBtn">Copy again</button><a class="btn ghost" href="${esc(m.site)}" target="_blank" rel="noopener">Open ${esc(m.name)}</a></div>
    <div class="mfoot" style="margin-top:8px"><button class="btn primary" id="pubBtn" data-autofocus>I published it</button></div></div>`);
  $('#copyBtn').addEventListener('click', async () => { await copyText($('#copyBox').value); toast('Listing copied'); });
  $('#pubBtn').addEventListener('click', () => closeModal(true));
  if (await p) { s.className = 'st ok'; s.innerHTML = `<span class="check">${ICON_CHECK}</span>Published`; }
});
$('#mailBtn') && $('#mailBtn').addEventListener('click', () => {
  if (!requirePrice()) return;
  location.href = `mailto:justaskmiggy@gmail.com?subject=${encodeURIComponent('Speedy List: ' + ($('#titleIn').value || 'new listing'))}&body=${encodeURIComponent(listingText() + '\n\n(Attach your photos.)')}`;
});
$('#againBtn').addEventListener('click', () => { resetShots(); showStep('stepDrop'); $('#list').scrollIntoView({ behavior: 'smooth' }); });

/* ---------- onboarding sheet after first drop ---------- */
function maybeOnboard() {
  if (LS.get('sla.onboarded', false) || anyConn()) return;
  LS.set('sla.onboarded', true);
  setTimeout(() => {
    const sh = $('#sheet');
    sh.innerHTML = `<h3><img src="assets/brand/roadrunner-tile-64.png" width="32" height="32" alt="">Pick your marketplaces in 30 seconds</h3>
      <p>Pick your sites once and every listing gets a Copy &amp; open button for each one. No passwords needed.</p>
      <div class="mfoot"><button class="btn primary" data-act="connect-all">Add all</button><button class="btn ghost" id="sheetLater">Later</button></div>`;
    sh.hidden = false; $('#sheetLater').addEventListener('click', hideSheet);
  }, 900);
}
function hideSheet() { $('#sheet').hidden = true; }

/* ---------- init ---------- */
renderConnGrid(); renderMkGrid(); st.item = Object.assign({}, BLANK); renderPostChecks(); renderShots();
if (location.hash === '#connect-all') setTimeout(connectAll, 300);
window.SpeedyList = { connectAll, addFiles, SHOTS, MIN_REQ, MAX_SHOTS, reset() { localStorage.removeItem(CONN_KEY); localStorage.removeItem('sla.onboarded'); conns = {}; renderConnGrid(); renderPostChecks(); } };
})();
