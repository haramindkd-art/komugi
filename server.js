const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate-recipe', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'サーバーに GEMINI_API_KEY が設定されていません。' });
  }

  const { url, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: '投稿文・字幕・文字起こしを入力してください。' });
  }

  const prompt = `
あなたは優秀な料理研究家兼データ整理アシスタントです。
以下のSNSの投稿文・字幕・文字起こしデータから、料理のレシピ情報を抽出し、指定のJSONフォーマットで出力してください。

【重要なルール】
1. 基準人数（servings）が明記されている場合はその数値を、不明な場合は 2 を設定してください。
2. 材料（ingredients）は1つずつ分解し、以下を抽出してください：
   - name: 材料名
   - amount: 分量の数値（例: "200g" なら 200、"大さじ1.5" なら 1.5、"1/2個" なら 0.5）。「適量」「少々」「ひとつまみ」「お好みで」など数値化できない・曖昧な場合は必ず null にしてください。
   - unit: 単位（例: "g", "ml", "大さじ", "小さじ", "個" など）。数値化できない場合は null。
   - original: 元の表記そのまま（例: "200g", "大さじ1と1/2", "適量", "少々"）。
3. 作り方（steps）は手順の配列にしてください。
4. 推測で勝手に材料の分量を数値化しないでください。曖昧なものは amount: null とし、original に元の表記を残してください。

【参考URL】
${url || 'なし'}

【投稿文・字幕・文字起こし】
${text}
`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING', description: '料理名' },
              servings: { type: 'NUMBER', description: '基準となる人数（不明な場合は2）' },
              ingredients: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING' },
                    amount: { type: 'NUMBER', nullable: true },
                    unit: { type: 'STRING', nullable: true },
                    original: { type: 'STRING' }
                  },
                  required: ['name', 'original']
                }
              },
              steps: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            },
            required: ['title', 'servings', 'ingredients', 'steps']
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Gemini APIの呼び出しに失敗しました。'
      });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'Geminiからの応答が空でした。' });
    }

    const recipe = JSON.parse(rawText);
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: `サーバーエラー: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`komugi v2 running on http://localhost:${PORT}`);
});
