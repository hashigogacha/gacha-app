let allFoundShops = [];
let isRolling = false;
let userCoords = null;
let displayedCount = 0;
let currentSubCandidates = [];

document.addEventListener('DOMContentLoaded', () => {
  const gachaForm = document.getElementById('gacha-form');
  if (gachaForm) {
    gachaForm.addEventListener('submit', handleGachaSubmit);
  }

  const geoBtn = document.getElementById('geo-btn');
  if (geoBtn) {
    geoBtn.addEventListener('click', getLocation);
  }

  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadMoreCandidates);
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
      if (statusEl) statusEl.textContent = '現在地の取得に失敗しました。';
      userCoords = null;
    }
  );
}

async function handleGachaSubmit(e) {
  if (e) e.preventDefault();
  if (isRolling) return;

  const stationInput = document.getElementById('station-input');
  const station = stationInput ? stationInput.value.trim() : '';
  const range = document.getElementById('range-select').value;
  const genre = document.getElementById('genre-select').value;
  const budget = document.getElementById('budget-select').value;
  const smoking = document.getElementById('smoking-select').value;
  const openNow = document.getElementById('open-now-check').checked;

  if (!station && !userCoords) {
    alert('エリア（駅名や住所）を入力するか、現在地を取得してください');
    return;
  }

  showSlotView();
  isRolling = true;

  try {
    const payload = { range, genre, budget, smoking, openNow };

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

    allFoundShops = data.results;

    await startSlotAnimation(allFoundShops);
    drawGachaAndShowResult();

  } catch (err) {
    alert(err.message || 'エラーが発生しました。条件を変更してもう一度お試しください。');
    showInputView();
  } finally {
    isRolling = false;
  }
}

function startSlotAnimation(shops) {
  return new Promise((resolve) => {
    const slotText = document.getElementById('slot-text');
    let count = 0;

    const interval = setInterval(() => {
      const randomShop = shops[Math.floor(Math.random() * shops.length)];
      if (slotText) slotText.textContent = randomShop.name;
      count++;

      if (count > 15) { // 約1.2秒演出
        clearInterval(interval);
        resolve();
      }
    }, 80);
  });
}

function drawGachaAndShowResult() {
  if (allFoundShops.length === 0) {
    alert("候補のお店が見つかりませんでした。");
    showInputView();
    return;
  }

  const winner = allFoundShops[Math.floor(Math.random() * allFoundShops.length)];
  showResultView(winner);
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

function showResultView(winner) {
  setText('res-genre', winner.genre || '居酒屋');
  setText('res-name', winner.name || '店舗名');
  setText('res-catch', winner.catch || '');

  const imgEl = document.getElementById('res-img');
  if (imgEl) {
    imgEl.src = winner.photo || '';
    imgEl.alt = winner.name;
  }

  setText('res-access', winner.access || '情報なし');
  setText('res-budget', winner.budget || '情報なし');
  setText('res-smoking', winner.non_smoking || '情報なし');
  setText('res-hours', winner.open || '情報なし');

  const hpBtn = document.getElementById('res-hp-link');
  if (hpBtn) hpBtn.href = winner.urls?.pc || '#';

  const mapBtn = document.getElementById('res-map-link');
  if (mapBtn) {
    const query = encodeURIComponent(`${winner.name} ${winner.address || ''}`);
    mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  // 他候補リスト初期化＆初期5件オープン表示
  displayedCount = 0;
  currentSubCandidates = allFoundShops.filter(s => s.id !== winner.id);
  
  const container = document.getElementById('candidate-list-container');
  if (container) container.innerHTML = '';

  const subBox = document.getElementById('sub-candidates-section');

  if (currentSubCandidates.length > 0) {
    if (subBox) subBox.classList.remove('hidden');
    loadMoreCandidates(); // 初期表示で自動的に5件展開
  } else {
    if (subBox) subBox.classList.add('hidden');
  }

  document.getElementById('slot-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.remove('hidden');
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadMoreCandidates() {
  const container = document.getElementById('candidate-list-container');
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (!container) return;

  // 1回に5件ずつ追加取得
  const nextBatch = currentSubCandidates.slice(displayedCount, displayedCount + 5);

  if (nextBatch.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'candidate-list-ul';

    nextBatch.forEach((shop) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <a href="${shop.urls?.pc || '#'}" target="_blank" class="candidate-item-link">
          <strong>${shop.name}</strong> <span class="sub-genre">(${shop.genre || ''})</span><br>
          <span class="candidate-access">📍 ${shop.access || 'アクセス情報なし'}</span>
        </a>
      `;
      ul.appendChild(li);
    });

    container.appendChild(ul);
    displayedCount += nextBatch.length;

    // 5件ごとに広告枠を挿入
    const adDiv = document.createElement('div');
    adDiv.className = 'ad-box ad-slot inline-ad';
    adDiv.innerHTML = '<p>【スポンサーリンク（広告枠）】</p>';
    container.appendChild(adDiv);
  }

  // ボタンの表示/非表示切り替え
  if (loadMoreBtn) {
    if (displayedCount >= currentSubCandidates.length) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'block';
    }
  }
}

async function retryGacha() {
  if (isRolling) return;
  showSlotView();
  isRolling = true;

  await startSlotAnimation(allFoundShops);
  drawGachaAndShowResult();
  isRolling = false;
}

function resetGacha() {
  showInputView();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
