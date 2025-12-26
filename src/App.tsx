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
// CONSTANTS
// ============================================
const API_ENDPOINT = '/api/interpret';

// RESTAURADO: O painel de frações original
const FRACTION_PAD = [
  ['1/8"', '1/4"', '3/8"', '1/2"'],
  ['5/8"', '3/4"', '7/8"', "'ft"],
];

// RESTAURADO: O teclado completo
const KEYPAD = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

// ============================================
// CALCULATION ENGINE (Lógica Matemática)
// ============================================
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
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    return feet * 12 + whole + num / den;
  }
  
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return feet * 12 + parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
  }
  
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

function evaluateExpression(expr: string): number | null {
  try {
    let e = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/[^\d\s\.\+\-\*\/\(\)]/g, '');
    
    const result = Function(`"use strict"; return (${e})`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function calculate(expression: string): CalculationResult | null {
  const expr = expression.trim();
  if (!expr) return null;
  
  console.log('[Math] Calculating:', expr);

  const hasInches = /['"]|\d+\/\d+/.test(expr);
  
  if (hasInches) {
    let tempExpr = expr;
    const fractions: string[] = [];
    
    tempExpr = tempExpr.replace(/(\d+\s+)?(\d+\/\d+)/g, (match) => {
      fractions.push(match);
      return `__FRAC${fractions.length - 1}__`;
    });
    
    const opMatch = tempExpr.match(/(.+?)\s*([\+\-\*])\s*(.+)/) || 
                    tempExpr.match(/(.+?)\s+(\/)\s+(.+)/);
    
    if (opMatch) {
      let aStr = opMatch[1];
      let op = opMatch[2];
      let bStr = opMatch[3];
      
      fractions.forEach((frac, i) => {
        aStr = aStr.replace(`__FRAC${i}__`, frac);
        bStr = bStr.replace(`__FRAC${i}__`, frac);
      });
      
      const a = parseInchValue(aStr);
      const b = parseInchValue(bStr);
      
      let result: number;
      switch (op) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/': result = b !== 0 ? a / b : NaN; break;
        default: return null;
      }
      
      return {
        result: formatInchResult(result),
        mode: 'inches',
        a: aStr.trim(),
        b: bStr.trim(),
        op
      };
    }
    
    const singleValue = parseInchValue(expr);
    if (!isNaN(singleValue)) {
      return {
        result: formatInchResult(singleValue),
        mode: 'inches',
        a: expr,
        b: '',
        op: ''
      };
    }
  }
  
  const result = evaluateExpression(expr);
  if (result !== null) {
    return {
      result: result.toString(),
      mode: 'normal',
      expression: expr
    };
  }
  
  return { result: 'Error', expression: expr };
}

// ============================================
// HOOK: AUDIO RECORDER (O Novo Ouvido)
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
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);
        
        // Limpa as faixas de áudio para desligar o microfone (luz vermelha do navegador)
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current = recorder;
      recorder.start();
      setIsRecording(true);
      console.log("[Audio] Recording started");
    } catch (err) {
      console.error("[Audio] Error accessing mic:", err);
      alert("Microphone access denied or not available. Please allow permissions.");
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
// ONLINE STATUS HOOK
// ============================================
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return isOnline;
}

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function App() {
  const isOnline = useOnlineStatus();
  
  const [expression, setExpression] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [lastResult, setLastResult] = useState<CalculationResult | null>(null);
  const [justCalculated, setJustCalculated] = useState(false);
  
  // Função para enviar o áudio gravado
  const handleAudioUpload = async (audioBlob: Blob) => {
    setVoiceState('processing');
    setDisplayValue('Thinking...');
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData,
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
          setJustCalculated(true);
        }
      } else if (data.mode === 'normal' && data.expression) {
        setExpression(data.expression);
        const res = calculate(data.expression);
        if (res) {
          setDisplayValue(res.result);
          setLastResult(res);
          setJustCalculated(true);
        }
      } else {
        // Fallback genérico se a IA retornar algo fora do padrão
        setDisplayValue('Try again');
      }
    } catch (error) {
      console.error(error);
      setDisplayValue('Error');
    } finally {
      setVoiceState('idle');
    }
  };

  const { isRecording, startRecording, stopRecording } = useAudioRecorder(handleAudioUpload);

  // Voice handlers
  const handleVoiceStart = (e: any) => {
    e.preventDefault(); // Previne seleção de texto no mobile
    if (!isOnline) return;
    
    if (voiceState === 'idle') {
      setVoiceState('recording');
      setDisplayValue('Gravando...');
      setExpression(''); // Limpa input anterior ao gravar novo
      startRecording();
    }
  };

  const handleVoiceEnd = (e: any) => {
    e.preventDefault();
    if (voiceState === 'recording') {
      stopRecording();
      // O estado muda para 'processing' dentro do callback handleAudioUpload
    }
  };

  // RESTAURADO: Lógica de teclado numérico
  const handleKeypadInput = useCallback((value: string) => {
    if (justCalculated && !'+-*/'.includes(value)) {
      setExpression(value);
      setJustCalculated(false);
    } else {
      setExpression(prev => prev + value);
      setJustCalculated(false);
    }
  }, [justCalculated]);

  const handleKeyClick = (key: string) => {
    switch (key) {
      case '=':
        const res = calculate(expression);
        if (res) {
          setDisplayValue(res.result);
          setLastResult(res);
          setJustCalculated(true);
        }
        break;
      case 'C':
        setExpression('');
        setDisplayValue('0');
        setLastResult(null);
        setJustCalculated(false);
        break;
      case '⌫':
        setExpression(prev => prev.slice(0, -1));
        setJustCalculated(false);
        break;
      case '÷':
        handleKeypadInput(' / ');
        break;
      case '×':
        handleKeypadInput(' * ');
        break;
      case '+':
      case '-':
        handleKeypadInput(` ${key} `);
        break;
      case '%':
        handleKeypadInput(' % ');
        break;
      default:
        handleKeypadInput(key);
    }
  };

  // RESTAURADO: Lógica de clique nas frações
  const handleFractionClick = (frac: string) => {
    if (frac === "'ft") {
      handleKeypadInput("' ");
    } else {
      // Adiciona fração com espaço se já houver número antes (ex: "5 1/2")
      const fracValue = frac.replace('"', '');
      if (expression && /\d$/.test(expression)) {
        handleKeypadInput(' ' + fracValue);
      } else {
        handleKeypadInput(fracValue);
      }
    }
  };

  const getVoiceButtonText = () => {
    if (!isOnline) return 'Offline';
    if (voiceState === 'recording') return 'Solte para Enviar';
    if (voiceState === 'processing') return 'Thinking...';
    return 'Segure para Falar';
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="logo">✓</div>
          <div className="brand-text">
            <span className="brand-title">OnSite</span>
            <span className="brand-subtitle">AI AUDIO</span>
          </div>
        </div>
        {!isOnline && <div className="offline-badge">Offline</div>}
        <a href="https://onsiteclub.ca" target="_blank" rel="noopener noreferrer" className="website-btn">
          🌐 Site
        </a>
      </header>

      <main className="main">
        {/* Left Card: Display & Voice */}
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
            onChange={(e) => {
              setExpression(e.target.value);
              setJustCalculated(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && calculate(expression)}
            placeholder="Resultado da IA aparecerá aqui..."
          />
          
          <button
            className={`voice-btn ${voiceState === 'recording' ? 'listening' : ''}`}
            disabled={!isOnline}
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceEnd}
            onMouseLeave={voiceState === 'recording' ? handleVoiceEnd : undefined}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceEnd}
          >
            <span className="voice-icon">{voiceState === 'recording' ? '🔴' : '🎙️'}</span>
            <span className="voice-text">{getVoiceButtonText()}</span>
          </button>

          {/* Memory Display (Restaurado) */}
          {lastResult && lastResult.mode === 'inches' && lastResult.a && lastResult.b && lastResult.op && (
            <div className="memory">
              <div>{lastResult.a}</div>
              <div>{lastResult.op} {lastResult.b}</div>
              <div className="memory-line">────────</div>
            </div>
          )}
        </div>

        {/* Right Card: Keypad & Fractions (Restaurado) */}
        <div className="card right-card">
          <div className="fraction-label">MEASURES</div>
          
          {/* Grid de Frações (Recuperado) */}
          <div className="fraction-pad">
            {FRACTION_PAD.flat().map((frac, i) => (
              <button
                key={i}
                className={`frac-btn ${frac === "'ft" ? 'feet' : ''}`}
                onClick={() => handleFractionClick(frac)}
              >
                {frac}
              </button>
            ))}
          </div>

          {/* Grid Numérico (Recuperado) */}
          <div className="keypad">
            {KEYPAD.map((row, rowIndex) => (
              <div key={rowIndex} className={`keypad-row ${rowIndex === KEYPAD.length - 1 ? 'last-row' : ''}`}>
                {row.map((key, keyIndex) => (
                  <button
                    key={keyIndex}
                    className={`key ${key === '=' ? 'equals' : ''} ${key === 'C' || key === '⌫' ? 'danger' : ''} ${'÷×-+%'.includes(key) ? 'operator' : ''}`}
                    onClick={() => handleKeyClick(key)}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}