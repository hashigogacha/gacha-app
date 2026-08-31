document.addEventListener('DOMContentLoaded', () => {
  const gachaBtn = document.getElementById('gachaBtn');
  const reGachaBtn = document.getElementById('reGachaBtn');
  const geoBtn = document.getElementById('geoBtn');
  const resultSection = document.getElementById('resultSection');
  const mainShopContent = document.getElementById('mainShopContent');
  const candidateList = document.getElementById('candidateList');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const adContainer = document.getElementById('adContainer');

  let currentShops = [];
  let displayedIndex = 0;

  // ガチャ実行
  const runGacha = async () => {
    const location = document.getElementById('locationInput').value.trim();
    const genre = document.getElementById('genreSelect').value;
    const smoking = document.querySelector('input[name="smoking"]:checked').value;

    if (!location) {
      alert('📍 エリア・駅名を入力するか、現在地ボタンを押してください。');
      return;
    }

    // ボタンのローディング表示
    gachaBtn.disabled = true;
    gachaBtn.innerHTML = '🎰 検索中...';

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, genre, smoking })
      });

      const data = await response.json();

      if (!data.shops || data.shops.length === 0) {
        alert('条件に一致するお店が見つかりませんでした。別の条件を試してください。');
        return;
      }

      currentShops = data.shops;
      resultSection.classList.remove('hidden');

      // スロット演出（1.2秒）を挟んで結果を表示
      await triggerSlotAnimation();
      renderResults();

    } catch (error) {
      console.error('検索エラー:', error);
      alert('お店の検索に失敗しました。時間をおいて再度お試しください。');
    } finally {
      gachaBtn.disabled = false;
      gachaBtn.innerHTML = '🍺 ハシゴ酒ガチャを回す！';
    }
  };

  // スロット演出（約1.2秒）
  const triggerSlotAnimation = () => {
    return new Promise((resolve) => {
      let count = 0;
      const interval = setInterval(() => {
        const randomShop = currentShops[Math.floor(Math.random() * currentShops.length)];
        mainShopContent.innerHTML = `
          <div class="slot-rolling">
            <h2>🎰 ${randomShop.name}</h2>
            <p>${randomShop.genre_name} / ${randomShop.budget}</p>
          </div>
        `;
        count++;
        if (count > 8) {
          clearInterval(interval);
          resolve();
        }
      }, 130);
    });
  };

  // 検索結果の描画（1件目をメイン、2〜5件目を初期オープン表示）
  const renderResults = () => {
    if (currentShops.length === 0) return;

    // 1. メイン当選店（0番目）
    const mainShop = currentShops[0];
    mainShopContent.innerHTML = createShopCardHtml(mainShop, true);

    // 2. 候補リスト初期化
    candidateList.innerHTML = '';
    displayedIndex = 1; // 1番目からスタート

    // 3. 初期状態として上位5件（2〜5件目、最大4件分）を最初から表示
    const initialEnd = Math.min(5, currentShops.length);
    appendCandidates(displayedIndex, initialEnd);
    displayedIndex = initialEnd;

    // 5件以上あれば広告と「さらに見る」ボタンを表示
    if (currentShops.length > 5) {
      adContainer.classList.remove('hidden');
      loadMoreBtn.classList.remove('hidden');
    } else {
      adContainer.classList.add('hidden');
      loadMoreBtn.classList.add('hidden');
    }

    // 結果位置へスムーズスクロール
    resultSection.scrollIntoView({ behavior: 'smooth' });
  };

  // 候補店舗を追加レンダリングする関数
  const appendCandidates = (start, end) => {
    for (let i = start; i < end; i++) {
      const shop = currentShops[i];
      const shopEl = document.createElement('div');
      shopEl.className = 'candidate-card';
      shopEl.innerHTML = createShopCardHtml(shop, false);
      candidateList.appendChild(shopEl);
    }
  };

  // さらに候補を見る（+5件）
  loadMoreBtn.addEventListener('click', () => {
    const nextEnd = Math.min(displayedIndex + 5, currentShops.length);
    appendCandidates(displayedIndex, nextEnd);
    displayedIndex = nextEnd;

    if (displayedIndex >= currentShops.length) {
      loadMoreBtn.classList.add('hidden'); // 全件表示完了
    }
  });

  // 再ガチャ（リスト内でシャッフルして再選出）
  reGachaBtn.addEventListener('click', async () => {
    // リストをランダムシャッフル
    currentShops.sort(() => Math.random() - 0.5);
    await triggerSlotAnimation();
    renderResults();
  });

  // 店舗カードのHTML生成ヘルパー
  const createShopCardHtml = (shop, isMain) => {
    return `
      <div class="shop-card-inner">
        <img src="${shop.photo}" alt="${shop.name}" class="shop-img">
        <div class="shop-details">
          <h3 class="shop-title">${shop.name}</h3>
          <p class="shop-genre">🏷️ ${shop.genre_name}</p>
          <p class="shop-info">💰 ${shop.budget} | 🚬 ${shop.non_smoking}</p>
          <p class="shop-address">📍 ${shop.address}</p>
          <a href="${shop.urls}" target="_blank" rel="noopener" class="btn-shop-link">ホットペッパーで見る ↗</a>
        </div>
      </div>
    `;
  };

  // イベントリスナー登録
  gachaBtn.addEventListener('click', runGacha);
  
  // 現在地取得ボタン
  geoBtn.addEventListener('click', () => {
    if (navigator.geolocation) {
      geoBtn.innerText = '📡 取得中...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('locationInput').value = `${pos.coords.latitude},${pos.coords.longitude}`;
          geoBtn.innerText = '🎯 取得完了';
        },
        () => {
          alert('現在地の取得に失敗しました。');
          geoBtn.innerText = '🎯 現在地';
        }
      );
    }
  });
});
