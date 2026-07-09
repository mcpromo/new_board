/* ===================== OREBOARD ===================== */

const TARIFFS = [
  { id: 't10',  type: 'views', views: 10000,  price: 400  },
  { id: 't50',  type: 'views', views: 50000,  price: 1650 },
  { id: 't100', type: 'views', views: 100000, price: 3750 },
  { id: 'author', type: 'flat', label: 'Авторское видео', views: null, price: 1500 },
  { id: 'review', type: 'flat', label: 'Обзор сервера',   views: null, price: 500  },
  { id: 'custom', type: 'views', views: null, price: null },
];

function todayStr(){
  return new Date().toISOString().slice(0, 10);
}

function uid(){
  return Math.random().toString(36).slice(2, 10);
}

function detectPlatform(url){
  const u = url.toLowerCase();
  if(u.includes('tiktok.com')) return 'tiktok';
  if(u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  return 'other';
}

function formatNumber(n){
  return new Intl.NumberFormat('ru-RU').format(Math.round(n || 0));
}
function formatRub(n){
  return formatNumber(n) + ' ₽';
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str){
  return String(str).replace(/"/g, '&quot;');
}

/* ---------------- firebase setup ---------------- */

let db = null;
let firebaseReady = false;

try{
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  firebaseReady = true;
}catch(e){
  console.error('Firebase init failed', e);
}

const projectsRef = firebaseReady ? db.collection('projects') : null;

let state = { projects: [] };

/* ---------------- pin gate ---------------- */

const pinOverlay = document.getElementById('pinOverlay');
const loadOverlay = document.getElementById('loadOverlay');
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');

function initGate(){
  const needsPin = typeof ACCESS_PIN === 'string' && ACCESS_PIN.length > 0;
  const unlocked = sessionStorage.getItem('oreboard_unlocked') === '1';
  if(needsPin && !unlocked){
    pinOverlay.hidden = false;
    pinInput.focus();
  }else{
    pinOverlay.hidden = true;
    startApp();
  }
}

pinForm.addEventListener('submit', e => {
  e.preventDefault();
  if(pinInput.value === ACCESS_PIN){
    sessionStorage.setItem('oreboard_unlocked', '1');
    pinOverlay.hidden = true;
    startApp();
  }else{
    pinError.hidden = false;
    pinInput.value = '';
    pinInput.focus();
  }
});

/* ---------------- firestore sync ---------------- */

function showLoadError(message){
  loadOverlay.hidden = false;
  loadOverlay.classList.add('is-error');
  loadOverlay.querySelector('.load-spinner').hidden = true;
  loadOverlay.querySelector('p').innerHTML = message;
}

function startApp(){
  if(!firebaseReady){
    showLoadError('Firebase не настроен. Заполните <code>firebase-config.js</code> — см. README.');
    return;
  }
  projectsRef.onSnapshot(snapshot => {
    state.projects = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        createdAt: d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : (d.createdAt || 0),
      };
    });
    loadOverlay.hidden = true;
    loadOverlay.classList.remove('is-error');
    renderAll();
  }, err => {
    console.error(err);
    if(err.code === 'permission-denied'){
      showLoadError('Firestore отклонил доступ (permission-denied).<br>Скорее всего в консоли Firebase истёк или не был опубликован режим <b>Test mode</b> — откройте <b>Firestore Database → Rules</b> и проверьте, что там опубликовано именно правило <code>allow read, write: if true;</code> из README, шаг 3.');
    }else{
      showLoadError('Не удалось подключиться к базе (' + (err.code || err.message) + ').<br>Проверьте интернет-соединение и firebase-config.js.');
    }
  });
}

/* ---------------- toast ---------------- */

const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(msg){
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 200);
  }, 2200);
}

/* ---------------- client-facing progress view ---------------- */

function buildClientLink(id){
  return `${location.origin}${location.pathname}?client=${id}`;
}

function initClientView(id){
  document.getElementById('loadOverlay').hidden = true;
  document.getElementById('clientView').hidden = false;

  if(!firebaseReady){
    showClientError('Firebase не настроен на этом сайте.');
    return;
  }
  projectsRef.doc(id).onSnapshot(doc => {
    if(!doc.exists){
      showClientError('Проект не найден. Проверьте ссылку у того, кто её отправил, — возможно, она устарела.');
      return;
    }
    renderClientView(doc.data());
  }, err => {
    console.error(err);
    if(err.code === 'permission-denied'){
      showClientError('Нет доступа к данным (permission-denied). Это чинится на стороне владельца доски — попросите его проверить Firestore Rules.');
    }else{
      showClientError('Не удалось загрузить прогресс (' + (err.code || err.message) + '). Попробуйте обновить страницу.');
    }
  });
}

function renderClientView(p){
  document.getElementById('clientLoading').hidden = true;
  document.getElementById('clientCard').hidden = false;
  document.getElementById('clientError').hidden = true;

  const pct = p.target > 0 ? (p.current / p.target) * 100 : 0;
  const done = p.current >= p.target;
  const overPct = pct - 100;

  document.getElementById('clientProjectName').textContent = p.name || 'Проект';
  const pctEl = document.getElementById('clientPct');
  pctEl.textContent = pct.toFixed(1).replace('.0', '') + '%';
  pctEl.classList.toggle('is-over', overPct > 0.5);
  const statusEl = document.getElementById('clientStatus');
  if(overPct > 0.5){
    statusEl.textContent = `План перевыполнен на ${overPct.toFixed(0)}%`;
    statusEl.className = 'client-status is-over';
  }else if(done){
    statusEl.textContent = 'Цель достигнута';
    statusEl.className = 'client-status is-done';
  }else{
    statusEl.textContent = 'В процессе продвижения';
    statusEl.className = 'client-status';
  }
  document.getElementById('clientProgressTrack').innerHTML = progressSegments(pct);

  const videosBox = document.getElementById('clientVideos');
  const videos = Array.isArray(p.videoViews) ? p.videoViews : [];
  const links = videos.filter(v => v && typeof v === 'object' && v.link);
  if(links.length > 0){
    document.getElementById('clientVideosTitle').textContent = `Видео (${links.length})`;
    document.getElementById('clientVideoList').innerHTML = links.map((v, i) => `
      <a class="client-video-item" href="${escapeAttr(v.link)}" target="_blank" rel="noopener">
        <span>Видео ${i + 1}</span>
        <span class="mono">${Number.isFinite(v.views) ? formatNumber(v.views) + ' пр.' : ''}</span>
      </a>
    `).join('');
    videosBox.hidden = false;
  }else{
    videosBox.hidden = true;
  }
}

function showClientError(message){
  document.getElementById('clientLoading').hidden = true;
  document.getElementById('clientCard').hidden = true;
  const errorBox = document.getElementById('clientError');
  errorBox.hidden = false;
  errorBox.querySelector('.client-footnote').innerHTML = message;
}

const urlClientId = new URLSearchParams(location.search).get('client');
if(urlClientId){
  initClientView(urlClientId);
}else{
  initGate();
}

/* ---------------- rendering ---------------- */

const els = {
  statEarned: document.getElementById('statEarned'),
  statClients: document.getElementById('statClients'),
  statOrders: document.getElementById('statOrders'),
  statViews: document.getElementById('statViews'),
  tariffRow: document.getElementById('tariffRow'),
  projectList: document.getElementById('projectList'),
  projectsCount: document.getElementById('projectsCount'),
  emptyState: document.getElementById('emptyState'),
  reminderBanner: document.getElementById('reminderBanner'),
  reminderText: document.getElementById('reminderText'),
};

function renderTariffs(){
  els.tariffRow.innerHTML = TARIFFS.filter(t => t.type === 'views' && t.id !== 'custom').map(t => `
    <div class="tariff-card">
      <span class="tariff-views">${formatNumber(t.views)} просмотров</span>
      <span class="tariff-price mono">${formatRub(t.price)}</span>
      <span class="tariff-rate">${(t.price / (t.views/1000)).toFixed(2)} ₽ за 1000 просмотров</span>
    </div>
  `).join('') + TARIFFS.filter(t => t.type === 'flat').map(t => `
    <div class="tariff-card tariff-card-flat">
      <span class="tariff-views">${t.label}</span>
      <span class="tariff-price mono">${formatRub(t.price)}</span>
      <span class="tariff-rate">разовая услуга, не зависит от просмотров</span>
    </div>
  `).join('') + `
    <div class="tariff-card">
      <span class="tariff-views">Свой вариант</span>
      <span class="tariff-price mono">по договорённости</span>
      <span class="tariff-rate">задайте цель и цену вручную при создании проекта</span>
    </div>
  `;
}

function renderStats(){
  const earned = state.projects.reduce((s, p) => s + (p.price || 0), 0);
  const activeClients = state.projects.filter(p => p.current < p.target).length;
  const orders = state.projects.length;
  const totalViews = state.projects
    .filter(p => p.type !== 'flat')
    .reduce((s, p) => s + (p.current || 0), 0);

  els.statEarned.textContent = formatRub(earned);
  els.statClients.textContent = formatNumber(activeClients);
  els.statOrders.textContent = formatNumber(orders);
  els.statViews.textContent = formatNumber(totalViews);
}

function progressSegments(pct){
  const segCount = 20;
  const filled = Math.round((Math.min(pct, 100) / 100) * segCount);
  let html = '';
  for(let i = 0; i < segCount; i++){
    const isFilled = i < filled;
    const over = pct > 100;
    html += `<span class="progress-seg${isFilled ? ' filled' : ''}${isFilled && over ? ' over' : ''}"></span>`;
  }
  return html;
}

function pluralProjects(n){
  const mod10 = n % 10, mod100 = n % 100;
  if(mod10 === 1 && mod100 !== 11) return 'проект';
  if([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'проекта';
  return 'проектов';
}

function renderProjects(){
  const list = state.projects.slice().sort((a, b) => b.createdAt - a.createdAt);
  els.projectsCount.textContent = `${state.projects.length} ${pluralProjects(state.projects.length)}`;

  if(list.length === 0){
    els.projectList.innerHTML = '';
    els.emptyState.classList.add('show');
    return;
  }
  els.emptyState.classList.remove('show');

  els.projectList.innerHTML = list.map(p => {
    const isFlat = p.type === 'flat';
    const pct = p.target > 0 ? (p.current / p.target) * 100 : 0;
    const done = isFlat ? true : p.current >= p.target;
    const platformBadge = p.platform === 'tiktok'
      ? '<span class="badge badge-tiktok">TikTok</span>'
      : p.platform === 'youtube'
        ? '<span class="badge badge-youtube">YouTube</span>'
        : '';
    const serviceLabel = TARIFFS.find(t => t.id === p.tariffId && t.type === 'flat')?.label;
    const serviceBadge = isFlat ? `<span class="badge badge-service">${serviceLabel || 'Разовая услуга'}</span>` : '';
    const overPct = pct - 100;
    const doneBadge = isFlat ? '' :
      overPct > 0.5 ? `<span class="badge badge-over">Перевыполнено на ${overPct.toFixed(0)}%</span>` :
      done ? '<span class="badge badge-done">Цель достигнута</span>' : '';

    const actionsHtml = isFlat
      ? `<button class="btn btn-danger-ghost btn-small" data-action="delete" data-id="${p.id}">Удалить</button>`
      : `
        <button class="btn btn-primary btn-small" data-action="update" data-id="${p.id}">Обновить просмотры</button>
        <button class="btn btn-ghost btn-small" data-action="client-link" data-id="${p.id}">Ссылка клиенту</button>
        <button class="btn btn-danger-ghost btn-small" data-action="delete" data-id="${p.id}">Удалить</button>
      `;

    const bodyHtml = isFlat
      ? `<div class="flat-note">Разовая услуга — оплата фиксированная, просмотры не считаются.</div>`
      : `
        <div class="progress-wrap">
          <div class="progress-track">${progressSegments(pct)}</div>
          <div class="progress-labels">
            <span>${formatNumber(p.current)} / ${formatNumber(p.target)} просмотров</span>
            <span class="pct">${pct.toFixed(1).replace('.0','')}%</span>
          </div>
        </div>
      `;

    return `
      <article class="project-card${done ? ' is-done' : ''}${isFlat ? ' is-flat' : ''}">
        <div class="project-top">
          <div class="project-info">
            <span class="project-name">${escapeHtml(p.name)}</span>
            <div class="project-meta">
              ${serviceBadge}
              ${platformBadge}
              <span class="badge badge-price">${formatRub(p.price)}</span>
              ${doneBadge}
              <a href="${escapeAttr(p.link)}" target="_blank" rel="noopener">открыть видео →</a>
            </div>
          </div>
          <div class="project-actions">
            ${actionsHtml}
          </div>
        </div>
        ${bodyHtml}
      </article>
    `;
  }).join('');
}

function renderAll(){
  renderTariffs();
  renderStats();
  renderProjects();
  populateTariffSelect();
  checkReminder();
}

/* ---------------- reminder ---------------- */

function checkReminder(){
  const today = todayStr();
  const stale = state.projects.filter(p => p.current < p.target && p.lastUpdated !== today);
  if(stale.length === 0 || sessionStorage.getItem('reminderDismissed') === today){
    els.reminderBanner.hidden = true;
    return;
  }
  els.reminderText.textContent = `Не обновлены сегодня: ${stale.map(p => p.name).join(', ')}.`;
  els.reminderBanner.hidden = false;
}

document.getElementById('reminderDismiss').addEventListener('click', () => {
  sessionStorage.setItem('reminderDismissed', todayStr());
  els.reminderBanner.hidden = true;
});

/* ---------------- new project modal ---------------- */

const projectModalOverlay = document.getElementById('projectModalOverlay');
const projectForm = document.getElementById('projectForm');
const fieldTariff = document.getElementById('fieldTariff');
const customTargetWrap = document.getElementById('customTargetWrap');
const customPriceWrap = document.getElementById('customPriceWrap');
const startViewsWrap = document.getElementById('startViewsWrap');

function populateTariffSelect(){
  const viewsOptions = TARIFFS.filter(t => t.type === 'views' && t.id !== 'custom').map(t =>
    `<option value="${t.id}">${formatNumber(t.views)} просмотров — ${formatRub(t.price)}</option>`
  ).join('');
  const flatOptions = TARIFFS.filter(t => t.type === 'flat').map(t =>
    `<option value="${t.id}">${t.label} — ${formatRub(t.price)}</option>`
  ).join('');
  fieldTariff.innerHTML = `
    <optgroup label="По просмотрам">${viewsOptions}</optgroup>
    <optgroup label="Разовые услуги">${flatOptions}</optgroup>
    <option value="custom">Свой вариант (по просмотрам)</option>
  `;
}

fieldTariff.addEventListener('change', () => {
  const selected = TARIFFS.find(t => t.id === fieldTariff.value);
  const isCustom = fieldTariff.value === 'custom';
  const isFlat = selected && selected.type === 'flat';
  customTargetWrap.hidden = !isCustom;
  customPriceWrap.hidden = !isCustom;
  startViewsWrap.hidden = isFlat;
});

function openProjectModal(){
  projectForm.reset();
  fieldTariff.value = TARIFFS[0].id;
  customTargetWrap.hidden = true;
  customPriceWrap.hidden = true;
  startViewsWrap.hidden = false;
  projectModalOverlay.hidden = false;
  document.getElementById('fieldName').focus();
}
function closeProjectModal(){ projectModalOverlay.hidden = true; }

document.getElementById('openNewProjectBtn').addEventListener('click', openProjectModal);
document.getElementById('emptyAddBtn').addEventListener('click', openProjectModal);
document.getElementById('closeProjectModal').addEventListener('click', closeProjectModal);
document.getElementById('cancelProjectModal').addEventListener('click', closeProjectModal);
projectModalOverlay.addEventListener('click', e => { if(e.target === projectModalOverlay) closeProjectModal(); });

projectForm.addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('fieldName').value.trim();
  const link = document.getElementById('fieldLink').value.trim();
  const startViews = Number(document.getElementById('fieldStartViews').value) || 0;
  const tariffId = fieldTariff.value;
  const selectedTariff = TARIFFS.find(t => t.id === tariffId);
  const isFlat = selectedTariff && selectedTariff.type === 'flat';

  let target, price, current;
  if(isFlat){
    target = 1;
    current = 1;
    price = selectedTariff.price;
  }else if(tariffId === 'custom'){
    target = Number(document.getElementById('fieldCustomTarget').value) || 0;
    price = Number(document.getElementById('fieldCustomPrice').value) || 0;
    current = startViews;
  }else{
    target = selectedTariff.views;
    price = selectedTariff.price;
    current = startViews;
  }
  if(!name || !link || target <= 0) return;

  const saveBtn = document.getElementById('saveProjectBtn');
  saveBtn.disabled = true;
  try{
    await projectsRef.add({
      name,
      link,
      platform: detectPlatform(link),
      type: isFlat ? 'flat' : 'views',
      target,
      current,
      price,
      tariffId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastUpdated: todayStr(),
    });
    closeProjectModal();
  }catch(err){
    alert('Не удалось сохранить проект: ' + err.message);
  }finally{
    saveBtn.disabled = false;
  }
});

/* ---------------- update views modal ---------------- */

const updateModalOverlay = document.getElementById('updateModalOverlay');
const updateForm = document.getElementById('updateForm');
const updateVideoRowsEl = document.getElementById('updateVideoRows');
const addVideoRowBtn = document.getElementById('addVideoRowBtn');
const updateSumTotalEl = document.getElementById('updateSumTotal');
let updatingProjectId = null;
let updateRows = []; // [{link, views}]

function normalizeVideoRows(videoViews){
  if(!Array.isArray(videoViews) || videoViews.length === 0) return null;
  // backward compat: old data was a plain array of numbers
  return videoViews.map(v =>
    (typeof v === 'object' && v !== null) ? { link: v.link || '', views: v.views ?? '' } : { link: '', views: v }
  );
}

function renderUpdateRows(focusLast){
  updateVideoRowsEl.innerHTML = updateRows.map((row, i) => `
    <div class="video-row">
      <span class="video-row-num">${i + 1}.</span>
      <input type="url" class="video-row-link" data-idx="${i}"
             value="${escapeAttr(row.link || '')}"
             placeholder="Ссылка на видео ${i + 1}">
      <input type="number" min="0" class="video-row-input" data-idx="${i}"
             value="${row.views === '' || row.views === null || row.views === undefined ? '' : row.views}"
             placeholder="просмотры">
      <button type="button" class="video-row-remove" data-idx="${i}"
              aria-label="Удалить видео" ${updateRows.length <= 1 ? 'disabled' : ''}>×</button>
    </div>
  `).join('');
  updateSumDisplay();
  if(focusLast){
    const links = updateVideoRowsEl.querySelectorAll('.video-row-link');
    const last = links[links.length - 1];
    if(last) last.focus();
  }
}

function syncRowsFromDom(){
  const linkInputs = updateVideoRowsEl.querySelectorAll('.video-row-link');
  const viewInputs = updateVideoRowsEl.querySelectorAll('.video-row-input');
  updateRows = Array.from(viewInputs).map((inp, i) => ({
    link: linkInputs[i] ? linkInputs[i].value : '',
    views: inp.value,
  }));
}

function updateSumDisplay(){
  const inputs = updateVideoRowsEl.querySelectorAll('.video-row-input');
  let sum = 0;
  inputs.forEach(inp => { sum += Number(inp.value) || 0; });
  updateSumTotalEl.textContent = formatNumber(sum);
}

updateVideoRowsEl.addEventListener('input', e => {
  if(e.target.classList.contains('video-row-input')) updateSumDisplay();
});

updateVideoRowsEl.addEventListener('click', e => {
  const btn = e.target.closest('.video-row-remove');
  if(!btn || btn.disabled) return;
  syncRowsFromDom();
  const idx = Number(btn.dataset.idx);
  updateRows.splice(idx, 1);
  renderUpdateRows();
});

addVideoRowBtn.addEventListener('click', () => {
  syncRowsFromDom();
  updateRows.push({ link: '', views: '' });
  renderUpdateRows(true);
});

function openUpdateModal(id){
  const p = state.projects.find(p => p.id === id);
  if(!p) return;
  updatingProjectId = id;
  document.getElementById('updateProjectName').textContent = p.name;
  updateRows = normalizeVideoRows(p.videoViews) || [{ link: p.link || '', views: p.current || '' }];
  renderUpdateRows();
  updateModalOverlay.hidden = false;
  const firstInput = updateVideoRowsEl.querySelector('.video-row-link');
  if(firstInput) firstInput.focus();
}
function closeUpdateModal(){ updateModalOverlay.hidden = true; updatingProjectId = null; updateRows = []; }

document.getElementById('closeUpdateModal').addEventListener('click', closeUpdateModal);
document.getElementById('cancelUpdateModal').addEventListener('click', closeUpdateModal);
updateModalOverlay.addEventListener('click', e => { if(e.target === updateModalOverlay) closeUpdateModal(); });

updateForm.addEventListener('submit', async e => {
  e.preventDefault();
  if(!updatingProjectId) { closeUpdateModal(); return; }
  syncRowsFromDom();
  const videos = updateRows
    .map(r => ({ link: String(r.link || '').trim(), views: Number(String(r.views).trim()) }))
    .filter(r => r.link !== '' || Number.isFinite(r.views));

  const validVideos = videos.map(v => ({
    link: v.link,
    views: Number.isFinite(v.views) && v.views >= 0 ? v.views : 0,
  }));

  if(validVideos.length === 0){
    alert('Добавьте хотя бы одно видео со ссылкой или просмотрами.');
    return;
  }
  const sum = validVideos.reduce((a, v) => a + v.views, 0);
  try{
    await projectsRef.doc(updatingProjectId).update({
      current: sum,
      videoViews: validVideos,
      lastUpdated: todayStr(),
    });
  }catch(err){
    alert('Не удалось сохранить: ' + err.message);
  }
  closeUpdateModal();
});

/* ---------------- project list actions (delegated) ---------------- */

els.projectList.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if(action === 'update'){
    openUpdateModal(id);
  }else if(action === 'client-link'){
    const link = buildClientLink(id);
    try{
      await navigator.clipboard.writeText(link);
      showToast('Ссылка для клиента скопирована');
    }catch(err){
      window.prompt('Скопируйте ссылку вручную:', link);
    }
  }else if(action === 'delete'){
    const p = state.projects.find(p => p.id === id);
    if(p && confirm(`Удалить проект «${p.name}»? Это удалит его у вас обоих без возможности восстановления.`)){
      try{
        await projectsRef.doc(id).delete();
      }catch(err){
        alert('Не удалось удалить: ' + err.message);
      }
    }
  }
});

/* ---------------- settings modal ---------------- */

const settingsModalOverlay = document.getElementById('settingsModalOverlay');

document.getElementById('openSettingsBtn').addEventListener('click', () => { settingsModalOverlay.hidden = false; });
document.getElementById('closeSettingsModal').addEventListener('click', () => { settingsModalOverlay.hidden = true; });
settingsModalOverlay.addEventListener('click', e => { if(e.target === settingsModalOverlay) settingsModalOverlay.hidden = true; });

document.getElementById('resetDataBtn').addEventListener('click', async () => {
  const typed = prompt('Это удалит ВСЕ проекты у вас обоих без возможности восстановления.\nЧтобы подтвердить, напишите слово УДАЛИТЬ:');
  if(typed !== 'УДАЛИТЬ') return;
  try{
    const snap = await projectsRef.get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    settingsModalOverlay.hidden = true;
  }catch(err){
    alert('Не удалось сбросить данные: ' + err.message);
  }
});
