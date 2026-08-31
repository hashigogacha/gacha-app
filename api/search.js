const HOTPEPPER_API_KEY = process.env.HOTPEPPER_API_KEY;

// 「指定なし」検索時に使用する14ジャンル（カラオケ G011 / カフェ G014 / その他 G015 を除外）
const ALLOWED_GENRES_FOR_DEFAULT = 'G001,G003,G004,G016,G005,G006,G002,G013,G007,G008,G017,G009,G010,G012';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { location, range, genre, budget, openNow, smoking } = req.body;

  try {
    let lat, lng;

    // 1. ジオコーディング（現在地または国土地理院API）
    if (location.includes(',')) {
      [lat, lng] = location.split(',');
    } else {
      const geoUrl = `https://msearch.gsi.go.jp/address-search-api/search?q=${encodeURIComponent(location)}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (!geoData || geoData.length === 0) {
        return res.status(400).json({ error: '指定された住所・駅名が見つかりませんでした。' });
      }

      [lng, lat] = geoData[0].geometry.coordinates;
    }

    // 2. Hotpepper APIパラメータ作成
    const params = new URLSearchParams({
      key: HOTPEPPER_API_KEY,
      lat: lat,
      lng: lng,
      range: range || '3', // 検索範囲（復元）
      count: '100',
      format: 'json'
    });

    // 予算指定（復元）
    if (budget && budget.trim() !== '') {
      params.append('budget', budget.trim());
    }

    // 営業中のみ絞り込み（復元）
    if (openNow) {
      params.append('open_now', '1');
    }

    // ジャンル指定（指定なしの時はカラオケ・カフェ・その他を除いた14ジャンル）
    if (genre && genre.trim() !== '') {
      params.append('genre', genre.trim());
    } else {
      params.append('genre', ALLOWED_GENRES_FOR_DEFAULT);
    }

    // 禁煙フィルター
    if (smoking === 'nonsmoking') {
      params.append('non_smoking', '1');
    }

    // APIリクエスト実行
    const hpResponse = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const hpData = await hpResponse.json();

    if (!hpData.results || !hpData.results.shop) {
      return res.status(200).json({ shops: [] });
    }

    let rawShops = hpData.results.shop;

    // 喫煙可・喫煙所ありの二次フィルター
    if (smoking === 'smoking') {
      rawShops = rawShops.filter(shop => {
        const text = `${shop.non_smoking} ${shop.kentan || ''} ${shop.service_area || ''}`.toLowerCase();
        return text.includes('喫煙可') || text.includes('喫煙専用') || text.includes('分煙') || text.includes('加熱式');
      });
    }

    // レスポンス整形
    const formattedShops = rawShops.map(shop => ({
      id: shop.id,
      name: shop.name,
      genre_name: shop.genre.name,
      budget: shop.budget.name || '予算情報なし',
      non_smoking: shop.non_smoking || '指定なし',
      address: shop.address,
      photo: shop.photo.pc.l,
      urls: shop.urls.pc
    }));

    // シャッフルして返却
    formattedShops.sort(() => Math.random() - 0.5);

    return res.status(200).json({ shops: formattedShops });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました。' });
  }
}
