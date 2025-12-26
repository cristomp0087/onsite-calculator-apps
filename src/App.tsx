import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// ============================================
// TYPES
// ============================================
type VoiceState = 'idle' | 'recording' | 'processing';

interface CalculationResult {
  result: string;
  expression?: string;
  mode?: 'normal' | 'inches';
  a?: string;
  b?: string;
  op?: string;
}

// ============================================
// CONSTANTS & HELPERS
// ============================================
const API_ENDPOINT = '/api/interpret';

const FRACTION_PAD = [
  ['1/8"', '1/4"', '3/8"', '1/2"'],
  ['5/8"', '3/4"', '7/8"', "'ft"],
];

const KEYPAD = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

// Funções Matemáticas (Mantidas iguais)
function parseInchValue(str: string): number {
  let s = str.trim().replace(/"/g, '');
  let feet = 0;
  if (s.includes("'")) {
    const parts = s.split("'");
    feet = parseFloat(parts[0]) || 0;
    s = parts[1] || '';
  }
  s = s.trim();
  if (!s) return feet * 12;
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return feet * 12 + parseFloat(mixedMatch[1]) + parseFloat(mixedMatch[2]) / parseFloat(mixedMatch[3]);
  }
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return feet * 12 + parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
  return feet * 12 + (parseFloat(s) || 0);
}

function formatInchResult(inches: number): string {
  if (!isFinite(inches)) return 'Error';
  const negative = inches < 0;
  inches = Math.abs(inches);
  const feet = Math.floor(inches / 12);
  let remaining = inches % 12;
  const whole = Math.floor(remaining);
  const frac = remaining - whole;
  const sixteenths = Math.round(frac * 16);
  let fracStr = '';
  if (sixteenths > 0 && sixteenths < 16) {
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const d = gcd(sixteenths, 16);
    fracStr = ` ${sixteenths / d}/${16 / d}`;
  }
  let result = '';
  if (feet > 0) result += `${feet}' `;
  if (whole > 0 || (feet === 0 && !fracStr)) result += whole;
  result += fracStr;
  result += '"';
  return (negative ? '-' : '') + result.trim();
}

function calculate(expression: string): CalculationResult | null {
  const expr = expression.trim();
  if (!expr) return null;
  console.log('[Math] Calculating:', expr);

  const hasInches = /['"]|\d+\/\d+/.test(expr);
  if (hasInches) {
    // Lógica simples para pegar 2 valores + operador
    // Ajustado para robustez
    let tempExpr = expr;
    const fractions: string[] = [];
    tempExpr = tempExpr.replace(/(\d+\s+)?(\d+\/\d+)/g, (match) => {
      fractions.push(match);
      return `__FRAC${fractions.length - 1}__`;
    });
    
    const opMatch = tempExpr.match(/(.+?)\s*([\+\-\*\/])\s*(.+)/);
    
    if (opMatch) {
      let [_, aStr, op, bStr] = opMatch;
      fractions.forEach((frac, i) => {
        aStr = aStr.replace(`__FRAC${i}__`, frac);
        bStr = bStr.replace(`__FRAC${i}__`, frac);
      });
      const a = parseInchValue(aStr);
      const b = parseInchValue(bStr);
      let res = 0;
      if (op === '+') res = a + b;
      if (op === '-') res = a - b;
      if (op === '*') res = a * b;
      if (op === '/') res = b !== 0 ? a / b : NaN;
      return { result: formatInchResult(res), mode: 'inches', a: aStr, b: bStr, op };
    }
    const val = parseInchValue(expr);
    if (!isNaN(val)) return { result: formatInchResult(val), mode: 'inches', a: expr, b:'', op:'' };
  }

  try {
    // Math seguro
    const safeExpr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/[^\d\s\.\+\-\*\/\(\)]/g, '');
    const res = Function(`"use strict"; return (${safeExpr})`)();
    return { result: res.toString(), mode: 'normal', expression: expr };
  } catch {
    return { result: 'Error', expression: expr };
  }
}

// ============================================
// HOOK: AUDIO RECORDER (Novo "Ouvido")
// ============================================
function useAudioRecorder(onRecordingComplete: (audioBlob: Blob) => void) {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);
        stream.getTracks().forEach(track => track.stop()); // Limpa mic
      };

      mediaRecorder.current = recorder;
      recorder.start();
      setIsRecording(true);
      console.log("[Audio] Recording started");
    } catch (err) {
      console.error("[Audio] Error accessing mic:", err);
      alert("Microphone access denied or not available.");
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      setIsRecording(false);
      console.log("[Audio] Recording stopped");
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [expression, setExpression] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [lastResult, setLastResult] = useState<CalculationResult | null>(null);
  
  // Função para enviar o áudio
  const handleAudioUpload = async (audioBlob: Blob) => {
    setVoiceState('processing');
    setDisplayValue('Thinking...');
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData, // Envia como arquivo
      });

      if (!response.ok) throw new Error('API Error');
      
      const data = await response.json();
      console.log("[App] AI Response:", data);

      if (data.mode === 'inches' && data.a) {
        const expr = data.op ? `${data.a} ${data.op} ${data.b}` : data.a;
        setExpression(expr);
        const res = calculate(expr);
        if (res) {
          setDisplayValue(res.result);
          setLastResult(res);
        }
      } else if (data.mode === 'normal' && data.expression) {
        setExpression(data.expression);
        const res = calculate(data.expression);
        if (res) {
          setDisplayValue(res.result);
          setLastResult(res);
        }
      }
    } catch (error) {
      console.error(error);
      setDisplayValue('Error');
    } finally {
      setVoiceState('idle');
    }
  };

  const { isRecording, startRecording, stopRecording } = useAudioRecorder(handleAudioUpload);

  const handleVoiceStart = (e: any) => {
    e.preventDefault(); // Evita seleção de texto no mobile
    if (voiceState === 'idle') {
      setVoiceState('recording');
      setDisplayValue('Gravando...');
      startRecording();
    }
  };

  const handleVoiceEnd = (e: any) => {
    e.preventDefault();
    if (voiceState === 'recording') {
      stopRecording();
      // O estado muda para 'processing' dentro do handleAudioUpload
    }
  };

  // Handler simples para botões
  const handleKey = (val: string) => {
    if (val === '=') {
      const res = calculate(expression);
      if (res) { setDisplayValue(res.result); setLastResult(res); }
      return;
    }
    if (val === 'C') { setExpression(''); setDisplayValue('0'); setLastResult(null); return; }
    if (val === '⌫') { setExpression(prev => prev.slice(0, -1)); return; }
    
    let char = val;
    if (val === '÷') char = ' / ';
    else if (val === '×') char = ' * ';
    else if (val === '+' || val === '-') char = ` ${val} `;
    
    setExpression(prev => prev + char);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">✓</div>
          <div className="brand-text">
            <span className="brand-title">OnSite</span>
            <span className="brand-subtitle">AI AUDIO</span>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="card left-card">
          <div className="display-section">
            <div className="display-label">RESULT</div>
            <div className={`display ${voiceState}`}>{displayValue}</div>
          </div>
          
          <div className="divider" />
          
          <input
            type="text"
            className="expression-input"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="Resultado da IA aparecerá aqui..."
            readOnly // Foca na voz por enquanto
          />
          
          <button
            className={`voice-btn ${voiceState === 'recording' ? 'listening' : ''}`}
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceEnd}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceEnd}
          >
            <span className="voice-icon">{voiceState === 'recording' ? '🔴' : '🎙️'}</span>
            <span className="voice-text">
              {voiceState === 'recording' ? 'Solte para Enviar' : 
               voiceState === 'processing' ? 'Processando...' : 'Segure para Falar'}
            </span>
          </button>

          {lastResult && lastResult.mode === 'inches' && (
            <div className="memory">
              <div>{lastResult.a}</div>
              <div>{lastResult.op} {lastResult.b}</div>
            </div>
          )}
        </div>

        <div className="card right-card">
           {/* Keypad Simplificado para brevidade do exemplo */}
           <div className="keypad">
            {KEYPAD.map((row, i) => (
              <div key={i} className="keypad-row">
                {row.map((k) => (
                  <button key={k} className="key" onClick={() => handleKey(k)}>{k}</button>
                ))}
              </div>
            ))}
           </div>
        </div>
      </main>
    </div>
  );
}