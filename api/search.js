export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { station, lat, lng, step, range, genre, budget, smoking, openNow, excludeIds = [] } = req.body || {};

  const apiKey = process.env.HOTPEPPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'APIキーが設定されていません' });
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      format: 'json',
      count: '100'
    });

    if (lat && lng) {
      params.append('lat', lat);
      params.append('lng', lng);
      
      if (range) {
        const rangeNum = parseInt(range, 10);
        let apiRange = '3';
        if (rangeNum <= 300) apiRange = '1';
        else if (rangeNum <= 500) apiRange = '2';
        else if (rangeNum <= 1000) apiRange = '3';
        else if (rangeNum <= 2000) apiRange = '4';
        else apiRange = '5';
        params.append('range', apiRange);
      } else {
        params.append('range', '5');
      }
    } else if (station) {
      params.append('keyword', station);
    } else {
      return res.status(400).json({ message: 'エリア情報を指定してください' });
    }

    if (genre) params.append('genre', genre);
    if (budget) params.append('budget', budget);
    if (smoking !== undefined && smoking !== '') params.append('non_smoking', smoking);

    const response = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const data = await response.json();

    let shops = data.results?.shop || [];

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '該当するお店が見つかりませんでした' });
    }

    // 1. 距離（徒歩分数）による手動フィルター
    if (range) {
      const rangeNum = parseInt(range, 10);
      const maxWalkMinutes = Math.ceil(rangeNum / 80) + 2;

      shops = shops.filter(shop => {
        const accessText = (shop.access || '') + ' ' + (shop.mobile_access || '');
        const match = accessText.match(/徒歩\s*(\d+)\s*分/);
        if (match) {
          const walkMin = parseInt(match[1], 10);
          return walkMin <= maxWalkMinutes;
        }
        return true;
      });
    }

    // 2. 「今営業中のみ」のフィルター（真偽値判定を厳密化）
    const isNowOpenChecked = openNow === true || openNow === 'true';
    if (isNowOpenChecked) {
      shops = shops.filter(shop => {
        if (!shop.open) return true;
        return !shop.open.includes('定休日') || shop.open.length > 5;
      });
    }

    // 3. 何軒目かに合わせた優先抽出
    let filteredShops = shops;
    if (step === '3') {
      const shimeShops = shops.filter(s => {
        const gName = s.genre?.name || '';
        const name = s.name || '';
        return gName.includes('ラーメン') || gName.includes('バー') || gName.includes('カクテル') || name.includes('ラーメン') || name.includes('つけ麺');
      });
      if (shimeShops.length >= 2) filteredShops = shimeShops;
    }

    let availableShops = filteredShops.filter(shop => !excludeIds.includes(shop.id));
    if (availableShops.length === 0) {
      availableShops = shops;
    }

    const shuffled = availableShops.sort(() => 0.5 - Math.random());

    const results = shuffled.slice(0, 21).map(shop => ({
      id: shop.id,
      name: shop.name,
      genre: shop.genre?.name || '居酒屋',
      catch: shop.catch || '',
      photo: shop.photo?.pc?.l || shop.photo?.mobile?.l || '',
      access: shop.mobile_access || shop.access || '情報なし',
      budget: shop.budget?.average || '情報なし',
      open: shop.open || '情報なし',
      address: shop.address || '',
      urls: shop.urls || {}
    }));

    return res.status(200).json({ success: true, results });

  } catch (error) {
    return res.status(500).json({ success: false, message: '検索処理に失敗しました' });
  }
}
