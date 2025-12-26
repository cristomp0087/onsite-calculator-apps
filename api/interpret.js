// OnSite Calculator - AI Interpret API
// Vercel Serverless Function

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body || {};
  const input = String(text || "").trim();

  if (!input) return res.status(400).json({ error: "Missing text" });
  if (input.length > 300) return res.status(400).json({ error: "Text too long" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  const systemPrompt = `You are a parser for a construction calculator.
Convert spoken phrases into JSON. Return ONLY valid JSON, no markdown.

For inch/feet calculations:
{"mode":"inches","a":"3 1/4","op":"+","b":"5 3/8"}

For regular math:
{"mode":"normal","expression":"20 - 5"}

Rules:
- Fractions: "1/2", "3/8", "1/16"
- Mixed numbers: "3 1/4" (whole space fraction)  
- Feet: "5'" or "5' 3 1/4"
- Operators: + - * /
- Handle English, Portuguese, Spanish, French
- Fix speech errors like "103/8" → "10 3/8"

Examples:
"three and a quarter plus five and three eighths" → {"mode":"inches","a":"3 1/4","op":"+","b":"5 3/8"}
"two feet minus seven inches" → {"mode":"inches","a":"2'","op":"-","b":"7"}
"twenty minus five" → {"mode":"normal","expression":"20 - 5"}
"quarenta menos oito" → {"mode":"normal","expression":"40 - 8"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 150,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse: "${input}"` }
        ]
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);
      return res.status(500).json({ error: "OpenAI error" });
    }

    const content = data?.choices?.[0]?.message?.content || "{}";
    
    // Clean markdown if present
    let cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      parsed = { mode: "normal", expression: "" };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
