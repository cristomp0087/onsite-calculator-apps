// OnSite Calculator - AI Interpret API
// Vercel Serverless Function
// ATUALIZADO: Logs detalhados + Dicionário de Portinglês/Gírias

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body || {};
  const input = String(text || "").trim();

  // LOG TÉCNICO: O que chegou no servidor
  console.log(`[API] Input received: "${input}"`);

  if (!input) return res.status(400).json({ error: "Missing text" });
  if (input.length > 500) return res.status(400).json({ error: "Text too long" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[API] Critical Error: Missing OPENAI_API_KEY");
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  // PROMPT ATUALIZADO: Inclui gírias de obra e Portinglês
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

*** CONSTRUCTION SLANG & PORTINGLISH (IMPORTANT) ***
The users are Brazilian immigrants in construction who mix English/Portuguese. Map these terms correctly:

- "incha" / "inchas" / "inchis" = inches / polegadas (Example: "5 inchas" -> 5)
- "cora" / "coras" / "quarer" = quarters / 1/4 (Example: "3 coras" -> 3/4)
- "fit" / "fitti" / "fiti" = feet / pés (Example: "10 fit" -> 10')
- "eit" / "eits" / "eith" = eighths / 1/8 (Example: "5 eits" -> 5/8)
- "sics" / "sicstins" = sixteenths / 1/16 (Example: "3 sicstins" -> 3/16)
- "meia" = 1/2 (Example: "5 e meia" -> 5 1/2)
- "quarto" = 1/4
- "oitavo" = 1/8

SLANG EXAMPLES:
- "cinco fit e três inchas" → {"mode":"inches","a":"5' 3","op":"","b":""}
- "dois e três coras" → {"mode":"inches","a":"2 3/4","op":"","b":""}
- "dez e um eit menos dois e meia" → {"mode":"inches","a":"10 1/8","op":"-","b":"2 1/2"}

LANGUAGE EXAMPLES (STANDARD):
ENGLISH:
- "five and a half plus three and a quarter" → {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
PORTUGUESE:
- "cinco e meio mais três e um quarto" → {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
- "sete e três oitavos menos dois" → {"mode":"inches","a":"7 3/8","op":"-","b":"2"}

IMPORTANT: If the phrase mentions fractions or measurements, ALWAYS use mode:"inches".
Only use mode:"normal" for pure arithmetic without fractions.`;

  try {
    const start = Date.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this spoken phrase: "${input}"` }
        ]
      }),
    });

    const data = await response.json();
    const duration = Date.now() - start;

    if (!response.ok) {
      console.error("[API] OpenAI API Error:", data);
      return res.status(500).json({ error: "OpenAI error" });
    }

    const content = data?.choices?.[0]?.message?.content || "{}";
    
    // LOG TÉCNICO: Resposta bruta da IA
    console.log(`[API] OpenAI Response (${duration}ms):`, content);
    
    // Clean markdown if present
    let cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      console.error("[API] JSON Parse Error on content:", cleanContent);
      parsed = { error: true };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("[API] Server Internal Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}