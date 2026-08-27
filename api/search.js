export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { station, lat, lng, genre, budget, excludeIds = [] } = req.body || {};

  const apiKey = process.env.HOTPEPPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'APIキーが設定されていません' });
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      format: 'json',
      count: '50'
    });

    if (lat && lng) {
      params.append('lat', lat);
      params.append('lng', lng);
      params.append('range', '3'); // 約1000m圏内
    } else if (station) {
      params.append('keyword', station);
    } else {
      return res.status(400).json({ message: '駅名または位置情報を指定してください' });
    }

    if (genre) params.append('genre', genre);
    if (budget) params.append('budget', budget);

    const response = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const data = await response.json();

    const shops = data.results?.shop || [];

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '該当するお店が見つかりませんでした' });
    }

    let availableShops = shops.filter(shop => !excludeIds.includes(shop.id));
    if (availableShops.length === 0) {
      availableShops = shops;
    }

    const shuffled = availableShops.sort(() => 0.5 - Math.random());

    const results = shuffled.slice(0, 3).map(shop => ({
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
