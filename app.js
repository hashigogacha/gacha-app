let allFoundShops = [];
let shopHistory = {}; // 出現回数を記憶して重み付け
let keptShop = null;  // キープ中の1軒目
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

  // 何軒目かボタンの切り替え処理
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

  const keepBtn = document.getElementById('keep-btn');
  if (keepBtn) keepBtn.addEventListener('click', toggleKeepShop);

  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) shareBtn.addEventListener('click', shareGachaResult);
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
    drawWeightedGachaAndShowResult();

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

      if (count > 25) {
        clearInterval(interval);
        resolve();
      }
    }, 80);
  });
}

function drawWeightedGachaAndShowResult() {
  let weightedPool = [];

  allFoundShops.forEach(shop => {
    if (keptShop && keptShop.id === shop.id) return;

    const count = shopHistory[shop.id] || 0;
    let weight = 10;
    if (count === 1) weight = 2;
    if (count >= 2) weight = 1;

    for (let i = 0; i < weight; i++) {
      weightedPool.push(shop);
    }
  });

  if (weightedPool.length === 0) {
    weightedPool = allFoundShops.filter(s => !keptShop || s.id !== keptShop.id);
  }

  if (weightedPool.length === 0) {
    alert("該当する候補のお店が見つかりませんでした。条件を変えてみてください。");
    showInputView();
    return;
  }

  const randomIndex = Math.floor(Math.random() * weightedPool.length);
  const winner = weightedPool[randomIndex];

  shopHistory[winner.id] = (shopHistory[winner.id] || 0) + 1;

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

  const keptArea = document.getElementById('kept-shop-area');
  const keepBtn = document.getElementById('keep-btn');
  if (keptShop) {
    if (keptArea) keptArea.classList.remove('hidden');
    setText('kept-name', keptShop.name);
    setText('kept-access', keptShop.access);
    const keptLink = document.getElementById('kept-hp-link');
    if (keptLink) keptLink.href = keptShop.urls?.pc || '#';
    if (keepBtn) keepBtn.textContent = "🔓 1軒目キープ解除";
  } else {
    if (keptArea) keptArea.classList.add('hidden');
    if (keepBtn) keepBtn.textContent = "🔒 1軒目をキープして次を探す";
  }

  displayedCount = 0;
  const container = document.getElementById('candidate-list-container');
  if (container) container.innerHTML = '';
  
  window.currentSubCandidates = allFoundShops.filter(s => s.id !== winner.id && (!keptShop || s.id !== keptShop.id));
  
  const subContainerBox = document.getElementById('sub-candidates');
  if (window.currentSubCandidates.length > 0) {
    if (subContainerBox) subContainerBox.classList.remove('hidden');
    loadMoreCandidates();
  } else {
    if (subContainerBox) subContainerBox.classList.add('hidden');
  }

  document.getElementById('slot-card')?.classList.add('hidden');
  document.getElementById('result-card')?.classList.remove('hidden');
  
  window.currentMainShop = winner;
}

function loadMoreCandidates() {
  const subCandidates = window.currentSubCandidates || [];
  const container = document.getElementById('candidate-list-container');
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (!container) return;

  const nextBatch = subCandidates.slice(displayedCount, displayedCount + 5);

  const ul = document.createElement('ul');
  ul.className = 'candidate-list-ul';

  nextBatch.forEach((shop) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <a href="${shop.urls?.pc || '#'}" target="_blank" style="color:var(--text); text-decoration:none; display:block;">
        <strong>${shop.name}</strong> <span class="sub-genre">(${shop.genre || ''})</span><br>
        <span style="font-size:0.8rem; color:var(--sub-text);">📍 ${shop.access || 'アクセス情報なし'}</span>
      </a>
    `;
    ul.appendChild(li);
  });

  container.appendChild(ul);
  displayedCount += nextBatch.length;

  if (loadMoreBtn) {
    if (displayedCount >= subCandidates.length) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'block';
    }
  }
}

function toggleKeepShop() {
  if (keptShop) {
    keptShop = null;
    alert("キープを解除しました。");
    if (window.currentMainShop) showResultView(window.currentMainShop);
  } else {
    if (window.currentMainShop) {
      keptShop = window.currentMainShop;
      alert("1軒目をキープしました！「もう一度ガチャを回す」で2軒目を探せます。");
      drawWeightedGachaAndShowResult();
    }
  }
}

function shareGachaResult() {
  const winner = window.currentMainShop;
  if (!winner) return;

  let text = `🍻 今日のハシゴ酒ガチャ結果！\n`;
  if (keptShop) text += `【1軒目】 ${keptShop.name}\n`;
  text += `【${keptShop ? '2軒目' : '決定'}】 ${winner.name}\n🚶 ${winner.access}\n\n詳細はこちら: ${winner.urls?.pc || ''}`;
  
  if (navigator.share) {
    navigator.share({
      title: 'ハシゴ酒ガチャ結果',
      text: text,
    }).catch(console.error);
  } else {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function retryGacha() {
  if (allFoundShops.length > 0) {
    drawWeightedGachaAndShowResult();
  } else {
    handleGachaSubmit(null);
  }
}

function resetGacha() {
  keptShop = null;
  shopHistory = {};
  showInputView();
}
