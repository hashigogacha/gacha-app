const HOTPEPPER_API_KEY = process.env.HOTPEPPER_API_KEY; // 環境変数から取得

// 「指定なし」検索時に使用する14ジャンル（カラオケ G011 / カフェ G014 / その他 G015 を除外）
const ALLOWED_GENRES_FOR_DEFAULT = 'G001,G003,G004,G016,G005,G006,G002,G013,G007,G008,G017,G009,G010,G012';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { location, genre, smoking } = req.body;

  try {
    let lat, lng;

    // 1. ジオコーディング（緯度経度変換処理）
    if (location.includes(',')) {
      // カンマ区切りの座標の場合（現在地ボタン経由）
      [lat, lng] = location.split(',');
    } else {
      // 駅名・地名から国土地理院APIを利用して緯度経度に変換
      const geoUrl = `https://msearch.gsi.go.jp/address-search-api/search?q=${encodeURIComponent(location)}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (!geoData || geoData.length === 0) {
        return res.status(400).json({ error: '指定された住所・駅名が見つかりませんでした。' });
      }

      [lng, lat] = geoData[0].geometry.coordinates;
    }

    // 2. Hotpepper API用パラメータの構築
    const params = new URLSearchParams({
      key: HOTPEPPER_API_KEY,
      lat: lat,
      lng: lng,
      range: '3', // 半径1000m圏内
      count: '100', // 最大件数取得
      format: 'json'
    });

    // 3. ジャンルの指定制御
    if (genre && genre.trim() !== '') {
      params.append('genre', genre.trim());
    } else {
      // 指定なしの場合はハシゴ酒向け14ジャンルのみを指定
      params.append('genre', ALLOWED_GENRES_FOR_DEFAULT);
    }

    // 4. 禁煙・喫煙フィルターの制御（API一次絞り込み）
    if (smoking === 'nonsmoking') {
      params.append('non_smoking', '1'); // 禁煙席あり
    }

    // Hotpepper API呼び出し
    const hpResponse = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const hpData = await hpResponse.json();

    if (!hpData.results || !hpData.results.shop) {
      return res.status(200).json({ shops: [] });
    }

    let rawShops = hpData.results.shop;

    // 5. JavaScript側での二次精査（「喫煙可・喫煙所あり」の抽出判定）
    if (smoking === 'smoking') {
      rawShops = rawShops.filter(shop => {
        const text = `${shop.non_smoking} ${shop.kentan || ''} ${shop.service_area || ''}`.toLowerCase();
        // 喫煙に関するキーワードが含まれている店舗のみ抽出
        return text.includes('喫煙可') || text.includes('喫煙専用') || text.includes('分煙') || text.includes('加熱式');
      });
    }

    // レスポンス用データ整形
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

    // ランダムシャッフルして返却
    formattedShops.sort(() => Math.random() - 0.5);

    return res.status(200).json({ shops: formattedShops });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'サーバー内部エラーが発生しました。' });
  }
}
