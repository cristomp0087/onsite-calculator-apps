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

    // 2. WHISPER: Transcrever o áudio (A Mágica acontece aqui)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: "whisper-1",
      language: "en", // Dica: Whisper detecta auto, mas se quiser forçar misturado, pode deixar vazio ou 'en'/'pt'
      prompt: "Construction context. Terms: inches, feet, quarters, eighths, 3/8, 5/16. Portuguese and English mix.",
    });

    const transcribedText = transcription.text;
    console.log("[API] Whisper heard:", transcribedText);

    // 3. GPT-4o: Interpretar o texto transcrito
    const systemPrompt = `You are a parser for a construction calculator.
    INPUT: "${transcribedText}" (Transcribed via Whisper).
    
    Your job: Convert the text into JSON math.
    Return ONLY valid JSON.
    
    OUTPUT FORMATS:
    1. Fractions/Feet: {"mode":"inches","a":"5 1/2","op":"+","b":"3 1/4"}
    2. Normal Math: {"mode":"normal","expression":"40 - 8"}
    
    RULES:
    - Handle "Portinglish" (mistura de PT/EN).
    - "33 1/4" usually means "3 3/4" (split double digits).
    - "incha" = inches.
    - "fit" = feet.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Parse this result." }
      ]
    });

    const aiContent = completion.choices[0].message.content;
    const cleanContent = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log("[API] GPT Output:", cleanContent);

    return res.status(200).json(JSON.parse(cleanContent));

  } catch (error) {
    console.error("[API] Error:", error);
    return res.status(500).json({ error: "Server processing error" });
  }
}