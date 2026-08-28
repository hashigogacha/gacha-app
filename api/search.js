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

    if (genre) {
      params.append('genre', genre);
    }

    if (budget) params.append('budget', budget);
    if (smoking !== undefined && smoking !== '') params.append('non_smoking', smoking);

    const response = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params.toString()}`);
    const data = await response.json();

    let shops = data.results?.shop || [];

    if (shops.length === 0) {
      return res.status(404).json({ success: false, message: '該当するお店が見つかりませんでした' });
    }

    // 1. 距離（徒歩分数）によるフィルター
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

    // 2. 「今営業中のみ」の厳密なフィルター判定（昼の検索で夜営業の店を除外）
    const isNowOpenChecked = openNow === true || openNow === 'true';
    if (isNowOpenChecked) {
      const now = new Date();
      // 日本時間に変換
      const jstOffset = 9 * 60;
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const jstDate = new Date(utc + (jstOffset * 60000));

      const currentHour = jstDate.getHours();
      const currentMin = jstDate.getMinutes();
      const currentTimeNum = currentHour * 100 + currentMin; // 例: 14:30 -> 1430

      shops = shops.filter(shop => {
        if (!shop.open) return true;

        // 定休日チェック
        if (shop.open.includes('定休日') && shop.open.length <= 5) return false;

        // 営業時間のテキスト解析（例: "月〜金: 17:00〜23:00" などから時間範囲を抽出）
        const timeMatches = [...shop.open.matchAll(/(\d{1,2}):(\d{2})\s*[\uff5e\u301c\u201c\u201d\~-]\s*(\d{1,2}):(\d{2})/g)];
        if (timeMatches.length > 0) {
          let isOpenNow = false;
          for (const match of timeMatches) {
            const startH = parseInt(match[1], 10);
            const startM = parseInt(match[2], 10);
            let endH = parseInt(match[3], 10);
            const endM = parseInt(match[4], 10);

            const startTimeNum = startH * 100 + startM;
            // 翌日（深夜）に跨がる場合（例: 17:00〜翌2:00 -> 26:00）
            if (endH < startH) endH += 24;
            const endTimeNum = endH * 100 + endM;

            let checkTimeNum = currentTimeNum;
            // 深夜2:00などで前日夜からの営業範囲に含まれるか判定
            if (currentHour < 5 && endH >= 24) {
              checkTimeNum += 2400;
            }

            if (checkTimeNum >= startTimeNum && checkTimeNum <= endTimeNum) {
              isOpenNow = true;
              break;
            }
          }
          return isOpenNow;
        }

        return true;
      });
    }

    const results = shops.map(shop => ({
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
