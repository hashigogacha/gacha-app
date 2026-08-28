let allShops = [];
let shopHistory = {}; // { shopId: appearanceCount } 過去の出現回数を記録
let keptShop = null;
let currentMainShop = null;

const gachaButton = document.getElementById('gacha-button');
const keepButton = document.getElementById('keep-button');
const shareButton = document.getElementById('share-button');

gachaButton.addEventListener('click', async () => {
    const area = document.getElementById('area-input').value.trim();
    const genre = document.getElementById('genre-input').value;
    const isOpenNow = document.getElementById('open-now-check').checked;

    if (!area) {
        alert("エリア・駅名を入力してください！");
        return;
    }

    gachaButton.textContent = "検索中...";
    gachaButton.disabled = true;

    try {
        // APIリクエスト（バックエンド経由）
        // 開発環境用の相対パス設定
        const url = new URL(window.location.origin + '/api/search');
        url.searchParams.append('keyword', area);
        
        // ジャンル指定なしのときはパラメータを付与しない（フラット取得）
        if (genre) {
            url.searchParams.append('genre', genre);
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error("API通信エラー");
        const data = await res.json();
        
        let shops = data.results?.shop || [];

        // 【営業中チェック処理】OFFのときは一切フィルターをかけない
        if (isOpenNow) {
            shops = shops.filter(shop => {
                // 簡易判定：「休」という文字が含まれていれば除外など
                // （※APIの仕様上、厳密な時間判定が難しいため軽めのチェック）
                return !shop.open.includes('休') && !shop.open.includes('定休日');
            });
        }

        if (shops.length === 0) {
            alert("条件に一致するお店が見つかりませんでした。ジャンルや営業中チェックを外して再度お試しください。");
            return;
        }

        allShops = shops;
        drawGacha();
        document.getElementById('result-section').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        alert("お店の取得に失敗しました。時間をおいてお試しください。");
    } finally {
        gachaButton.textContent = "🎲 ガチャを回す！";
        gachaButton.disabled = false;
    }
});

function drawGacha() {
    let weightedPool = [];
    
    // 【重み付け抽選ロジック（1等〜3等）】
    allShops.forEach(shop => {
        // キープ中の店はプールから除外
        if (keptShop && keptShop.id === shop.id) return;

        const count = shopHistory[shop.id] || 0;
        let weight = 10;     // 1等 (未表示)
        if (count === 1) weight = 2;  // 2等 (1回表示)
        if (count >= 2) weight = 1;   // 3等 (2回以上表示)

        // 重みの数だけプールに投入
        for (let i = 0; i < weight; i++) {
            weightedPool.push(shop);
        }
    });

    if (weightedPool.length === 0) {
        alert("候補のお店がありません。条件を変えてみてください。");
        return;
    }

    // ランダム抽選
    const randomIndex = Math.floor(Math.random() * weightedPool.length);
    currentMainShop = weightedPool[randomIndex];

    // 履歴カウントアップ
    shopHistory[currentMainShop.id] = (shopHistory[currentMainShop.id] || 0) + 1;

    renderResult();
}

function renderResult() {
    // メイン候補の描画
    const mainHtml = `
        <h2 class="shop-name"><a href="${currentMainShop.urls.pc}" target="_blank">${currentMainShop.name}</a></h2>
        <div class="shop-meta">🍣 ジャンル: ${currentMainShop.genre.name}</div>
        <div class="shop-meta">💰 予算: ${currentMainShop.budget.name || '不明'}</div>
        <div class="shop-meta">🚶 アクセス (距離感): ${currentMainShop.access}</div>
        <div class="shop-meta">🕒 営業時間: ${currentMainShop.open}</div>
    `;
    document.getElementById('main-shop-card').innerHTML = mainHtml;

    // サブ候補（最大5件、メイン・キープ以外）をリンク化
    const subList = document.getElementById('sub-shop-list');
    subList.innerHTML = "";
    
    // Setを使用して重複表示を防止しつつ5件抽出
    const subShops = Array.from(new Set(allShops.filter(s => s.id !== currentMainShop.id && (!keptShop || s.id !== keptShop.id)))).slice(0, 5);
    
    subShops.forEach(shop => {
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="${shop.urls.pc}" target="_blank">
                ${shop.name}
                <span class="sub-meta">(${shop.genre.catch} / ${shop.access})</span>
            </a>
        `;
        subList.appendChild(li);
    });

    // キープ中エリアの更新
    if (keptShop) {
        document.getElementById('kept-shop-area').classList.remove('hidden');
        document.getElementById('kept-shop-card').innerHTML = `
            <h3 class="shop-name" style="font-size:18px; margin-bottom:5px;">${keptShop.name}</h3>
            <div class="shop-meta" style="font-size:14px; margin-bottom:0;">🚶 ${keptShop.access}</div>
        `;
        keepButton.textContent = "🔒 キープ解除";
    } else {
        document.getElementById('kept-shop-area').classList.add('hidden');
        keepButton.textContent = "🔒 1軒目キープ (次を探す)";
    }
}

keepButton.addEventListener('click', () => {
    if (keptShop) {
        // キープ解除
        keptShop = null;
        renderResult();
    } else {
        // キープ実行
        keptShop = currentMainShop;
        alert("1軒目をキープしました！続けて「ガチャを回す」で2軒目を探せます。");
        renderResult();
    }
});

shareButton.addEventListener('click', () => {
    let text = `🍻 今日のハシゴ酒ガチャ結果！\n`;
    if (keptShop) text += `【1軒目】 ${keptShop.name}\n`;
    text += `【${keptShop ? '2軒目' : '決定'}】 ${currentMainShop.name}\n🚶 ${currentMainShop.access}\n\n詳細はこちら: ${currentMainShop.urls.pc}`;
    
    // Web Share API が使える環境 (スマホなど)
    if (navigator.share) {
        navigator.share({
            title: 'ハシゴ酒ガチャ結果',
            text: text,
        }).catch(console.error);
    } else {
        // Fallback: X (Twitter) で共有
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    }
});
