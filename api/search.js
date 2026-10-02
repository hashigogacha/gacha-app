// api/search.js  (Vercel Serverless Function)
// 検索API：場所の解決 → ホットペッパー検索 → 距離・禁煙・営業中の絞り込み
// GETで受けることで、同じ条件の検索をVercelのCDNがキャッシュできます。

const HOTPEPPER = 'https://webservice.recruit.co.jp/hotpepper';
const DEFAULT_GENRES = ['G001', 'G002', 'G003', 'G004', 'G005', 'G006', 'G007', 'G008', 'G009', 'G013', 'G016', 'G017'];
const RANGE_CODE = { 300: 1, 500: 2, 1000: 3, 2000: 4 };
const PAGE_SIZE = 100;
const MAX_PAGES = 3; // 絞り込みで件数が足りないときだけ追加取得
const MIN_RESULTS = 20;
const MAX_RETURN = 100;
const SMOKING_MODES = ['', 'any_nonsmoking', 'all_nonsmoking', 'smoking'];
const DAYS = '月火水木金土日';

class ApiError extends Error {
  constructor(code) {
    super('hotpepper api error');
    this.code = code;
  }
}

/* ---------- 共通ヘルパー ---------- */

async function fetchJson(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------- アクセス制限（簡易） ----------
   サーバーレスは実行環境が複数に分かれるため、あくまで簡易的な歯止めです。
   本格的にはVercelのFirewall（Rate Limiting）の併用をおすすめします。 */
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < 60000)) hits.delete(k);
    }
  }
  return list.length > 30;
}

/* ---------- 日本時間・祝日 ---------- */

function jstNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get('year');
  const m = get('month');
  const d = get('day');
  return { y, m, d, minutes: get('hour') * 60 + get('minute') };
}

function dateInfo(y, m, d, delta = 0) {
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    wd: (t.getUTCDay() + 6) % 7, // 月=0 ... 日=6
  };
}

function ymd(o) {
  return `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`;
}

let holidayCache = { at: 0, set: new Set(), ok: false };
async function getHolidays() {
  if (Date.now() - holidayCache.at < 24 * 3600 * 1000) return holidayCache;
  try {
    const data = await fetchJson('https://holidays-jp.github.io/api/v1/date.json', 3000);
    holidayCache = { at: Date.now(), set: new Set(Object.keys(data)), ok: true };
  } catch (e) {
    // 取得に失敗しても検索は止めない（祝日なしとして扱い、1時間後に再試行）
    holidayCache = { at: Date.now() - 23 * 3600 * 1000, set: holidayCache.set, ok: false };
  }
  return holidayCache;
}

/* ---------- 営業時間の解析 ---------- */

function normalize(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[〜～‐–—―−－]/g, '~')
    .replace(/(\d)\s*-\s*(\d|翌)/g, '$1~$2')
    .replace(/\([^)]*\)/g, ' ') // (料理L.O. 22:00) などを除去
    .replace(/<br\s*\/?>/gi, ' ');
}

// 「月~金」「土、日、祝日」「祝前日」などの曜日表記を解析
function parseDays(label) {
  const s = label.replace(/曜日?/g, '').replace(/\s+/g, '');
  const days = new Set();
  let hol = false;
  let preHol = false;
  let any = false;
  let prev = null;
  let rangePending = false;
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('祝前日', i) || s.startsWith('祝前', i)) {
      preHol = true;
      any = true;
      i += s.startsWith('祝前日', i) ? 3 : 2;
      prev = null;
      continue;
    }
    if (s.startsWith('祝日', i) || s[i] === '祝') {
      hol = true;
      any = true;
      i += s.startsWith('祝日', i) ? 2 : 1;
      prev = null;
      continue;
    }
    if (s.startsWith('毎日', i)) {
      for (let k = 0; k < 7; k++) days.add(k);
      any = true;
      i += 2;
      continue;
    }
    if (s.startsWith('平日', i)) {
      for (let k = 0; k < 5; k++) days.add(k);
      any = true;
      i += 2;
      continue;
    }
    const idx = DAYS.indexOf(s[i]);
    if (idx >= 0) {
      if (rangePending && prev !== null) {
        let k = prev;
        for (let n = 0; n < 8; n++) {
          days.add(k);
          if (k === idx) break;
          k = (k + 1) % 7;
        }
      } else {
        days.add(idx);
      }
      prev = idx;
      rangePending = false;
      any = true;
      i++;
      continue;
    }
    if (s[i] === '~') rangePending = true;
    i++;
  }
  return { days, hol, preHol, any };
}

// 営業時間テキストを「曜日条件つきの時間帯」に分解
function parseSegments(openText) {
  const t = normalize(openText);
  const labelRe = /([月火水木金土日祝前毎平曜、,・\/~\s]+)\s*(?::|(?=\d))/g;
  const marks = [];
  let m;
  while ((m = labelRe.exec(t)) !== null) {
    if (/[月火水木金土日祝毎平]/.test(m[1])) {
      marks.push({ start: m.index, end: m.index + m[0].length, label: m[1] });
    }
  }
  const pieces = [];
  if (marks.length === 0) {
    pieces.push({ label: null, body: t });
  } else {
    if (marks[0].start > 0) pieces.push({ label: null, body: t.slice(0, marks[0].start) });
    marks.forEach((mk, i) => {
      const next = marks[i + 1] ? marks[i + 1].start : t.length;
      pieces.push({ label: mk.label, body: t.slice(mk.end, next) });
    });
  }
  const timeRe = /(\d{1,2}):(\d{2})\s*~\s*(翌)?\s*(\d{1,2}):(\d{2})/g;
  const segments = [];
  for (const p of pieces) {
    const ranges = [];
    let r;
    timeRe.lastIndex = 0;
    while ((r = timeRe.exec(p.body)) !== null) {
      const s = Number(r[1]) * 60 + Number(r[2]);
      let e = Number(r[4]) * 60 + Number(r[5]);
      if (r[3]) e += 1440;
      else if (e <= s) e += 1440;
      ranges.push({ s, e });
    }
    if (ranges.length === 0) continue;
    const d = p.label ? parseDays(p.label) : { days: new Set(), hol: false, preHol: false, any: false };
    segments.push({ all: !d.any, days: d.days, hol: d.hol, preHol: d.preHol, ranges });
  }
  return segments;
}

// 定休日テキストを解析
function parseClosed(closeText) {
  const info = { days: new Set(), hol: false, preHol: false, nth: [] };
  let t = normalize(closeText);
  if (!t.trim() || /年中無休|^\s*なし\s*$/.test(t)) return info;
  t = t.replace(/第\s*([1-5](?:[・、,\/]\s*[1-5])*)\s*([月火水木金土日])曜?日?/g, (_, nums, w) => {
    info.nth.push({ n: nums.split(/[・、,\/\s]+/).map(Number), wd: DAYS.indexOf(w) });
    return ' ';
  });
  t.replace(/([月火水木金土日])曜/g, (_, w) => {
    info.days.add(DAYS.indexOf(w));
    return '';
  });
  if (/祝前日/.test(t)) info.preHol = true;
  else if (/祝日/.test(t)) info.hol = true;
  if (info.days.size === 0 && /^[月火水木金土日祝前、,・\/~\s]+$/.test(t)) {
    const d = parseDays(t);
    d.days.forEach((x) => info.days.add(x));
    if (d.hol) info.hol = true;
    if (d.preHol) info.preHol = true;
  }
  return info;
}

function isClosedOn(info, date, holidays) {
  if (info.days.has(date.wd)) return true;
  if (info.hol && holidays.has(ymd(date))) return true;
  if (info.preHol && holidays.has(ymd(dateInfo(date.y, date.m, date.d, 1)))) return true;
  const nth = Math.ceil(date.d / 7);
  return info.nth.some((x) => x.wd === date.wd && x.n.includes(nth));
}

function rangesFor(segments, closedInfo, date, holidays) {
  if (isClosedOn(closedInfo, date, holidays)) return [];
  const isHol = holidays.has(ymd(date));
  const isPre = holidays.has(ymd(dateInfo(date.y, date.m, date.d, 1)));
  let segs = [];
  if (isHol) segs = segments.filter((s) => s.hol);
  if (segs.length === 0 && isPre) segs = segments.filter((s) => s.preHol);
  if (segs.length === 0) segs = segments.filter((s) => s.all || s.days.has(date.wd));
  return segs.flatMap((s) => s.ranges);
}

function fmtTime(min, spill) {
  const h = Math.floor(min / 60);
  const mm = String(min % 60).padStart(2, '0');
  if (spill) return `${h % 24}:${mm}`;
  if (min === 1440) return '24:00';
  if (min > 1440) return `翌${h - 24}:${mm}`;
  return `${h}:${mm}`;
}

// 現在営業中か判定：{ status: 'open' | 'closed' | 'unknown', closesAt }
function checkOpen(openText, closeText, now, holidays) {
  const t = normalize(openText);
  const segments = parseSegments(openText);
  const closedInfo = parseClosed(closeText);
  const today = dateInfo(now.y, now.m, now.d);
  if (segments.length === 0) {
    if (/24時間/.test(t) && !isClosedOn(closedInfo, today, holidays)) return { status: 'open', closesAt: null };
    return { status: 'unknown', closesAt: null };
  }
  const yesterday = dateInfo(now.y, now.m, now.d, -1);
  for (const r of rangesFor(segments, closedInfo, today, holidays)) {
    if (now.minutes >= r.s && now.minutes < r.e) return { status: 'open', closesAt: fmtTime(r.e, false) };
  }
  for (const r of rangesFor(segments, closedInfo, yesterday, holidays)) {
    if (r.e > 1440 && now.minutes + 1440 >= r.s && now.minutes + 1440 < r.e) {
      return { status: 'open', closesAt: fmtTime(r.e - 1440, true) };
    }
  }
  return { status: 'closed', closesAt: null };
}

/* ---------- 禁煙・喫煙の分類 ---------- */

function classifySmoking(text) {
  const t = String(text || '').normalize('NFKC');
  if (!t.trim()) return 'unknown';
  if (/全面禁煙|全席禁煙|完全禁煙|店内禁煙|禁煙席のみ/.test(t)) return 'all_no';
  if (/禁煙席なし|禁煙席無し|禁煙席は?ない|全席喫煙|全面喫煙|喫煙のみ/.test(t)) return 'smoking_ok';
  if (/禁煙|分煙/.test(t)) return 'partial';
  if (/喫煙/.test(t)) return 'smoking_ok';
  return 'unknown';
}

function passesSmoking(cls, mode) {
  if (!mode) return true;
  if (mode === 'any_nonsmoking') return cls === 'all_no' || cls === 'partial';
  if (mode === 'all_nonsmoking') return cls === 'all_no';
  if (mode === 'smoking') return cls === 'partial' || cls === 'smoking_ok';
  return true;
}

/* ---------- 場所の解決 ---------- */

async function resolvePlace(input, apiKey) {
  const name = input.replace(/駅$/, '').trim();
  if (!name) return null;
  const enc = encodeURIComponent;

  // 1. 駅名（HeartRails Express）
  try {
    const d = await fetchJson(`https://express.heartrails.com/api/json?method=getStations&name=${enc(name)}`);
    const list = d?.response?.station;
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0];
      const seen = new Set([first.prefecture + first.name]);
      const alternatives = [];
      for (const s of list.slice(1)) {
        const k = s.prefecture + s.name;
        if (seen.has(k)) continue;
        seen.add(k);
        alternatives.push({ label: `${s.name}駅（${s.prefecture}）`, lat: Number(s.y), lng: Number(s.x) });
      }
      return {
        mode: 'point',
        lat: Number(first.y),
        lng: Number(first.x),
        label: `${first.name}駅周辺（${first.prefecture}）`,
        alternatives: alternatives.slice(0, 4),
      };
    }
  } catch (e) { /* 次の方法へ */ }

  // 2. ホットペッパーのエリア名（小エリア → 中エリア）
  for (const kind of ['small', 'middle']) {
    try {
      const d = await fetchJson(`${HOTPEPPER}/${kind}_area/v1/?key=${apiKey}&keyword=${enc(name)}&format=json`);
      const arr = d?.results?.[`${kind}_area`];
      if (Array.isArray(arr) && arr.length > 0) {
        const hit = arr.find((a) => a.name === name) || arr[0];
        return { mode: 'area', areaParam: `${kind}_area`, areaCode: hit.code, label: `${hit.name}エリア`, alternatives: [] };
      }
    } catch (e) { /* 次の方法へ */ }
  }

  // 3. 住所・地名（国土地理院）
  try {
    const g = await fetchJson(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${enc(input)}`);
    if (Array.isArray(g) && g.length > 0) {
      const toPlace = (x) => ({
        lat: Number(x.geometry.coordinates[1]),
        lng: Number(x.geometry.coordinates[0]),
        label: x.properties?.title || input,
      });
      const first = toPlace(g[0]);
      const seen = new Set([first.label]);
      const alternatives = [];
      for (const x of g.slice(1)) {
        const p = toPlace(x);
        if (seen.has(p.label)) continue;
        seen.add(p.label);
        alternatives.push(p);
      }
      return { mode: 'point', lat: first.lat, lng: first.lng, label: `${first.label}周辺`, alternatives: alternatives.slice(0, 3) };
    }
  } catch (e) { /* 見つからない扱い */ }

  return null;
}

/* ---------- ホットペッパー検索 ---------- */

async function fetchChunk(base, codes, start) {
  const p = new URLSearchParams(base);
  p.set('genre', codes.join(','));
  p.set('start', String(start));
  const data = await fetchJson(`${HOTPEPPER}/gourmet/v1/?${p.toString()}`);
  const err = data?.results?.error;
  if (err) {
    if (codes.length > 1) {
      // 複数ジャンル指定が通らない場合は、1つずつ取り直す
      const parts = await Promise.all(codes.map((c) => fetchChunk(base, [c], start)));
      return { shops: parts.flatMap((x) => x.shops), full: parts.some((x) => x.full) };
    }
    throw new ApiError(Array.isArray(err) ? err[0]?.code : err.code);
  }
  const shops = data?.results?.shop || [];
  return { shops, full: Number(data?.results?.results_returned) >= PAGE_SIZE };
}

async function searchShops({ apiKey, place, rangeM, genres, budget, keep }) {
  const base = new URLSearchParams({ key: apiKey, format: 'json', count: String(PAGE_SIZE) });
  if (place.mode === 'point') {
    base.set('lat', String(place.lat));
    base.set('lng', String(place.lng));
    base.set('range', String(RANGE_CODE[rangeM]));
  } else {
    base.set(place.areaParam, place.areaCode);
  }
  if (budget) base.set('budget', budget);

  const chunks = [];
  for (let i = 0; i < genres.length; i += 2) chunks.push(genres.slice(i, i + 2));

  const byId = new Map();
  let active = chunks;
  for (let page = 0; page < MAX_PAGES && active.length > 0; page++) {
    const out = await Promise.all(active.map((c) => fetchChunk(base, c, page * PAGE_SIZE + 1)));
    const next = [];
    out.forEach((o, i) => {
      o.shops.forEach((s) => byId.set(s.id, s));
      if (o.full) next.push(active[i]);
    });
    active = next;
    const kept = [...byId.values()].filter(keep);
    if (kept.length >= MIN_RESULTS) break;
  }
  return [...byId.values()];
}

/* ---------- ハンドラー ---------- */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, message: 'アクセスが集中しています。少し待ってからもう一度お試しください。' });
  }

  const apiKey = process.env.HOTPEPPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, message: 'サーバーの設定が完了していません。' });
  }

  // 入力の検証
  const q = req.query || {};
  const station = String(q.station || '').trim().slice(0, 50);
  let lat = Number(q.lat);
  let lng = Number(q.lng);
  const hasCoords = q.lat !== undefined && q.lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng);
  if (hasCoords && (lat < 20 || lat > 46 || lng < 122 || lng > 154)) {
    return res.status(400).json({ success: false, message: '日本国内の場所を指定してください。' });
  }
  if (!hasCoords && !station) {
    return res.status(400).json({ success: false, message: '駅名・地名を入力するか、現在地を取得してください。' });
  }
  const rangeM = Object.keys(RANGE_CODE).includes(String(q.range)) ? Number(q.range) : 500;
  const smoking = SMOKING_MODES.includes(String(q.smoking || '')) ? String(q.smoking || '') : '';
  const openNow = q.openNow === '1' || q.openNow === 'true';
  const budget = /^B\d{3}$/.test(String(q.budget || '')) ? String(q.budget) : '';
  let genres = String(q.genre || '')
    .split(',')
    .map((g) => g.trim())
    .filter((g) => /^G\d{3}$/.test(g))
    .slice(0, 6);
  if (genres.length === 0) genres = DEFAULT_GENRES;

  try {
    // 場所の解決
    let place;
    if (hasCoords) {
      lat = Math.round(lat * 1000) / 1000; // 約100m単位に丸める（キャッシュ共有とプライバシーのため）
      lng = Math.round(lng * 1000) / 1000;
      place = { mode: 'point', lat, lng, label: '指定した場所の周辺', alternatives: [] };
    } else {
      place = await resolvePlace(station, apiKey);
    }
    if (!place) {
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json({
        success: false,
        message: '場所が見つかりませんでした。駅名や地名を変えてお試しください（例：新宿、下北沢、台東区）。',
      });
    }

    // 絞り込み条件
    const now = jstNow();
    const holidays = await getHolidays();
    const decorate = (shop) => {
      const sLat = Number(shop.lat);
      const sLng = Number(shop.lng);
      const dist = place.mode === 'point' && Number.isFinite(sLat) && Number.isFinite(sLng)
        ? Math.round(distanceM(place.lat, place.lng, sLat, sLng))
        : null;
      return {
        shop,
        dist,
        smokeCls: classifySmoking(shop.non_smoking),
        open: checkOpen(shop.open, shop.close, now, holidays.set),
      };
    };
    const keep = (shop) => {
      const x = decorate(shop);
      if (place.mode === 'point' && (x.dist === null || x.dist > rangeM)) return false;
      if (!passesSmoking(x.smokeCls, smoking)) return false;
      if (openNow && x.open.status !== 'open') return false;
      return true;
    };

    const raw = await searchShops({ apiKey, place, rangeM, genres, budget, keep });
    const results = raw
      .map(decorate)
      .filter((x) => {
        if (place.mode === 'point' && (x.dist === null || x.dist > rangeM)) return false;
        if (!passesSmoking(x.smokeCls, smoking)) return false;
        if (openNow && x.open.status !== 'open') return false;
        return true;
      })
      .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0))
      .slice(0, MAX_RETURN)
      .map(({ shop, dist, smokeCls, open }) => ({
        id: shop.id,
        name: shop.name,
        genre: shop.genre?.name || 'グルメ',
        catch: shop.catch || '',
        photo: shop.photo?.pc?.l || shop.photo?.mobile?.l || '',
        access: shop.mobile_access || shop.access || '',
        budget: shop.budget?.average || shop.budget?.name || '',
        smoking: shop.non_smoking || '',
        smokeCls,
        openText: shop.open || '',
        closeText: shop.close || '',
        openStatus: open.status,
        closesAt: open.closesAt,
        address: shop.address || '',
        lat: Number(shop.lat) || null,
        lng: Number(shop.lng) || null,
        distance: dist,
        walkMin: dist === null ? null : Math.max(1, Math.round(dist / 80)),
        url: shop.urls?.pc || '',
      }));

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    if (results.length === 0) {
      const hints = [];
      if (openNow) hints.push('「営業中のみ」');
      if (smoking) hints.push('禁煙・喫煙の指定');
      return res.status(200).json({
        success: false,
        message: `条件に合うお店が見つかりませんでした。${hints.length ? hints.join('や') + 'を外すか、' : ''}範囲を広げてお試しください。`,
      });
    }
    return res.status(200).json({
      success: true,
      results,
      meta: { label: place.label, mode: place.mode, total: results.length, alternatives: place.alternatives || [] },
    });
  } catch (err) {
    console.error('search failed', err?.name, err?.code); // キーや位置情報はログに出さない
    if (err instanceof ApiError && err.code === 3000) {
      return res.status(400).json({ success: false, message: '検索条件が正しくありません。条件を変えてお試しください。' });
    }
    return res.status(502).json({ success: false, message: 'お店の情報を取得できませんでした。時間をおいてもう一度お試しください。' });
  }
}
