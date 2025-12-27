import { IncomingForm } from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';

// IMPORTANTE: Desabilita o parser padrão do Vercel para aceitar upload de arquivos
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  const openai = new OpenAI({ apiKey });

  try {
    // 1. Receber o arquivo de áudio usando Formidable
    const data = await new Promise((resolve, reject) => {
      const form = new IncomingForm({ keepExtensions: true });
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });

    const audioFile = data.files.file?.[0];
    if (!audioFile) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    console.log("[API] Audio received:", audioFile.filepath);

    // 2. WHISPER: Transcrever o áudio
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: "whisper-1",
      prompt: "Construction measurements. Terms: inches, feet, quarter, eighth, half, sixteenth, 1/2, 1/4, 3/8, 5/16, plus, minus, times, divided by. Portuguese: polegada, pé, meio, quarto, oitavo. Mix of English and Portuguese.",
    });

    const transcribedText = transcription.text;
    console.log("[API] Whisper heard:", transcribedText);

    // 3. GPT-4o: Interpretar o texto transcrito
    // ATUALIZADO: Suporta múltiplas operações
    const systemPrompt = `You are a parser for a construction calculator that handles MULTIPLE operations.

INPUT: "${transcribedText}" (Transcribed via Whisper)

Your job: Convert the spoken phrase into a mathematical expression string.
Return ONLY valid JSON.

OUTPUT FORMAT:
{"mode":"inches","expression":"5 1/2 + 3 1/4 - 2"}

RULES FOR EXPRESSION:
- Use standard operators: + - * /
- Fractions: write as "1/2", "3/8", "1/16" etc
- Mixed numbers: whole + space + fraction: "5 1/2", "3 3/4"
- Feet: use apostrophe: "2'" or "2' 6"
- Multiple operations are allowed: "5 1/2 + 3 - 1/4 * 2"
- All numbers are assumed to be inches unless marked with '

LANGUAGE HANDLING (English, Portuguese, Spanish, French):
- "five and a half plus three and a quarter minus two" → "5 1/2 + 3 1/4 - 2"
- "cinco e meio mais três e um quarto menos dois" → "5 1/2 + 3 1/4 - 2"
- "três pés e duas polegadas" → "3' 2"
- "half of" or "metade de" = "* 1/2" or "/ 2"
- "double" or "dobro" = "* 2"
- "quarenta menos oito" → {"mode":"normal","expression":"40 - 8"}

COMMON CONSTRUCTION TERMS:
- "e meio" / "and a half" = 1/2
- "e um quarto" / "and a quarter" = 1/4  
- "e três quartos" / "and three quarters" = 3/4
- "e três oitavos" / "and three eighths" = 3/8
- "fit" (spoken) = feet (')
- "incha" (spoken) = inches

FIX SPEECH ERRORS:
- "103/8" → "10 3/8"
- "51/2" → "5 1/2"
- "33/4" → "3 3/4"
- Double digits followed by fraction usually means mixed number

IMPORTANT: Return mode:"inches" for any expression with fractions or construction measurements.
Return mode:"normal" ONLY for pure arithmetic without fractions.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Parse this transcription into a calculator expression." }
      ]
    });

    const aiContent = completion.choices[0].message.content;
    const cleanContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log("[API] GPT Output:", cleanContent);

    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (e) {
      console.error("[API] JSON parse error:", e);
      return res.status(200).json({ error: true, raw: cleanContent });
    }

    // Compatibilidade: se a IA retornar no formato antigo (a, op, b), converte
    if (parsed.a && !parsed.expression) {
      if (parsed.op && parsed.b) {
        parsed.expression = `${parsed.a} ${parsed.op} ${parsed.b}`;
      } else {
        parsed.expression = parsed.a;
      }
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error("[API] Error:", error);
    return res.status(500).json({ error: "Server processing error" });
  }
}
