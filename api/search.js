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
      
      // 距離指定（range）のマッピング
      if (range) {
        const rangeNum = parseInt(range, 10);
        let apiRange = '3';
        if (rangeNum <= 300) apiRange = '1';       // 300m
        else if (rangeNum <= 500) apiRange = '2';  // 500m
        else if (rangeNum <= 1000) apiRange = '3'; // 1000m
        else if (rangeNum <= 2000) apiRange = '4'; // 2000m
        else apiRange = '5';                      // 3000m
        params.append('range', apiRange);
      } else {
        params.append('range', '5'); // 制限なしの場合最大値
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

    // 「今営業中のみ」の簡易フィルター（営業時間表記に基づく判定）
    if (openNow) {
      shops = shops.filter(shop => {
        if (!shop.open) return true;
        return !shop.open.includes('定休日') || shop.open.length > 5;
      });
    }

    let filteredShops = shops;
    if (step === '3') {
      const barShops = shops.filter(s => s.genre?.name?.includes('バー') || s.genre?.name?.includes('カクテル'));
      if (barShops.length >= 3) filteredShops = barShops;
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
