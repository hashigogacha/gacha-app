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

    // 指定なし時はジャンルパラメータを送らず全件検索
    if (genre && genre !== '') {
      params.append('genre', genre);
    }

    if (budget) params.append('budget', budget);
    if (smoking !== undefined && smoking !== '') params.append('non_smoking', smoking);

    const response = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const data = await response.json();

    let shops = data.results?.shop || [];

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '該当するお店が見つかりませんでした。条件を変更してお試しください。' });
    }

    // 徒歩分数判定
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

    // 営業中判定（定休日明記のみ除外して過剰判定を防止）
    const isNowOpenChecked = openNow === true || openNow === 'true';
    if (isNowOpenChecked) {
      shops = shops.filter(shop => {
        if (!shop.open) return true;
        if (shop.open.includes('定休日') && shop.open.length <= 6) return false;
        return true;
      });
    }

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '現在営業中のお店が見つかりませんでした。' });
    }

    const results = shops.map(shop => ({
      id: shop.id,
      name: shop.name,
      genre: shop.genre?.name || '居酒屋・グルメ',
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
