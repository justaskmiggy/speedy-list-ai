/* Speedy List AI - prototype app logic. Demo AI + demo posting + demo marketplace connections. */
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

/* Direct: simulated one-tap OAuth popup */
async function oauthDemo(m) {
  const p = openModal(`${mhead('Connect ' + esc(m.name))}<div class="mbody">
    <div class="oauth"><div class="oauth-bar">${ICON_LOCK}<span>${esc(m.name)} secure sign-in &middot; DEMO</span></div>
      <div class="oauth-body">${mono(m)}<strong>Allow Speedy List AI to post for you?</strong>
        <ul class="perm"><li>Create and update your listings</li><li>Read your listing status</li><li>Never sees your password</li></ul>
        <button class="btn primary block" id="oauthGo" data-autofocus>Continue as demo seller</button>
      </div></div>
    <p class="tiny">Demo only: no real sign-in happens. In the real app, ${esc(m.name)}'s own secure login opens here once (OAuth), and Speedy List never sees your password.</p></div>`);
  $('#oauthGo').addEventListener('click', async ev => {
    const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner"></span> Authorizing...';
    await sleep(900); closeModal(true);
  });
  const ok = await p;
  if (ok) { setConn(m.id, 'connected', { account: 'demo-seller' }); toast(`${m.name} connected (demo)`); }
  return ok;
}
/* Assisted: one-time explanation */
async function assistedSetup(m) {
  const p = openModal(`${mhead(esc(m.name) + ' - assisted posting')}<div class="mbody">
    <p>${esc(m.name)} doesn't offer an open posting API to apps like ours, so here's how it works:</p>
    <ol class="steps3"><li>Speedy List writes the listing and preps your photos.</li><li>We open ${esc(m.name)} with your title, price and description pre-filled (or copied, ready to paste).</li><li>You check it and tap <b>Publish</b>. That's it.</li></ol>
    <p class="tiny">Use your normal ${esc(m.name)} login on their site. Demo: nothing is opened or sent in this prototype unless you tap through.</p>
    <div class="mfoot"><button class="btn primary" id="gotIt" data-autofocus>Got it</button></div></div>`);
  $('#gotIt').addEventListener('click', () => closeModal(true));
  const ok = await p;
  if (ok) { setConn(m.id, 'ready'); toast(`${m.name} ready`); }
  return ok;
}
function connectOne(id) { const m = byId(id); if (!m) return; if (m.method === 'direct') return oauthDemo(m); if (m.method === 'assisted') return assistedSetup(m); toast(m.name + ' is planned - not available yet'); }

/* Connect all with progress list */
async function connectAll() {
  const rows = POSTABLE.map(m => `<li data-id="${m.id}">${mono(m)}<span class="nm">${esc(m.name)}</span><span class="st">${connStatus(m.id) ? 'Already set' : 'Waiting'}</span></li>`).join('');
  const p = openModal(`${mhead('Connect all marketplaces')}<div class="mbody">
    <div class="cbar"><i id="cbarFill"></i></div><ul class="clist">${rows}</ul>
    <p class="tiny" id="callNote">Demo: Direct marketplaces simulate their one-time sign-in; Assisted ones just get set up for pre-filled posting. In the real app, each Direct marketplace shows its own login once.</p>
    <div class="mfoot"><button class="btn primary" id="callDone" disabled>Connecting...</button></div></div>`);
  $('#callDone').addEventListener('click', () => closeModal(true));
  let i = 0;
  for (const m of POSTABLE) {
    i++;
    const li = $(`.clist li[data-id="${m.id}"]`); const st = li && li.querySelector('.st');
    if (!li || $('#modal').hidden) break;
    li.scrollIntoView({ block: 'nearest' });
    if (!connStatus(m.id)) {
      st.innerHTML = '<span class="spinner"></span>' + (m.method === 'direct' ? 'Signing in (demo)...' : 'Setting up...');
      await sleep(m.method === 'direct' ? 750 : 220);
      if (st.checked) st.checked.add(m.id);
      conns[m.id] = { status: m.method === 'direct' ? 'connected' : 'ready', at: Date.now(), account: m.method === 'direct' ? 'demo-seller' : undefined };
    }
    const s = connStatus(m.id);
    st.className = 'st ' + (s === 'connected' ? 'ok' : 'rd');
    st.innerHTML = s === 'connected' ? `<span class="check">${ICON_CHECK}</span>Connected` : `<span class="check or">${ICON_CHECK}</span>Ready`;
    const f = $('#cbarFill'); if (f) f.style.width = (i / POSTABLE.length * 100) + '%';
  }
  LS.set(CONN_KEY, conns); renderConnGrid(); renderPostChecks(); renderMkGrid();
  const b = $('#callDone'); if (b) { b.disabled = false; b.textContent = 'Done'; }
  const n = $('#callNote'); if (n) n.innerHTML = `<b>All set.</b> ${POSTABLE.filter(m => connStatus(m.id) === 'connected').length} connected, ${POSTABLE.filter(m => connStatus(m.id) === 'ready').length} ready for pre-filled posting (demo).`;
  await p;
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'); if (!a || a.closest('#modal')) return;
  const act = a.dataset.act;
  if (act === 'connect-all') { e.preventDefault(); hideSheet(); connectAll(); }
  if (act === 'connect') { e.preventDefault(); connectOne(a.dataset.id); }
  if (act === 'disconnect') { e.preventDefault(); const m = byId(a.dataset.id); setConn(a.dataset.id, null); toast(m.name + ' disconnected'); }
});

/* ---------- Connect grid ---------- */
function renderConnGrid() {
  $('#connGrid').innerHTML = POSTABLE.map(m => {
    const s = connStatus(m.id);
    const stat = s === 'connected' ? `<div class="stat on"><span class="check">${ICON_CHECK}</span> <b>Connected</b> as <b>@${esc(conns[m.id].account || 'demo-seller')}</b> <span class="tiny">(placeholder)</span></div>`
      : s === 'ready' ? `<div class="stat ready"><span class="check or">${ICON_CHECK}</span> <b>Ready</b> - we'll open the site with your listing pre-filled, you just tap Publish.</div>`
      : `<div class="stat">${m.method === 'direct' ? 'One-tap sign-in. Speedy List posts for you.' : 'No login needed here. We pre-fill, you tap Publish.'}</div>`;
    const btn = s ? `<button class="btn ${s === 'connected' ? 'ok' : 'ready'} sm" data-act="connect" data-id="${m.id}">${ICON_CHECK.replace('<svg', '<svg width="16" height="16"')} ${s === 'connected' ? 'Connected' : 'Ready'}</button><button class="linkbtn" data-act="disconnect" data-id="${m.id}">Disconnect</button>`
      : `<button class="btn primary sm" data-act="connect" data-id="${m.id}">Connect</button>`;
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
const st = { files: [], urls: [], item: null, itemIdx: 0, cond: 'good', retail: 0, bonus: 0, price: 0, priceDirty: false, titleDirty: false, descDirty: false, checked: null };
const fileIn = $('#fileIn'), drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
fileIn.addEventListener('change', () => { handleFiles(fileIn.files); fileIn.value = ''; });
// whole-page drop goes to the box too
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); if (!drop.contains(e.target) && e.dataTransfer.files.length) { $('#list').scrollIntoView(); handleFiles(e.dataTransfer.files); } });
$('#sampleBtn').addEventListener('click', async () => {
  try { const r = await fetch('img/sample-reach-in.jpg'); const b = await r.blob(); handleFiles([new File([b], 'sample-true-reach-in.jpg', { type: 'image/jpeg' })]); }
  catch (e) { toast('Sample image unavailable offline'); }
});

function pickItem(files) {
  const names = files.map(f => f.name).join(' ');
  const i = SL.DEMO_ITEMS.findIndex(d => d.key.test(names));
  return i < 0 ? 0 : i;
}
function showStep(id) { ['stepDrop', 'stepId', 'stepResult'].forEach(s => { $('#' + s).hidden = s !== id; }); }

async function handleFiles(list) {
  const files = Array.from(list || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name));
  if (!files.length) { toast('Drop an image file (JPG, PNG, HEIC...)'); return; }
  st.urls.forEach(u => URL.revokeObjectURL(u));
  st.files = files.slice(0, 12); st.urls = st.files.map(f => URL.createObjectURL(f));
  $('#thumbs').innerHTML = st.urls.map((u, i) => `<img src="${u}" alt="Photo ${i + 1}">`).join('');
  $('#scanImg').src = st.urls[0];
  showStep('stepId');
  const lis = $$('#identSteps li'); lis.forEach(l => l.className = '');
  for (const li of lis) { li.className = 'on'; await sleep(560); li.className = 'done'; }
  await sleep(200);
  st.itemIdx = pickItem(st.files); st.priceDirty = st.titleDirty = st.descDirty = false; st.checked = null;
  loadItem();
  showStep('stepResult');
  $('#postProgress').hidden = true; $('#doneRow').hidden = true; $('#postBtn').disabled = false;
  $('#flow').scrollIntoView({ behavior: 'smooth', block: 'start' });
  maybeOnboard();
}

function loadItem() {
  const it = st.item = SL.DEMO_ITEMS[st.itemIdx];
  $('#itemImg').src = st.urls[0];
  $('#itemName').textContent = it.name; $('#itemBrand').textContent = it.brand; $('#itemModel').textContent = it.model; $('#itemCat').textContent = it.cat;
  $('#itemConf').textContent = it.conf + '% match (demo)';
  st.retail = it.retail; $('#retailIn').value = it.retail;
  const gold = SL.GOLD[it.brand];
  st.bonus = gold || 0;
  $('#bonusIn').value = gold || 50; $('#bonusIn').disabled = !gold;
  $('#goldTag').hidden = !gold;
  $('#bonusNote').textContent = gold ? `${it.brand} is a gold-standard brand: bonus $50-$200 (default ${money(gold)}).` : `${it.brand} isn't on the gold-standard list (True, Hobart, Vulcan, Imperial Brown), so B = $0.`;
  st.priceDirty = st.titleDirty = st.descDirty = false;
  reprice();
}
$('#retryBtn').addEventListener('click', () => { st.itemIdx = (st.itemIdx + 1) % SL.DEMO_ITEMS.length; loadItem(); toast('Demo AI picked another sample item'); });

// condition segmented control
$('#condSeg').innerHTML = SL.CONDITIONS.map(c => `<button type="button" role="radio" data-c="${c.id}" aria-checked="${c.id === st.cond}" class="${c.id === st.cond ? 'on' : ''}">${c.label}<small>&times; ${c.c.toFixed(2)}</small></button>`).join('');
$('#condSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; st.cond = b.dataset.c;
  $$('#condSeg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); reprice(); });
$('#retailIn').addEventListener('input', e => { st.retail = Math.max(0, +e.target.value || 0); reprice(); });
$('#bonusIn').addEventListener('input', e => { st.bonus = +e.target.value; reprice(); });
$('#priceIn').addEventListener('input', e => { st.priceDirty = true; st.price = +e.target.value || 0; if (!st.titleDirty || !st.descDirty) writeListing(); });
$('#titleIn').addEventListener('input', e => { st.titleDirty = true; $('#titleCount').textContent = e.target.value.length + '/80'; });
$('#descIn').addEventListener('input', () => { st.descDirty = true; });

function reprice() {
  const c = SL.CONDITIONS.find(x => x.id === st.cond);
  const B = SL.GOLD[st.item.brand] ? st.bonus : 0;
  const V = st.retail * c.c + B;
  $('#bonusOut').textContent = money(B);
  $('#calc').innerHTML = `V = (<b>${money(st.retail)}</b> &times; <b>${c.c.toFixed(2)}</b>) + <b>${money(B)}</b> = <b>${money(V)}</b>`;
  $('#vOut').textContent = money(V);
  if (!st.priceDirty) { st.price = Math.round(V / 5) * 5; $('#priceIn').value = st.price; }
  writeListing();
}
function writeListing() {
  const it = st.item, c = SL.CONDITIONS.find(x => x.id === st.cond);
  if (!st.titleDirty) {
    let t = `${it.name} - Used, ${c.label}`; if (t.length > 80) t = `${it.brand} ${it.model} ${it.cat} - Used, ${c.label}`; t = t.slice(0, 80);
    $('#titleIn').value = t; $('#titleCount').textContent = t.length + '/80';
  }
  if (!st.descDirty) {
    $('#descIn').value = `${it.name}\n\nCondition: ${c.label} - ${c.hint.toLowerCase()}.\nBrand: ${it.brand}  |  Model: ${it.model}  |  Category: ${it.cat}\n\nHighlights:\n${it.specs.map(s => '- ' + s).join('\n')}\n\nPrice: ${money(st.price)} (new runs about ${money(st.retail)}).\nLocal pickup, or freight at buyer's expense. Message with questions or to schedule a look.\n\nListed with Speedy List AI`;
  }
}

/* post step: chips + checkboxes (auto-check connected/ready) */
function renderPostChecks() {
  if (!$('#mkChecks')) return;
  const prev = st.checked;
  const STARTER = ['ebay', 'facebook', 'craigslist', '86deadstock']; // first-run default before anything is connected
  const isChecked = m => prev ? prev.has(m.id) : anyConn() ? !!connStatus(m.id) : STARTER.includes(m.id);
  const on = POSTABLE.filter(m => connStatus(m.id) === 'connected'), rd = POSTABLE.filter(m => connStatus(m.id) === 'ready');
  $('#connChips').innerHTML = (on.length || rd.length)
    ? on.map(m => `<span class="cchip on">${ICON_CHECK}${esc(m.name)}</span>`).join('') + rd.map(m => `<span class="cchip ready">${ICON_CHECK}${esc(m.name)} ready</span>`).join('')
    : '<span class="cchip">No marketplaces connected yet</span>';
  $('#connNudge').hidden = anyConn();
  const group = (method, label) => {
    const list = POSTABLE.filter(m => m.method === method);
    return `<div class="mk-group"><span>${label}</span><button class="linkbtn" type="button" data-all="${method}">Select all</button></div><div class="mk-row">` +
      list.map(m => { const s = connStatus(m.id); return `<label class="mcheck"><input type="checkbox" value="${m.id}" ${isChecked(m) ? 'checked' : ''}>${mono(m)}<span class="nm">${esc(m.name)}</span><span class="mstate ${s === 'connected' ? 'on' : s === 'ready' ? 'ready' : ''}" title="${s || 'not connected'}"></span></label>`; }).join('') + '</div>';
  };
  $('#mkChecks').innerHTML = group('direct', 'Direct - posts for you') + group('assisted', 'Assisted - pre-filled, you tap Publish');
  updatePostBtn();
}
function checkedIds() { return $$('#mkChecks input:checked').map(i => i.value); }
function updatePostBtn() { const n = checkedIds().length; const b = $('#postBtn'); if (!b.dataset.busy) { b.disabled = !n; b.lastChild.textContent = n ? ` Post everywhere (${n})` : ' Pick at least one marketplace'; } }
$('#mkChecks').addEventListener('change', () => { st.checked = new Set(checkedIds()); updatePostBtn(); });
$('#mkChecks').addEventListener('click', e => { const b = e.target.closest('[data-all]'); if (!b) return;
  const boxes = $$(`#mkChecks input`).filter(i => byId(i.value).method === b.dataset.all); const all = boxes.every(i => i.checked);
  boxes.forEach(i => { i.checked = !all; }); st.checked = new Set(checkedIds()); updatePostBtn(); });

function listingText() { return `${$('#titleIn').value}\n${money(+$('#priceIn').value || 0)}\n\n${$('#descIn').value}`; }

$('#postBtn').addEventListener('click', async () => {
  const ids = checkedIds(); if (!ids.length) return;
  const b = $('#postBtn'); b.dataset.busy = '1'; b.disabled = true; b.lastChild.textContent = ' Posting...';
  const ol = $('#postProgress'); ol.hidden = false;
  ol.innerHTML = ids.map(id => { const m = byId(id); return `<li data-id="${id}">${mono(m)}<span class="nm">${esc(m.name)}</span><span class="bar"><i></i></span><span class="st">Queued</span></li>`; }).join('');
  ol.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  for (const id of ids) {
    const m = byId(id), li = $(`li[data-id="${id}"]`, ol), s = li.querySelector('.st'), bar = li.querySelector('.bar i');
    s.innerHTML = '<span class="spinner"></span>' + (m.method === 'direct' ? 'Posting...' : 'Preparing...');
    bar.style.width = '55%'; await sleep(m.method === 'direct' ? 700 : 420); bar.style.width = '100%'; await sleep(150);
    if (m.method === 'direct' && connStatus(id) !== 'connected') {
      s.innerHTML = `<button type="button" data-finish="connect">Sign in to post (demo)</button>`;
    } else if (m.method === 'direct') {
      s.className = 'st ok'; s.innerHTML = `<span class="check">${ICON_CHECK}</span>Posted (demo)`;
    } else {
      s.innerHTML = `<button type="button" data-finish="site">Ready - tap to finish on site (demo)</button>`;
    }
  }
  delete b.dataset.busy; b.lastChild.textContent = ' Posted - run again'; b.disabled = false;
  $('#doneRow').hidden = false;
  const direct = ids.filter(i => byId(i).method === 'direct' && connStatus(i) === 'connected').length;
  toast(`Demo: ${direct} posted, ${ids.length - direct} ready to finish`);
});
$('#postProgress').addEventListener('click', async e => {
  const btn = e.target.closest('[data-finish]'); if (!btn) return;
  const li = btn.closest('li'), m = byId(li.dataset.id), s = li.querySelector('.st');
  if (btn.dataset.finish === 'connect') {
    if (await oauthDemo(m)) { s.innerHTML = '<span class="spinner"></span>Posting...'; await sleep(700); s.className = 'st ok'; s.innerHTML = `<span class="check">${ICON_CHECK}</span>Posted (demo)`; }
    return;
  }
  const p = openModal(`${mhead('Finish on ' + esc(m.name))}<div class="mbody">
    <p>In the real app, ${esc(m.name)} opens with your listing pre-filled and you just tap <b>Publish</b>. For this demo, copy the listing and open the site yourself:</p>
    <textarea class="copybox" readonly id="copyBox">${esc(listingText())}</textarea>
    <div class="mfoot"><button class="btn ghost" id="copyBtn">Copy listing</button><a class="btn ghost" href="${esc(m.site)}" target="_blank" rel="noopener">Open ${esc(m.name)}</a></div>
    <div class="mfoot" style="margin-top:8px"><button class="btn primary" id="pubBtn" data-autofocus>I tapped Publish</button></div>
    <p class="tiny" style="margin-top:10px">Demo: Speedy List doesn't open or post anything by itself here.</p></div>`);
  $('#copyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#copyBox').value); toast('Listing copied'); } catch (er) { $('#copyBox').select(); document.execCommand('copy'); toast('Listing copied'); } });
  $('#pubBtn').addEventListener('click', () => closeModal(true));
  if (await p) { s.className = 'st ok'; s.innerHTML = `<span class="check">${ICON_CHECK}</span>Published by you (demo)`; }
});
$('#againBtn').addEventListener('click', () => { showStep('stepDrop'); $('#list').scrollIntoView({ behavior: 'smooth' }); });

/* ---------- onboarding sheet after first drop ---------- */
function maybeOnboard() {
  if (LS.get('sla.onboarded', false) || anyConn()) return;
  LS.set('sla.onboarded', true);
  setTimeout(() => {
    const sh = $('#sheet');
    sh.innerHTML = `<h3><img src="assets/brand/roadrunner-tile-64.png" width="32" height="32" alt="">Connect your marketplaces in 30 seconds</h3>
      <p>Do it once and every listing goes out with one tap. Direct marketplaces sign in once; Assisted ones just need a quick "Got it". (Demo - nothing real is connected.)</p>
      <div class="mfoot"><button class="btn primary" data-act="connect-all">Connect all</button><button class="btn ghost" id="sheetLater">Later</button></div>`;
    sh.hidden = false; $('#sheetLater').addEventListener('click', hideSheet);
  }, 900);
}
function hideSheet() { $('#sheet').hidden = true; }

/* ---------- init ---------- */
renderConnGrid(); renderMkGrid(); st.item = SL.DEMO_ITEMS[0]; renderPostChecks();
if (location.hash === '#connect-all') setTimeout(connectAll, 300);
window.SpeedyList = { connectAll, handleFiles, reset() { localStorage.removeItem(CONN_KEY); localStorage.removeItem('sla.onboarded'); conns = {}; renderConnGrid(); renderPostChecks(); } };
})();
