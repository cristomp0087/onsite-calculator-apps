import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// ============================================
// TYPES
// ============================================
type VoiceState = 'idle' | 'recording' | 'processing';

interface CalculationResult {
  result: string;
  expression: string;
  steps?: string[];
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
// CALCULATION ENGINE - MULTI-OPERAÇÃO COM PEMDAS
// ============================================

/**
 * Converte um valor (com ou sem fração/feet) para polegadas decimais
 * Exemplos: "5 1/2" → 5.5, "3'" → 36, "2' 6" → 30, "7" → 7
 */
function parseToInches(str: string): number {
  let s = str.trim().replace(/"/g, '');
  let totalInches = 0;
  
  // Verifica se tem feet (apóstrofo)
  if (s.includes("'")) {
    const parts = s.split("'");
    const feet = parseFloat(parts[0]) || 0;
    totalInches += feet * 12;
    s = parts[1] || '';
    s = s.trim();
  }
  
  if (!s) return totalInches;
  
  // Mixed number: "5 1/2" ou "10 3/8"
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    return totalInches + whole + (num / den);
  }
  
  // Simple fraction: "1/2" ou "3/8"
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return totalInches + (parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]));
  }
  
  // Whole number or decimal
  return totalInches + (parseFloat(s) || 0);
}

/**
 * Formata polegadas decimais para formato de construção
 * Exemplo: 11.5 → "11 1/2""
 */
function formatInches(inches: number): string {
  if (!isFinite(inches)) return 'Error';
  
  const negative = inches < 0;
  inches = Math.abs(inches);
  
  const feet = Math.floor(inches / 12);
  let remaining = inches % 12;
  
  const whole = Math.floor(remaining);
  const frac = remaining - whole;
  
  // Arredonda para o 1/16 mais próximo
  const sixteenths = Math.round(frac * 16);
  let fracStr = '';
  
  if (sixteenths > 0 && sixteenths < 16) {
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const d = gcd(sixteenths, 16);
    fracStr = ` ${sixteenths / d}/${16 / d}`;
  } else if (sixteenths === 16) {
    // Arredondou pra cima
    remaining = whole + 1;
  }
  
  let result = '';
  if (feet > 0) result += `${feet}' `;
  if (whole > 0 || (feet === 0 && !fracStr)) result += whole;
  result += fracStr;
  result += '"';
  
  return (negative ? '-' : '') + result.trim();
}

/**
 * TOKENIZER: Quebra a expressão em tokens (números e operadores)
 * "5 1/2 + 3 1/4 - 2" → ["5 1/2", "+", "3 1/4", "-", "2"]
 */
function tokenize(expression: string): string[] {
  const tokens: string[] = [];
  let current = '';
  const expr = expression.trim();
  
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    const nextChar = expr[i + 1] || '';
    
    // Operadores (com espaço antes ou depois indica que é operador, não fração)
    if ((char === '+' || char === '-' || char === '*' || char === '/' || char === '×' || char === '÷') 
        && current.trim() !== '' 
        && (expr[i-1] === ' ' || nextChar === ' ' || nextChar === '' || i === expr.length - 1)) {
      
      // Verifica se não é parte de uma fração (ex: 1/2)
      // Fração: número/número sem espaços ao redor
      if (char === '/' && /\d$/.test(current.trim()) && /^\d/.test(nextChar)) {
        // É uma fração, continua acumulando
        current += char;
        continue;
      }
      
      // É um operador
      if (current.trim()) {
        tokens.push(current.trim());
      }
      
      // Normaliza operadores
      let op = char;
      if (char === '×') op = '*';
      if (char === '÷') op = '/';
      tokens.push(op);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Último token
  if (current.trim()) {
    tokens.push(current.trim());
  }
  
  console.log('[Tokenizer] Input:', expression, '→ Tokens:', tokens);
  return tokens;
}

/**
 * PARSER/EVALUATOR: Avalia tokens respeitando PEMDAS
 * Primeiro processa * e /, depois + e -
 */
function evaluateTokens(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  if (tokens.length === 1) return parseToInches(tokens[0]);
  
  // Converte valores para números (polegadas)
  let values: (number | string)[] = tokens.map((t, i) => {
    if (i % 2 === 0) {
      // Posição par = valor
      return parseToInches(t);
    }
    return t; // Operador
  });
  
  console.log('[Evaluator] Parsed values:', values);
  
  // PASSO 1: Processa * e / (maior precedência)
  let i = 1;
  while (i < values.length) {
    const op = values[i];
    if (op === '*' || op === '/') {
      const left = values[i - 1] as number;
      const right = values[i + 1] as number;
      let result: number;
      
      if (op === '*') {
        result = left * right;
      } else {
        result = right !== 0 ? left / right : NaN;
      }
      
      // Remove os 3 elementos (left, op, right) e insere o resultado
      values.splice(i - 1, 3, result);
      // Não incrementa i, pois o array encolheu
    } else {
      i += 2; // Pula para o próximo operador
    }
  }
  
  console.log('[Evaluator] After * /:', values);
  
  // PASSO 2: Processa + e - (menor precedência)
  i = 1;
  while (i < values.length) {
    const op = values[i];
    if (op === '+' || op === '-') {
      const left = values[i - 1] as number;
      const right = values[i + 1] as number;
      let result: number;
      
      if (op === '+') {
        result = left + right;
      } else {
        result = left - right;
      }
      
      values.splice(i - 1, 3, result);
      // Não incrementa i
    } else {
      i += 2;
    }
  }
  
  console.log('[Evaluator] Final result:', values[0]);
  return values[0] as number;
}

/**
 * FUNÇÃO PRINCIPAL DE CÁLCULO
 * Aceita expressões como: "5 1/2 + 3 1/4 - 2 * 1/2"
 */
function calculate(expression: string): CalculationResult | null {
  const expr = expression.trim();
  if (!expr) return null;
  
  console.log('[Calculate] Input:', expr);
  
  try {
    // Verifica se tem conteúdo de polegadas (frações, feet, ou aspas)
    const hasInchContent = /['"]|\d+\/\d+/.test(expr);
    
    // Se não tem conteúdo de polegadas E é uma expressão matemática simples
    if (!hasInchContent && /^[\d\s\.\+\-\*\/\×\÷\(\)]+$/.test(expr)) {
      // Avaliação matemática pura (sem polegadas)
      try {
        const cleanExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');
        const result = Function(`"use strict"; return (${cleanExpr})`)();
        if (typeof result === 'number' && isFinite(result)) {
          return {
            result: result.toString(),
            expression: expr
          };
        }
      } catch {
        // Continua para tentar como polegadas
      }
    }
    
    // Tokeniza e avalia como expressão de polegadas
    const tokens = tokenize(expr);
    
    if (tokens.length === 0) {
      return { result: 'Error', expression: expr };
    }
    
    const resultInches = evaluateTokens(tokens);
    const formatted = formatInches(resultInches);
    
    return {
      result: formatted,
      expression: expr
    };
    
  } catch (error) {
    console.error('[Calculate] Error:', error);
    return { result: 'Error', expression: expr };
  }
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

      // A IA retorna a expressão interpretada, nós calculamos localmente
      let exprToCalculate = '';
      
      if (data.mode === 'inches' && data.a) {
        // Monta a expressão a partir dos componentes
        if (data.op && data.b) {
          exprToCalculate = `${data.a} ${data.op} ${data.b}`;
        } else {
          exprToCalculate = data.a;
        }
      } else if (data.mode === 'normal' && data.expression) {
        exprToCalculate = data.expression;
      }
      
      if (exprToCalculate) {
        setExpression(exprToCalculate);
        const res = calculate(exprToCalculate);
        if (res) {
          setDisplayValue(res.result);
          setLastResult(res);
          setJustCalculated(true);
        } else {
          setDisplayValue('Error');
        }
      } else {
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
      setDisplayValue('🎙️');
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
    if (voiceState === 'recording') return 'Release to Send';
    if (voiceState === 'processing') return 'Thinking...';
    return 'Hold to Speak';
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const res = calculate(expression);
                if (res) {
                  setDisplayValue(res.result);
                  setLastResult(res);
                  setJustCalculated(true);
                }
              }
            }}
            placeholder="Type or speak: 5 1/2 + 3 1/4 - 2"
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

          {/* Memory Display */}
          {lastResult && lastResult.expression && (
            <div className="memory">
              <div className="memory-expr">{lastResult.expression}</div>
              <div className="memory-line">────────</div>
            </div>
          )}
        </div>

        {/* Right Card: Keypad & Fractions */}
        <div className="card right-card">
          <div className="fraction-label">MEASURES</div>
          
          {/* Grid de Frações */}
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

          {/* Grid Numérico */}
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
