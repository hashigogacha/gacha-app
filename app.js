let currentResults = [];
let historyIds = [];
let isRolling = false;
let userCoords = null;

document.addEventListener('DOMContentLoaded', () => {
  const gachaForm = document.getElementById('gacha-form');
  if (gachaForm) {
    gachaForm.addEventListener('submit', handleGachaSubmit);
  }

  const geoBtn = document.getElementById('geo-btn');
  if (geoBtn) {
    geoBtn.addEventListener('click', getLocation);
  }
});

function getLocation() {
  const statusEl = document.getElementById('geo-status');
  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = 'お使いのブラウザは現在地取得に対応していません';
    return;
  }

  if (statusEl) statusEl.textContent = '現在地を取得中...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      const stationInput = document.getElementById('station-input');
      if (stationInput) stationInput.value = '現在地周辺';
      if (statusEl) statusEl.textContent = '📍 現在地を取得しました！';
    },
    (error) => {
      if (statusEl) statusEl.textContent = '現在地の取得に失敗しました。駅名を入力してください。';
      userCoords = null;
    }
  );
}

async function handleGachaSubmit(e) {
  if (e) e.preventDefault();
  if (isRolling) return;

  const stationInput = document.getElementById('station-input');
  const station = stationInput ? stationInput.value.trim() : '';
  const genre = document.getElementById('genre-select').value;
  const budget = document.getElementById('budget-select').value;

  if (!station && !userCoords) {
    alert('駅名を入力するか、現在地を取得してください');
    return;
  }

  showSlotView();
  isRolling = true;

  try {
    const payload = {
      genre,
      budget,
      excludeIds: historyIds
    };

    if (station === '現在地周辺' && userCoords) {
      payload.lat = userCoords.lat;
      payload.lng = userCoords.lng;
    } else {
      payload.station = station;
    }

    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.success || !data.results || data.results.length === 0) {
      throw new Error(data.message || '該当するお店が見つかりませんでした');
    }

    currentResults = data.results;

    await startSlotAnimation();
    showResultView(currentResults);

  } catch (err) {
    alert(err.message || 'エラーが発生しました。もう一度お試しください。');
    showInputView();
  } finally {
    isRolling = false;
  }
}

function startSlotAnimation() {
  return new Promise((resolve) => {
    const slotText = document.getElementById('slot-text');
    const dummyNames = ['居酒屋 焼き鳥館', '個室ダイニング 宴', 'バル 恵比寿', '海鮮酒場 まぐろ', '串カツ 黄金', '個室居酒屋 桜'];
    let count = 0;

    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * dummyNames.length);
      if (slotText) slotText.textContent = dummyNames[randomIndex];
      count++;

      if (count > 25) {
        clearInterval(interval);
        resolve();
      }
    }, 80);
  });
}

function showSlotView() {
  document.getElementById('input-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.add('hidden');
  document.getElementById('slot-card')?.classList.remove('hidden');
}

function showInputView() {
  document.getElementById('slot-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.add('hidden');
  document.getElementById('input-card')?.classList.remove('hidden');
}

function showResultView(results) {
  const winner = results[0];
  historyIds.push(winner.id);

  setText('res-genre', winner.genre || '居酒屋');
  setText('res-name', winner.name || '店舗名');
  setText('res-catch', winner.catch || '');

  const imgEl = document.getElementById('res-img');
  if (imgEl) {
    imgEl.src = winner.photo || 'https://via.placeholder.com/400x250?text=No+Image';
    imgEl.alt = winner.name;
  }

  setText('res-access', winner.access || '情報なし');
  setText('res-budget', winner.budget || '情報なし');
  setText('res-hours', winner.open || '情報なし');

  const hpBtn = document.getElementById('res-hp-link');
  if (hpBtn) hpBtn.href = winner.urls?.pc || '#';

  const mapBtn = document.getElementById('res-map-link');
  if (mapBtn) {
    const query = encodeURIComponent(`${winner.name} ${winner.address || ''}`);
    mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  const shareText = encodeURIComponent(`【ハシゴ酒ガチャ】で引いたお店はこちら！\n『${winner.name}』\n#ハシゴ酒ガチャ`);
  const shareUrl = encodeURIComponent(window.location.href);

  const xBtn = document.getElementById('share-x');
  if (xBtn) xBtn.href = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;

  const lineBtn = document.getElementById('share-line');
  if (lineBtn) lineBtn.href = `https://social-plugins.line.me/lineit/share?url=${shareUrl}`;

  const candidateList = document.getElementById('candidate-list');
  if (candidateList) {
    candidateList.innerHTML = '';
    const subList = results.slice(1, 3);
    if (subList.length > 0) {
      subList.forEach((shop) => {
        const li = document.createElement('li');
        li.textContent = `🍺 ${shop.name} （${shop.genre || ''}）`;
        candidateList.appendChild(li);
      });
      document.getElementById('sub-candidates')?.classList.remove('hidden');
    } else {
      document.getElementById('sub-candidates')?.classList.add('hidden');
    }
  }

  document.getElementById('slot-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.remove('hidden');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function retryGacha() {
  handleGachaSubmit(null);
}

function resetGacha() {
  showInputView();
}
