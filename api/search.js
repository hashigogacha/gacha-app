export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { station, lat, lng, range, genre, budget, smoking, openNow } = req.body || {};

  const apiKey = process.env.HOTPEPPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'APIキーが設定されていません' });
  }

  try {
    let searchLat = lat;
    let searchLng = lng;

    // 1. 駅名・テキスト入力の場合はジオコーディング
    if (!searchLat || !searchLng) {
      if (!station) {
        return res.status(400).json({ message: 'エリア情報を指定してください' });
      }

      const cleanStation = station.replace(/駅$/, '').trim();
      
      try {
        const geoRes = await fetch(`https://express.heartrails.com/api/json?method=getStations&name=${encodeURIComponent(cleanStation)}`);
        const geoData = await geoRes.json();

        if (geoData.response && geoData.response.station && geoData.response.station.length > 0) {
          searchLat = geoData.response.station[0].y;
          searchLng = geoData.response.station[0].x;
        } else {
          const gsiRes = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(station)}`);
          const gsiData = await gsiRes.json();
          if (gsiData && gsiData.length > 0) {
            searchLng = gsiData[0].geometry.coordinates[0];
            searchLat = gsiData[0].geometry.coordinates[1];
          }
        }
      } catch (e) {
        console.error('ジオコーディング失敗:', e);
      }
    }

    // 2. Hotpepper APIのパラメータ構築
    const params = new URLSearchParams({
      key: apiKey,
      format: 'json',
      count: '100'
    });

    if (searchLat && searchLng) {
      params.append('lat', searchLat);
      params.append('lng', searchLng);
      
      if (range) {
        const rangeNum = parseInt(range, 10);
        let apiRange = '2';
        if (rangeNum <= 300) apiRange = '1';
        else if (rangeNum <= 500) apiRange = '2';
        else if (rangeNum <= 1000) apiRange = '3';
        else if (rangeNum <= 2000) apiRange = '4';
        else apiRange = '5';
        params.append('range', apiRange);
      } else {
        params.append('range', '2');
      }
    } else {
      params.append('keyword', station);
    }

    // ジャンル指定（「指定なし」は1軒目向け12ジャンルに自動制限）
    if (genre && typeof genre === 'string' && genre.trim() !== '') {
      params.append('genre', genre.trim());
    } else {
      params.append('genre', 'G001,G002,G003,G004,G005,G006,G007,G008,G009,G013,G016,G017');
    }

    if (budget) params.append('budget', budget);

    if (smoking === 'no_smoking' || smoking === '0') {
      params.append('non_smoking', '1');
    }

    // 3. APIリクエスト
    const response = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const data = await response.json();

    let shops = data.results?.shop || [];

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '該当するお店が見つかりませんでした。条件を変更してお試しください。' });
    }

    // 喫煙可指定時のフィルター
    if (smoking === 'smoking') {
      shops = shops.filter(shop => {
        const ns = shop.non_smoking || '';
        return !ns.includes('全面禁煙') && !ns.includes('禁煙席のみ');
      });
    }

    // 4. 徒歩分数判定
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

    // 5. 営業中判定
    const isNowOpenChecked = openNow === true || openNow === 'true';
    if (isNowOpenChecked) {
      shops = shops.filter(shop => {
        if (!shop.open) return true;
        if (shop.open.includes('定休日') && shop.open.length <= 6) return false;
        return true;
      });
    }

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '条件に合うお店が見つかりませんでした。条件を緩めてお試しください。' });
    }

    const results = shops.map(shop => ({
      id: shop.id,
      name: shop.name,
      genre: shop.genre?.name || '居酒屋・グルメ',
      catch: shop.catch || '',
      photo: shop.photo?.pc?.l || shop.photo?.mobile?.l || '',
      access: shop.mobile_access || shop.access || '情報なし',
      budget: shop.budget?.average || '情報なし',
      non_smoking: shop.non_smoking || '情報なし',
      open: shop.open || '情報なし',
      address: shop.address || '',
      urls: shop.urls || {}
    }));

    return res.status(200).json({ success: true, results });

  } catch (error) {
    return res.status(500).json({ success: false, message: '検索処理に失敗しました' });
  }
}
