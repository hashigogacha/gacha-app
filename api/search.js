// サーバーレス関数用 (Vercel / Netlify / Express などに対応)
// デプロイ先の環境変数に HOTPEPPER_API_KEY を設定してください

module.exports = async (req, res) => {
    const apiKey = process.env.HOTPEPPER_API_KEY;
    const baseUrl = 'http://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
    
    const { keyword, genre } = req.query;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is not configured.' });
    }

    try {
        const url = new URL(baseUrl);
        url.searchParams.append('key', apiKey);
        url.searchParams.append('format', 'json');
        url.searchParams.append('count', '100'); // フラットに最大100件取得しプールする

        if (keyword) {
            url.searchParams.append('keyword', keyword);
        }
        
        // ジャンル指定がある場合のみ付与 (指定なし時はフラットに全取得)
        if (genre) {
            url.searchParams.append('genre', genre);
        }

        const response = await fetch(url.toString());
        const data = await response.json();

        res.status(200).json(data);
    } catch (error) {
        console.error('Hotpepper API Fetch Error:', error);
        res.status(500).json({ error: 'Failed to fetch data from API' });
    }
};
