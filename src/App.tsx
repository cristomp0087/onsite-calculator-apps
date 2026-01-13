import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';
import VoiceUpgradePopup from './components/VoiceUpgradePopup';

// ============================================
// TYPES
// ============================================
type VoiceState = 'idle' | 'recording' | 'processing';

interface CalculationResult {
  resultFeetInches: string;
  resultTotalInches: string;
  resultDecimal: number;
  expression: string;
  isInchMode: boolean;
}

// ============================================
// CONSTANTS
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

// ============================================
// CALCULATION ENGINE
// ============================================

function parseToInches(str: string): number {
  let s = str.trim().replace(/"/g, '');
  let totalInches = 0;
  
  if (s.includes("'")) {
    const parts = s.split("'");
    const feet = parseFloat(parts[0]) || 0;
    totalInches += feet * 12;
    s = parts[1] || '';
    s = s.trim();
  }
  
  if (!s) return totalInches;
  
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    return totalInches + whole + (num / den);
  }
  
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return totalInches + (parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]));
  }
  
  return totalInches + (parseFloat(s) || 0);
}

function formatInches(inches: number): string {
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
  } else if (sixteenths === 16) {
    remaining = whole + 1;
  }
  
  let result = '';
  if (feet > 0) result += `${feet}' `;
  if (whole > 0 || (feet === 0 && !fracStr)) result += whole;
  result += fracStr;
  result += '"';
  
  return (negative ? '-' : '') + result.trim();
}

function formatTotalInches(inches: number): string {
  if (!isFinite(inches)) return 'Error';
  const negative = inches < 0;
  inches = Math.abs(inches);
  const whole = Math.floor(inches);
  const frac = inches - whole;
  const sixteenths = Math.round(frac * 16);
  let fracStr = '';
  if (sixteenths > 0 && sixteenths < 16) {
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const d = gcd(sixteenths, 16);
    fracStr = ` ${sixteenths / d}/${16 / d}`;
  }
  return (negative ? '-' : '') + whole + fracStr + ' In';
}

function formatNumber(num: number): string {
  if (!isFinite(num)) return 'Error';
  if (Number.isInteger(num)) return num.toString();
  return parseFloat(num.toFixed(2)).toString();
}

function tokenize(expression: string): string[] {
  const tokens: string[] = [];
  let current = '';
  const expr = expression.trim();
  
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    const nextChar = expr[i + 1] || '';
    
    if ((char === '+' || char === '-' || char === '*' || char === '/' || char === '×' || char === '÷') 
        && current.trim() !== '' 
        && (expr[i-1] === ' ' || nextChar === ' ' || nextChar === '' || i === expr.length - 1)) {
      
      if (char === '/' && /\d$/.test(current.trim()) && /^\d/.test(nextChar)) {
        current += char;
        continue;
      }
      
      if (current.trim()) tokens.push(current.trim());
      
      let op = char;
      if (char === '×') op = '*';
      if (char === '÷') op = '/';
      tokens.push(op);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function evaluateTokens(tokens: string[]): number {
  if (tokens.length === 0) return 0;
  if (tokens.length === 1) return parseToInches(tokens[0]);
  
  let values: (number | string)[] = tokens.map((t, i) => {
    if (i % 2 === 0) return parseToInches(t);
    return t;
  });
  
  let i = 1;
  while (i < values.length) {
    const op = values[i];
    if (op === '*' || op === '/') {
      const left = values[i - 1] as number;
      const right = values[i + 1] as number;
      let result = op === '*' ? left * right : (right !== 0 ? left / right : NaN);
      values.splice(i - 1, 3, result);
    } else {
      i += 2;
    }
  }
  
  i = 1;
  while (i < values.length) {
    const op = values[i];
    if (op === '+' || op === '-') {
      const left = values[i - 1] as number;
      const right = values[i + 1] as number;
      let result = op === '+' ? left + right : left - right;
      values.splice(i - 1, 3, result);
    } else {
      i += 2;
    }
  }
  return values[0] as number;
}

function calculate(expression: string): CalculationResult | null {
  const expr = expression.trim();
  if (!expr) return null;
  
  try {
    if (expr.includes('%')) {
      const percentMatch = expr.match(/^([\d.]+)\s*([\+\-])\s*([\d.]+)\s*%$/);
      if (percentMatch) {
        const base = parseFloat(percentMatch[1]);
        const op = percentMatch[2];
        const percent = parseFloat(percentMatch[3]);
        const percentValue = base * (percent / 100);
        const result = op === '+' ? base + percentValue : base - percentValue;
        return {
          resultFeetInches: formatNumber(result),
          resultTotalInches: formatNumber(result),
          resultDecimal: result,
          expression: expr,
          isInchMode: false
        };
      }
      
      const simplePercentMatch = expr.match(/^([\d.]+)\s*%\s*(?:of|de|×|\*)?\s*([\d.]+)$/i) ||
                                 expr.match(/^([\d.]+)\s*(?:×|\*)\s*([\d.]+)\s*%$/);
      if (simplePercentMatch) {
        const a = parseFloat(simplePercentMatch[1]);
        const b = parseFloat(simplePercentMatch[2]);
        const result = expr.includes('%') && expr.indexOf('%') < expr.length / 2 
          ? (a / 100) * b 
          : a * (b / 100);
        return {
          resultFeetInches: formatNumber(result),
          resultTotalInches: formatNumber(result),
          resultDecimal: result,
          expression: expr,
          isInchMode: false
        };
      }
    }
    
    const hasInchContent = /['"]|\d+\/\d+/.test(expr);
    if (!hasInchContent && /^[\d\s\.\+\-\*\/\×\÷\(\)%]+$/.test(expr)) {
      try {
        const cleanExpr = expr.replace(/×/g, '*').replace(/÷/g, '/');
        const result = Function(`"use strict"; return (${cleanExpr})`)();
        if (typeof result === 'number' && isFinite(result)) {
          return {
            resultFeetInches: result.toString(),
            resultTotalInches: result.toString(),
            resultDecimal: result,
            expression: expr,
            isInchMode: false
          };
        }
      } catch {}
    }
    
    const tokens = tokenize(expr);
    if (tokens.length === 0) throw new Error("Empty tokens");
    
    const resultInches = evaluateTokens(tokens);
    return {
      resultFeetInches: formatInches(resultInches),
      resultTotalInches: formatTotalInches(resultInches),
      resultDecimal: resultInches,
      expression: expr,
      isInchMode: true
    };
    
  } catch (error) {
    console.error('[Calculate] Error:', error);
    return { 
      resultFeetInches: 'Error', 
      resultTotalInches: 'Error',
      resultDecimal: 0,
      expression: expr,
      isInchMode: true
    };
  }
}

// ============================================
// HOOKS
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
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("[Audio] Error accessing mic:", err);
      alert("Microphone access denied or not available.");
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}

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
// MAIN APP COMPONENT (NO AUTH)
// ============================================
export default function App() {
  const isOnline = useOnlineStatus();
  
  // States
  const [hasVoiceAccess] = useState(true); // Sempre true (Free)
  const [showVoicePopup, setShowVoicePopup] = useState(false);
  
  // Calculator state
  const [expression, setExpression] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [lastResult, setLastResult] = useState<CalculationResult | null>(null);
  const [justCalculated, setJustCalculated] = useState(false);
  
  // Handle voice button
  const handleVoiceButtonClick = () => {
    // Se quiser bloquear no futuro, mude hasVoiceAccess para false e descomente abaixo
    /* if (!hasVoiceAccess) {
      setShowVoicePopup(true);
      return false;
    } */
    return true;
  };
  
  // Audio Upload
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
      
      let exprToCalculate = '';
      if (data.expression) {
        exprToCalculate = data.expression;
      } else if (data.a) {
        if (data.op && data.b) {
          exprToCalculate = `${data.a} ${data.op} ${data.b}`;
        } else {
          exprToCalculate = data.a;
        }
      }
      
      if (exprToCalculate) {
        setExpression(exprToCalculate);
        const res = calculate(exprToCalculate);
        if (res) {
          setDisplayValue(res.resultFeetInches);
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

  const handleVoiceStart = (e: any) => {
    e.preventDefault();
    if (!isOnline) return;
    if (!handleVoiceButtonClick()) return;
    
    if (voiceState === 'idle') {
      setVoiceState('recording');
      setDisplayValue('🎙️');
      setExpression('');
      startRecording();
    }
  };

  const handleVoiceEnd = (e: any) => {
    e.preventDefault();
    if (voiceState === 'recording') {
      stopRecording();
    }
  };

  const handleKeypadInput = useCallback((value: string) => {
    const isOperator = [' + ', ' - ', ' * ', ' / ', ' % '].includes(value);
    
    if (justCalculated) {
      if (isOperator && lastResult) {
        const previousResult = lastResult.isInchMode 
          ? lastResult.resultFeetInches.replace('"', '')
          : lastResult.resultFeetInches;
        setExpression(previousResult + value);
        setJustCalculated(false);
      } else {
        setExpression(value);
        setJustCalculated(false);
      }
    } else {
      setExpression(prev => prev + value);
    }
  }, [justCalculated, lastResult]);

  const handleKeyClick = (key: string) => {
    switch (key) {
      case '=':
        const res = calculate(expression);
        if (res) {
          setDisplayValue(res.resultFeetInches);
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

  const handleFractionClick = (frac: string) => {
    if (frac === "'ft") {
      handleKeypadInput("' ");
    } else {
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
    if (!hasVoiceAccess) return '🔒 Upgrade to Voice';
    if (voiceState === 'recording') return 'Release to Send';
    if (voiceState === 'processing') return 'Thinking...';
    return 'Hold to Speak';
  };

  return (
    <div className="app">
      {/* Voice Upgrade Popup (Opcional, se quiser manter a UI) */}
      {showVoicePopup && (
        <VoiceUpgradePopup 
          onClose={() => setShowVoicePopup(false)} 
        />
      )}
      
      {/* Header */}
      <header className="header">
        <div className="brand">
          <div className="logo">✓</div>
          <div className="brand-text">
            <span className="brand-title">OnSite</span>
            <span className="brand-subtitle">CALCULATOR</span>
          </div>
        </div>
        <div className="header-actions">
          {!isOnline && <div className="offline-badge">Offline</div>}
          {/* Botão Logout removido */}
        </div>
      </header>

      <main className="main">
        {/* Left Card: Display & Voice */}
        <div className="card left-card">
          <div className="display-section">
            <div className="display-row">
              <div className="display-box primary">
                <span className={`display-value ${voiceState}`}>
                  {lastResult?.isInchMode ? lastResult.resultFeetInches : displayValue}
                </span>
              </div>
              {lastResult?.isInchMode && (
                <div className="display-box secondary">
                  <span className="display-value-secondary">{lastResult.resultTotalInches}</span>
                </div>
              )}
            </div>
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
                  setDisplayValue(res.resultFeetInches);
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