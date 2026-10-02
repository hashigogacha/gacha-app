'use strict';

// ★ お問い合わせフォーム（GoogleフォームなどのURL）をここに入れてください。
//   空のままなら「お問い合わせ」リンクは表示されません。
const CONTACT_URL = '';

const $ = (id) => document.getElementById(id);

const state = {
  geo: null, // { lat, lng }
  pool: [], // 今回の検索結果すべて
  queue: [], // まだ出ていないお店（出る順）
  current: null,
  visited: new Set(), // この検索セッションで表示したお店のid
  origin: null,
  subShown: 0,
  subList: [],
  token: 0, // 古い検索結果を無視するための番号
  skip: null,
  cancelDrum: null,
  noticeTimer: null,
};

const SMOKE_LABEL = {
  all_no: '全席禁煙',
  partial: '禁煙席あり',
  smoking_ok: '喫煙可',
  unknown: '禁煙・喫煙は要確認',
};

/* ---------- 小さな道具 ---------- */

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '#';
  } catch (e) {
    return '#';
  }
}

function checkedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function show(which) {
  $('input-card').hidden = which !== 'input';
  $('slot-card').hidden = which !== 'slot';
  $('result-card').hidden = which !== 'result';
  window.scrollTo({ top: 0 });
}

function showFormError(msg) {
  const el = $('form-error');
  el.textContent = msg;
  el.hidden = false;
}

function hideFormError() {
  $('form-error').hidden = true;
}

function showNotice(msg) {
  const el = $('notice');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(state.noticeTimer);
  state.noticeTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function getFilters() {
  return {
    smoking: checkedValue('smoking'),
    range: checkedValue('range'),
    genre: $('genre').value,
    budget: $('budget').value,
    openNow: $('open-now').checked,
  };
}

function updateSummary() {
  const rangeText = document.querySelector('input[name="range"]:checked').nextElementSibling.textContent;
  const genreSel = $('genre');
  const genreText = genreSel.value ? genreSel.options[genreSel.selectedIndex].textContent : 'ジャンル指定なし';
  const openText = $('open-now').checked ? '営業中のみ' : '営業時間の指定なし';
  $('more-summary').textContent = `${rangeText}以内・${genreText}・${openText}`;
}

/* ---------- 検索 ---------- */

async function search(origin, opts = {}) {
  const token = ++state.token;
  const stay = !!opts.stay; // 失敗しても結果画面に戻る（ハシゴ・別の場所用）
  const f = getFilters();

  const params = new URLSearchParams();
  if (origin.lat !== undefined) {
    params.set('lat', origin.lat.toFixed(3)); // 約100m単位
    params.set('lng', origin.lng.toFixed(3));
  } else {
    params.set('station', origin.station);
  }
  params.set('range', f.range);
  if (f.genre) params.set('genre', f.genre);
  if (f.budget) params.set('budget', f.budget);
  if (f.smoking) params.set('smoking', f.smoking);
  if (f.openNow) params.set('openNow', '1');

  setSlot('お店を探しています…', false);
  show('slot');

  const fail = (msg) => {
    if (token !== state.token) return;
    if (stay && state.current) {
      show('result');
      showNotice(msg);
    } else {
      show('input');
      showFormError(msg);
    }
  };

  let data = null;
  try {
    const r = await fetch('/api/search?' + params.toString());
    data = await r.json().catch(() => null);
    if (!data) throw new Error('bad response');
  } catch (e) {
    fail('通信に失敗しました。電波の良い場所で、もう一度お試しください。');
    return;
  }
  if (token !== state.token) return;

  let results = data.success && Array.isArray(data.results) ? data.results : [];
  if (opts.exclude) results = results.filter((s) => !opts.exclude.has(s.id));
  if (results.length === 0) {
    const msg = data.success
      ? 'この近くに、まだ出ていないお店が見つかりませんでした。範囲を広げてお試しください。'
      : data.message || 'お店が見つかりませんでした。条件を変えてお試しください。';
    fail(msg);
    return;
  }

  state.origin = {
    ...origin,
    label: origin.label || (data.meta && data.meta.label) || '',
    alternatives: origin.type === 'text' && data.meta ? data.meta.alternatives || [] : [],
  };
  state.pool = results;
  const first = shuffle(results);
  const winner = first.shift();
  state.queue = first;
  startDraw(winner, 2600);
}

/* ---------- ドラムロール ---------- */

function setSlot(text, landed) {
  const el = $('slot-text');
  el.textContent = text;
  el.classList.toggle('landed', landed);
}

function startDraw(winner, totalMs) {
  const names = shuffle(state.pool.filter((s) => s.id !== winner.id).map((s) => s.name)).slice(0, 40);
  if (names.length === 0) names.push(winner.name);

  show('slot');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  let timer = null;

  const done = () => {
    show('result');
    renderResult(winner);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    state.skip = null;
    setSlot(winner.name, true);
    timer = setTimeout(done, reduce ? 300 : 650);
  };

  state.cancelDrum = () => {
    finished = true;
    clearTimeout(timer);
    state.skip = null;
  };
  state.skip = finish;

  if (reduce) {
    finish();
    return;
  }

  let elapsed = 0;
  let delay = 60;
  let i = 0;
  const tick = () => {
    if (finished) return;
    if (elapsed >= totalMs) {
      finish();
      return;
    }
    setSlot(names[i++ % names.length], false);
    elapsed += delay;
    delay = Math.min(delay * 1.1, 230); // だんだん遅くなる
    timer = setTimeout(tick, delay);
  };
  tick();
}

/* ---------- 結果の表示 ---------- */

function smokeBadge(shop, extraClass) {
  const b = document.createElement('span');
  b.className = `badge smoke-${shop.smokeCls}` + (extraClass ? ' ' + extraClass : '');
  b.textContent = SMOKE_LABEL[shop.smokeCls] || SMOKE_LABEL.unknown;
  return b;
}

function renderResult(shop) {
  state.current = shop;
  state.visited.add(shop.id);

  // 場所の表示
  const o = state.origin;
  $('res-place').textContent = `検索場所：${o.label}（候補${state.pool.length}件）`;
  const altBox = $('alt-places');
  const altList = $('alt-list');
  altList.replaceChildren();
  const alts = o.alternatives || [];
  alts.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    b.addEventListener('click', () => {
      state.visited.clear();
      search({ type: 'point', lat: a.lat, lng: a.lng, label: `${a.label}周辺` }, { stay: true });
    });
    altList.append(b);
  });
  altBox.hidden = alts.length === 0;

  // お店の情報
  const img = $('res-img');
  const wrap = $('res-photo-wrap');
  wrap.hidden = !shop.photo;
  img.onerror = () => { wrap.hidden = true; };
  img.src = shop.photo || '';
  img.alt = shop.photo ? `${shop.name}の写真` : '';

  $('res-genre').textContent = shop.genre;
  const smoke = $('res-smoke');
  smoke.className = `badge smoke-${shop.smokeCls}`;
  smoke.textContent = SMOKE_LABEL[shop.smokeCls] || SMOKE_LABEL.unknown;

  $('res-name').textContent = shop.name;
  $('res-catch').textContent = shop.catch;
  $('res-catch').hidden = !shop.catch;

  const dist = $('res-distance');
  dist.replaceChildren();
  if (shop.distance !== null && shop.distance !== undefined) {
    dist.append(`検索地点から約${shop.distance}m（徒歩約${shop.walkMin}分）`);
  } else if (shop.access) {
    dist.append(shop.access);
  } else {
    dist.append('情報なし');
  }
  if (shop.access && shop.distance !== null && shop.distance !== undefined) {
    const small = document.createElement('small');
    small.textContent = shop.access;
    dist.append(small);
  }

  $('res-budget').textContent = shop.budget || '情報なし';

  let openText = '営業時間は下の詳細をご確認ください';
  if (shop.openStatus === 'open') {
    openText = shop.closesAt ? `営業中（${shop.closesAt}まで）` : '営業中';
  }
  $('res-open').textContent = openText;
  $('res-smoke-text').textContent = shop.smoking || '情報なし';
  const hours = [shop.openText && `【営業時間】\n${shop.openText}`, shop.closeText && `【定休日】${shop.closeText}`]
    .filter(Boolean)
    .join('\n');
  $('res-hours').textContent = hours || '情報なし';

  $('res-hp-link').href = safeUrl(shop.url);
  $('res-map-link').href =
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${shop.name} ${shop.address}`);

  $('hashigo-btn').disabled = shop.lat === null || shop.lat === undefined;
  renderSubCandidates(true);
}

function candidateItem(shop) {
  const li = document.createElement('li');
  li.className = 'cand';

  const thumb = document.createElement('div');
  thumb.className = 'cand-thumb';
  if (shop.photo) {
    const im = document.createElement('img');
    im.src = shop.photo;
    im.alt = '';
    im.loading = 'lazy';
    im.addEventListener('error', () => im.remove());
    thumb.append(im);
  }

  const info = document.createElement('div');
  info.className = 'cand-info';
  const h = document.createElement('h4');
  h.textContent = shop.name;
  const p = document.createElement('p');
  p.textContent = [shop.genre, shop.budget, shop.distance != null ? `${shop.distance}m` : '']
    .filter(Boolean)
    .join('・');
  info.append(h, p, smokeBadge(shop));

  const a = document.createElement('a');
  a.className = 'cand-link';
  a.href = safeUrl(shop.url);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = '詳細';
  a.setAttribute('aria-label', `${shop.name}の詳細`);

  li.append(thumb, info, a);
  return li;
}

function renderSubCandidates(reset) {
  const list = $('cand-list');
  if (reset) {
    list.replaceChildren();
    const queued = new Set(state.queue.map((s) => s.id));
    const seen = state.pool.filter((s) => s.id !== state.current.id && !queued.has(s.id));
    state.subList = [...state.queue, ...seen];
    state.subShown = 0;
  }
  const next = state.subList.slice(state.subShown, state.subShown + 5);
  next.forEach((s) => list.append(candidateItem(s)));
  state.subShown += next.length;

  const remaining = state.subList.length - state.subShown;
  $('sub-section').hidden = state.subList.length === 0;
  const more = $('more-btn');
  more.hidden = remaining <= 0;
  more.textContent = `さらに表示（残り${remaining}件）`;
}

/* ---------- ボタンの動き ---------- */

function retry() {
  if (state.pool.length <= 1) {
    showNotice('この条件では候補が1件だけです。条件を変えて、もう一度お試しください。');
    return;
  }
  if (state.queue.length === 0) {
    state.queue = shuffle(state.pool.filter((s) => s.id !== state.current.id));
    showNotice('すべての候補を一巡したので、最初から選び直しています。');
  }
  const winner = state.queue.shift();
  startDraw(winner, 1500);
}

function hashigo() {
  const cur = state.current;
  if (!cur || cur.lat === null || cur.lat === undefined) return;
  search(
    { type: 'point', lat: cur.lat, lng: cur.lng, label: `「${cur.name}」の近く` },
    { stay: true, exclude: state.visited }
  );
}

function resetToInput() {
  state.token++; // 進行中の検索は無視する
  if (state.cancelDrum) state.cancelDrum();
  show('input');
}

/* ---------- 初期化 ---------- */

document.addEventListener('DOMContentLoaded', () => {
  // 現在地
  $('geo-btn').addEventListener('click', () => {
    const status = $('geo-status');
    if (!navigator.geolocation) {
      status.textContent = 'お使いのブラウザは位置情報に対応していません。駅名・地名を入力してください。';
      return;
    }
    status.textContent = '現在地を取得しています…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        $('area').value = '';
        hideFormError();
        status.textContent = '現在地を取得しました。';
      },
      (err) => {
        state.geo = null;
        status.textContent =
          err.code === 1
            ? '位置情報の利用が許可されていません。駅名・地名を入力してください。'
            : '現在地を取得できませんでした。駅名・地名を入力してください。';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });

  $('area').addEventListener('input', () => {
    if ($('area').value) {
      state.geo = null;
      $('geo-status').textContent = '';
    }
    hideFormError();
  });

  // 条件の要約
  document.querySelectorAll('input[name="range"], #genre, #open-now').forEach((el) => {
    el.addEventListener('change', updateSummary);
  });
  updateSummary();

  // 検索
  $('gacha-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const station = $('area').value.trim();
    if (!station && !state.geo) {
      showFormError('駅名・地名を入力するか、「現在地を使う」を押してください。');
      $('area').focus();
      return;
    }
    hideFormError();
    state.visited.clear();
    const origin = station
      ? { type: 'text', station }
      : { type: 'geo', lat: state.geo.lat, lng: state.geo.lng, label: '現在地周辺' };
    search(origin);
  });

  $('skip-btn').addEventListener('click', () => { if (state.skip) state.skip(); });
  $('retry-btn').addEventListener('click', retry);
  $('hashigo-btn').addEventListener('click', hashigo);
  $('change-btn').addEventListener('click', resetToInput);
  $('more-btn').addEventListener('click', () => renderSubCandidates(false));

  // 規約ダイアログ
  const dialog = $('policy-dialog');
  $('open-policy').addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  $('close-policy').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // お問い合わせリンク
  if (CONTACT_URL) {
    const c = $('contact-link');
    c.href = CONTACT_URL;
    c.hidden = false;
  }
});
