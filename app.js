let currentResults = [];
let currentCandidateIndex = 0;
let userLat = null;
let userLng = null;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('gacha-form');
  const geoBtn = document.getElementById('geo-btn');
  const loadMoreBtn = document.getElementById('load-more-btn');

  // モーダル制御
  const policyModal = document.getElementById('policy-modal');
  const openPolicyBtn = document.getElementById('open-policy-btn');
  const closePolicyBtn = document.getElementById('close-policy-btn');

  openPolicyBtn.addEventListener('click', () => policyModal.classList.remove('hidden'));
  closePolicyBtn.addEventListener('click', () => policyModal.classList.add('hidden'));
  policyModal.addEventListener('click', (e) => {
    if (e.target === policyModal) policyModal.classList.add('hidden');
  });

  // 位置情報取得ボタン
  geoBtn.addEventListener('click', () => {
    const statusText = document.getElementById('geo-status');
    if (!navigator.geolocation) {
      statusText.textContent = 'お使いのブラウザは位置情報に対応していません。';
      return;
    }
    statusText.textContent = '📍 現在地を取得中...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        statusText.textContent = '✅ 現在地を取得しました！';
        document.getElementById('station-input').value = ''; // テキスト入力をクリア
      },
      (err) => {
        console.error(err);
        statusText.textContent = '⚠️ 位置情報の取得に失敗しました。駅名を入力してください。';
      }
    );
  });

  // フォーム送信（ガチャ実行）
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await runGacha();
  });

  // さらに候補を表示ボタン
  loadMoreBtn.addEventListener('click', () => {
    renderSubCandidates();
  });
});

async function runGacha() {
  const station = document.getElementById('station-input').value.trim();
  const range = document.getElementById('range-select').value;
  const genre = document.getElementById('genre-select').value;
  const budget = document.getElementById('budget-select').value;
  const smoking = document.getElementById('smoking-select').value;
  const openNow = document.getElementById('open-now-check').checked;

  if (!userLat && !userLng && !station) {
    alert('「エリア・駅名」を入力するか、「現在地を取得」を押してください。');
    return;
  }

  // 画面切り替え（スロット表示）
  document.getElementById('input-card').classList.add('hidden');
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('slot-card').classList.remove('hidden');

  // スロットアニメーション演出
  const slotTexts = ['居酒屋を捜索中...', '焼き鳥の匂いを追跡中...', 'シメのラーメンを選定中...', '本日の一杯を抽選中...'];
  let slotIdx = 0;
  const timer = setInterval(() => {
    document.getElementById('slot-text').textContent = slotTexts[slotIdx % slotTexts.length];
    slotIdx++;
  }, 300);

  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        station,
        lat: userLat,
        lng: userLng,
        range,
        genre,
        budget,
        smoking,
        openNow
      })
    });

    const data = await response.json();
    clearInterval(timer);

    if (!response.ok || !data.success || data.results.length === 0) {
      alert(data.message || 'お店が見つかりませんでした。条件を変更してお試しください。');
      resetGacha();
      return;
    }

    // シャッフルしてランダム選出
    currentResults = shuffleArray(data.results);
    currentCandidateIndex = 0;

    // 演出終了・結果表示
    document.getElementById('slot-card').classList.add('hidden');
    document.getElementById('result-card').classList.remove('hidden');
    displayMainResult(currentResults[0]);

    // その他の候補を準備（2件目以降）
    const container = document.getElementById('candidate-list-container');
    container.innerHTML = '';
    currentCandidateIndex = 1;

    if (currentResults.length > 1) {
      document.getElementById('sub-candidates-section').classList.remove('hidden');
      renderSubCandidates();
    } else {
      document.getElementById('sub-candidates-section').classList.add('hidden');
    }

  } catch (err) {
    clearInterval(timer);
    console.error(err);
    alert('通信エラーが発生しました。再度お試しください。');
    resetGacha();
  }
}

// メイン結果の描画
function displayMainResult(shop) {
  document.getElementById('res-genre').textContent = shop.genre;
  document.getElementById('res-name').textContent = shop.name;
  document.getElementById('res-catch').textContent = shop.catch;
  document.getElementById('res-img').src = shop.photo || 'https://via.placeholder.com/300x200?text=No+Image';
  document.getElementById('res-access').textContent = shop.access;
  document.getElementById('res-budget').textContent = shop.budget;
  document.getElementById('res-smoking').textContent = shop.non_smoking;
  document.getElementById('res-hours').textContent = shop.open;

  // ホットペッパーリンク（予約・詳細）
  const hpUrl = shop.urls?.pc || '#';
  document.getElementById('res-hp-link').href = hpUrl;

  // Googleマップリンク
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.name + ' ' + shop.address)}`;
  document.getElementById('res-map-link').href = mapUrl;
}

// サブ候補の表示（5件ずつ展開）
function renderSubCandidates() {
  const container = document.getElementById('candidate-list-container');
  const nextSlice = currentResults.slice(currentCandidateIndex, currentCandidateIndex + 5);

  nextSlice.forEach(shop => {
    const item = document.createElement('div');
    item.className = 'candidate-item';
    item.innerHTML = `
      <img src="${shop.photo || 'https://via.placeholder.com/60x60'}" alt="${shop.name}">
      <div class="candidate-info">
        <h4>${shop.name}</h4>
        <p>🍺 ${shop.genre} / 💰 ${shop.budget}</p>
      </div>
      <a href="${shop.urls?.pc || '#'}" target="_blank" class="btn-link hp-btn" style="padding: 6px 10px; font-size: 0.75rem;">詳細</a>
    `;
    container.appendChild(item);
  });

  currentCandidateIndex += nextSlice.length;

  const loadMoreBtn = document.getElementById('load-more-btn');
  if (currentCandidateIndex >= currentResults.length) {
    loadMoreBtn.style.display = 'none';
  } else {
    loadMoreBtn.style.display = 'block';
  }
}

// 配列シャッフル関数
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// もう一度回す
function retryGacha() {
  if (currentResults.length > 1) {
    currentResults = shuffleArray(currentResults);
    displayMainResult(currentResults[0]);
    document.getElementById('candidate-list-container').innerHTML = '';
    currentCandidateIndex = 1;
    renderSubCandidates();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    runGacha();
  }
}

// 条件変更
function resetGacha() {
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('slot-card').classList.add('hidden');
  document.getElementById('input-card').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
