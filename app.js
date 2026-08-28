let allFoundShops = [];
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

  // 何軒目か（ボタン切替）
  const stepBtns = document.querySelectorAll('.btn-step');
  stepBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      stepBtns.forEach(b => b.classList.remove('active'));
      target.classList.add('active');
      const hiddenInput = document.getElementById('step-select');
      if (hiddenInput) {
        hiddenInput.value = target.getAttribute('data-value');
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
      openNow
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

      if (count > 20) {
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
  setText('res-hours', winner.open || '情報なし');

  const hpBtn = document.getElementById('res-hp-link');
  if (hpBtn) hpBtn.href = winner.urls?.pc || '#';

  const mapBtn = document.getElementById('res-map-link');
  if (mapBtn) {
    const query = encodeURIComponent(`${winner.name} ${winner.address || ''}`);
    mapBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  document.getElementById('slot-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.remove('hidden');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function retryGacha() {
  if (allFoundShops.length > 0) {
    drawGachaAndShowResult();
  } else {
    handleGachaSubmit(null);
  }
}

function resetGacha() {
  showInputView();
}
