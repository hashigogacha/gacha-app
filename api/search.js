export default async function handler(req, res) {
  // サーバー側にAPIキーを保持（ブラウザからは見えません）
  const apiKey = process.env.HOTPEPPER_API_KEY || 'd4de80c2c391a613';
  
  const { keyword, lat, lng, range, non_smoking } = req.query;

  // ホットペッパーAPIへのリクエストURLを構築 (JSON形式で受け取る)
  let apiUrl = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?key=${apiKey}&format=json&count=100`;

  if (keyword) apiUrl += `&keyword=${encodeURIComponent(keyword)}`;
  if (lat && lng) apiUrl += `&lat=${lat}&lng=${lng}&range=${range || 3}`;
  if (non_smoking !== undefined && non_smoking !== "") apiUrl += `&non_smoking=${non_smoking}`;

  try {
    const apiRes = await fetch(apiUrl);
    const data = await apiRes.json();
    
    // CORSエラーを防ぐヘッダーを付与してフロントへ返却
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'API通信に失敗しました。' });
  }
}