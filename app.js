document.addEventListener('DOMContentLoaded', () => {
  const gachaBtn = document.getElementById('gachaBtn');
  const reGachaBtn = document.getElementById('reGachaBtn');
  const geoBtn = document.getElementById('geoBtn');
  const resultSection = document.getElementById('resultSection');
  const mainShopContent = document.getElementById('mainShopContent');
  const candidateList = document.getElementById('candidateList');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  let currentShops = [];
  let displayedIndex = 0;

  // ガチャ実行
  const runGacha = async () => {
    const location = document.getElementById('locationInput').value.trim();
    const range = document.getElementById('rangeSelect').value;
    const genre = document.getElementById('genreSelect').value;
    const budget = document.getElementById('budgetSelect').value;
    const openNow = document.getElementById('openNowCheck').checked;
    const smoking = document.querySelector('input[name="smoking"]:checked').value;

    if (!location) {
      alert('📍 エリア・駅名を入力するか、現在地ボタンを押してください。');
      return;
    }

    gachaBtn.disabled = true;
    gachaBtn.innerHTML = '🎰 検索中...';

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, range, genre, budget, openNow, smoking })
      });

      const data = await response.json();

      if (!data.shops || data.shops.length === 0) {
        alert('条件に一致するお店が見つかりませんでした。条件を広げて試してください。');
        return;
      }

      currentShops = data.shops;
      resultSection.classList.remove('hidden');

      // スロット演出（1.2秒）を実行して結果表示
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
        if (count > 9) {
          clearInterval(interval);
          resolve();
        }
      }, 120);
    });
  };

  // 検索結果の描画
  const renderResults = () => {
    if (currentShops.length === 0) return;

    // 1. メイン当選店（0番目）
    const mainShop = currentShops[0];
    mainShopContent.innerHTML = createShopCardHtml(mainShop, true);

    // 2. 候補リストの初期化
    candidateList.innerHTML = '';
    displayedIndex = 1; // 1番目のインデックスから候補表示開始

    // 3. 最初から上位5件の候補（1〜5件目）を表示（5件表示ごとに広告を挿入）
    const initialEnd = Math.min(6, currentShops.length); // メイン除く上位5件
    appendCandidatesWithAds(displayedIndex, initialEnd);
    displayedIndex = initialEnd;

    // まだ表示していない候補が残っていれば「さらに見る」ボタンを表示
    if (displayedIndex < currentShops.length) {
      loadMoreBtn.classList.remove('hidden');
    } else {
      loadMoreBtn.classList.add('hidden');
    }

    resultSection.scrollIntoView({ behavior: 'smooth' });
  };

  // 店舗カードを追加し、5件表示ごとに広告枠を挟み込むロジック
  const appendCandidatesWithAds = (start, end) => {
    for (let i = start; i < end; i++) {
      const shop = currentShops[i];
      const shopEl = document.createElement('div');
      shopEl.className = 'candidate-card';
      shopEl.innerHTML = createShopCardHtml(shop, false);
      candidateList.appendChild(shopEl);

      // 5件表示される「毎」に広告枠を挟み込む（候補の5件目、10件目、15件目...）
      if (i % 5 === 0) {
        const adEl = document.createElement('div');
        adEl.className = 'ad-banner';
        adEl.innerHTML = `
          <p class="ad-label">スポンサーリンク</p>
          <div class="ad-content">【広告枠】ここにおすすめ情報や広告が表示されます</div>
        `;
        candidateList.appendChild(adEl);
      }
    }
  };

  // さらに候補を見る（+5件追加）
  loadMoreBtn.addEventListener('click', () => {
    const nextEnd = Math.min(displayedIndex + 5, currentShops.length);
    appendCandidatesWithAds(displayedIndex, nextEnd);
    displayedIndex = nextEnd;

    if (displayedIndex >= currentShops.length) {
      loadMoreBtn.classList.add('hidden');
    }
  });

  // 再ガチャ（シャッフルして再選出）
  reGachaBtn.addEventListener('click', async () => {
    currentShops.sort(() => Math.random() - 0.5);
    await triggerSlotAnimation();
    renderResults();
  });

  // 店舗HTML作成
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

  // イベント登録
  gachaBtn.addEventListener('click', runGacha);

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
