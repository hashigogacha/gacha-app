let allFoundShops = [];
let historyIds = [];
let isRolling = false;
let userCoords = null;
let displayedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
  const gachaForm = document.getElementById('gacha-form');
  if (gachaForm) {
    gachaForm.addEventListener('submit', handleGachaSubmit);
  }

  const geoBtn = document.getElementById('geo-btn');
  if (geoBtn) {
    geoBtn.addEventListener('click', getLocation);
  }

  // 何軒目かボタンの切替処理
  const stepBtns = document.querySelectorAll('.btn-step');
  stepBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      stepBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const hiddenInput = document.getElementById('step-select');
      if (hiddenInput) {
        hiddenInput.value = e.target.getAttribute('data-value');
      }
    });
  });
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
      if (statusEl) statusEl.textContent = '現在地の取得に失敗しました。住所や駅名を入力してください。';
      userCoords = null;
    }
  );
}

async function handleGachaSubmit(e) {
  if (e) e.preventDefault();
  if (isRolling) return;

  const stationInput = document.getElementById('station-input');
  const station = stationInput ? stationInput.value.trim() : '';
  const step = document.getElementById('step-select').value;
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
    const payload = {
      step,
      range,
      genre,
      budget,
      smoking,
      openNow,
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

    allFoundShops = data.results;

    await startSlotAnimation(allFoundShops);
    showResultView();

  } catch (err) {
    alert(err.message || 'エラーが発生しました。もう一度お試しください。');
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

function showResultView() {
  if (allFoundShops.length === 0) return;

  const winner = allFoundShops[0];
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

  displayedCount = 0;
  const container = document.getElementById('candidate-list-container');
  if (container) container.innerHTML = '';
  
  const subCandidates = allFoundShops.slice(1, 21);
  if (subCandidates.length > 0) {
    document.getElementById('sub-candidates')?.classList.remove('hidden');
    loadMoreCandidates();
  } else {
    document.getElementById('sub-candidates')?.classList.add('hidden');
  }

  document.getElementById('slot-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.remove('hidden');
}

function loadMoreCandidates() {
  const subCandidates = allFoundShops.slice(1, 21);
  const container = document.getElementById('candidate-list-container');
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (!container) return;

  const nextBatch = subCandidates.slice(displayedCount, displayedCount + 5);
  
  if (displayedCount > 0) {
    const adDiv = document.createElement('div');
    adDiv.className = 'ad-box ad-slot sub-ad';
    adDiv.innerHTML = '<p>【スポンサーリンク（広告枠）】</p>';
    container.appendChild(adDiv);
  }

  const ul = document.createElement('ul');
  ul.className = 'candidate-list-ul';

  nextBatch.forEach((shop) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${shop.name}</strong> <span class="sub-genre">(${shop.genre || ''})</span><br><small>${shop.access || ''}</small>`;
    ul.appendChild(li);
  });

  container.appendChild(ul);
  displayedCount += nextBatch.length;

  if (displayedCount >= subCandidates.length) {
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
  } else {
    if (loadMoreBtn) loadMoreBtn.style.display = 'block';
  }
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
