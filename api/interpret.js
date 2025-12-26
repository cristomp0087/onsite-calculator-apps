// OnSite Calculator - AI Interpret API
// Vercel Serverless Function
// CORREÇÃO: Usando gpt-4o + prompt melhorado para multilíngue

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
  if (input.length > 500) return res.status(400).json({ error: "Text too long" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  // PROMPT MELHORADO para entender múltiplos idiomas
  const systemPrompt = `You are a parser for a construction calculator that understands measurements in ENGLISH, PORTUGUESE, SPANISH, and FRENCH.

Your job: Convert spoken phrases about measurements into JSON for calculation.
Return ONLY valid JSON, no markdown, no explanation.

OUTPUT FORMATS:

1. For inch/feet calculations with fractions:
{"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}

2. For regular math (no fractions):
{"mode":"normal","expression":"40 - 8"}

RULES FOR FRACTIONS:
- Write fractions as: 1/2, 1/4, 3/8, 1/16, etc.
- Mixed numbers: whole number + space + fraction: "5 1/2", "3 3/4", "10 3/8"
- Feet notation: use apostrophe: "5'" or "5' 3 1/2"
- Always use mode:"inches" when fractions are involved

LANGUAGE EXAMPLES:

ENGLISH:
- "five and a half plus three and a quarter" → {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
- "three feet two inches minus one foot" → {"mode":"inches","a":"3' 2","op":"-","b":"1'"}
- "seven and three eighths" → {"mode":"inches","a":"7 3/8","op":"","b":""}
- "forty minus eight" → {"mode":"normal","expression":"40 - 8"}

PORTUGUESE:
- "cinco e meio mais três e um quarto" → {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
- "sete e três oitavos menos dois" → {"mode":"inches","a":"7 3/8","op":"-","b":"2"}
- "três pés e duas polegadas" → {"mode":"inches","a":"3' 2","op":"","b":""}
- "quarenta menos oito" → {"mode":"normal","expression":"40 - 8"}
- "dez e três oitavos mais cinco e meio" → {"mode":"inches","a":"10 3/8","op":"+","b":"5 1/2"}

SPANISH:
- "cinco y medio más tres y un cuarto" → {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
- "siete y tres octavos menos dos" → {"mode":"inches","a":"7 3/8","op":"-","b":"2"}
- "cuarenta menos ocho" → {"mode":"normal","expression":"40 - 8"}

FRENCH:
- "cinq et demi plus trois et un quart" → {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
- "sept et trois huitièmes moins deux" → {"mode":"inches","a":"7 3/8","op":"-","b":"2"}
- "quarante moins huit" → {"mode":"normal","expression":"40 - 8"}

COMMON FRACTION TERMS:
- half / meio / media / medio / demi = 1/2
- quarter / quarto / cuarto / quart = 1/4
- eighth / oitavo / octavo / huitième = 1/8
- sixteenth / dezesseis avos / dieciseisavo / seizième = 1/16
- three quarters / três quartos / tres cuartos / trois quarts = 3/4

FIX COMMON SPEECH ERRORS:
- "103/8" should be "10 3/8"
- "51/2" should be "5 1/2"
- Run-together numbers need spaces before fractions

IMPORTANT: If the phrase mentions fractions or measurements, ALWAYS use mode:"inches".
Only use mode:"normal" for pure arithmetic without fractions.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o", // CORREÇÃO: Modelo mais inteligente
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this spoken phrase: "${input}"` }
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
    let cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      console.error("JSON parse error:", cleanContent);
      parsed = { error: true };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
