import React, { useState, useCallback, useRef, useEffect } from 'react';
import './App.css';

// ============================================
// TYPES
// ============================================
type VoiceState = 'idle' | 'listening' | 'processing';

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
  
  // Handle mixed numbers: "3 1/4" or "10 3/8"
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    return feet * 12 + whole + num / den;
  }
  
  // Handle simple fractions: "1/2" or "3/8"
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return feet * 12 + parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
  }
  
  // Handle whole numbers
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
  
  // Find closest 16th
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
    console.warn('[Math] Evaluation failed for:', expr);
    return null;
  }
}

function calculate(expression: string): CalculationResult | null {
  const expr = expression.trim();
  if (!expr) return null;
  
  console.log('[Math] Calculating:', expr);

  // Check if it's an inch calculation (has fractions or feet)
  const hasInches = /['"]|\d+\/\d+/.test(expr);
  
  if (hasInches) {
    let tempExpr = expr;
    const fractions: string[] = [];
    
    // Captura todas as frações
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
  
  // Normal calculation
  const result = evaluateExpression(expr);
  if (result !== null) {
    return {
      result: result.toString(),
      mode: 'normal',
      expression: expr
    };
  }
  
  console.error('[Math] Calculation Error');
  return { result: 'Error', expression: expr };
}

// ============================================
// SPEECH RECOGNITION
// ============================================
function useSpeechRecognition(onResult: (text: string) => void) {
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);

  const start = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('[Voice] Speech API not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    // ALTERADO: pt-BR para suportar melhor sotaques brasileiros e "Portinglês"
    recognition.lang = 'pt-BR'; 

    recognition.onstart = () => console.log('[Voice] Started listening (pt-BR)...');
    
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      // LOG TÉCNICO: O que o navegador está ouvindo
      console.log('[Voice] Interim:', transcript); 
      onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('[Voice] Error:', event.error);
      setIsListening(false);
    };
    
    recognition.onend = () => {
      console.log('[Voice] Stopped');
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [onResult]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, start, stop };
}

// ============================================
// API SERVICE
// ============================================
async function interpretWithAI(text: string): Promise<any> {
  console.log('[API] Sending request for:', text);
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: 'auto' })
    });
    
    if (!response.ok) throw new Error(`Status ${response.status}`);
    
    const data = await response.json();
    console.log('[API] Response received:', data);
    return data;
  } catch (error) {
    console.error('[API] Request failed:', error);
    return { error: true };
  }
}

// ============================================
// ONLINE STATUS HOOK
// ============================================
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Net] Online');
      setIsOnline(true);
    };
    const handleOffline = () => {
      console.warn('[Net] Offline');
      setIsOnline(false);
    };
    
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
  
  const transcriptRef = useRef('');
  
  const { isListening, start: startListening, stop: stopListening } = useSpeechRecognition(
    (text) => {
      transcriptRef.current = text;
      setExpression(text);
    }
  );

  // Handle calculation
  const handleCalculate = useCallback(() => {
    const result = calculate(expression);
    if (result) {
      setDisplayValue(result.result);
      setLastResult(result);
      setJustCalculated(true);
    }
  }, [expression]);

  // Handle AI interpretation
  const handleAIInterpret = useCallback(async (text: string) => {
    if (!text.trim()) {
      setDisplayValue('0');
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');
    setDisplayValue('Thinking...'); // UI Limpa para o usuário

    try {
      const aiResult = await interpretWithAI(text);
      
      if (aiResult.error) {
        console.warn('[App] AI failed, attempting fallback...');
        const localResult = calculate(text);
        if (localResult && !localResult.result.includes('Error')) {
          setDisplayValue(localResult.result);
          setLastResult(localResult);
        } else {
          setDisplayValue('Try again');
        }
      } else if (aiResult.mode === 'inches' && aiResult.a && aiResult.b && aiResult.op) {
        const expr = `${aiResult.a} ${aiResult.op} ${aiResult.b}`;
        setExpression(expr);
        console.log('[App] Executing AI instruction:', expr);
        const result = calculate(expr);
        if (result) {
          setDisplayValue(result.result);
          setLastResult(result);
        }
      } else if (aiResult.mode === 'normal' && aiResult.expression) {
        setExpression(aiResult.expression);
        const result = calculate(aiResult.expression);
        if (result) {
          setDisplayValue(result.result);
          setLastResult(result);
        }
      } else {
        const localResult = calculate(text);
        if (localResult) {
          setDisplayValue(localResult.result);
          setLastResult(localResult);
        }
      }
    } catch (e) {
      console.error('[App] Critical error:', e);
      setDisplayValue('Error');
    }
    
    setVoiceState('idle');
    setJustCalculated(true);
  }, []);

  // Voice button handlers
  const handleVoiceStart = useCallback(() => {
    setExpression('');
    transcriptRef.current = '';
    setJustCalculated(false);
    setDisplayValue('🎙️');
    setVoiceState('listening');
    startListening();
  }, [startListening]);

  const handleVoiceEnd = useCallback(async () => {
    stopListening();
    setVoiceState('processing');
    setDisplayValue('Thinking...');
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const finalText = transcriptRef.current || expression;
    console.log('[App] Voice session ended. Final text:', finalText);
    await handleAIInterpret(finalText);
  }, [stopListening, expression, handleAIInterpret]);

  // Keypad input
  const handleKeypadInput = useCallback((value: string) => {
    if (justCalculated && !'+-*/'.includes(value)) {
      setExpression(value);
      setJustCalculated(false);
    } else {
      setExpression(prev => prev + value);
      setJustCalculated(false);
    }
  }, [justCalculated]);

  // Handle key click
  const handleKeyClick = (key: string) => {
    switch (key) {
      case '=':
        handleCalculate();
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
    if (voiceState === 'listening') return 'Listening...';
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
            <span className="brand-subtitle">CALCULATOR</span>
          </div>
        </div>
        {!isOnline && <div className="offline-badge">Offline</div>}
        <a href="https://onsiteclub.ca" target="_blank" rel="noopener noreferrer" className="website-btn">
          🌐 Site
        </a>
      </header>

      <main className="main">
        {/* Left side - Display & Voice */}
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
            onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
            placeholder="Speak or type..."
          />
          
          <button
            className={`voice-btn ${voiceState === 'listening' ? 'listening' : ''}`}
            disabled={!isOnline}
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceEnd}
            onMouseLeave={voiceState === 'listening' ? handleVoiceEnd : undefined}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceEnd}
          >
            <span className="voice-icon">{voiceState === 'listening' ? '🔴' : '🎙️'}</span>
            <span className="voice-text">{getVoiceButtonText()}</span>
          </button>

          {/* Memory display */}
          {lastResult && lastResult.mode === 'inches' && lastResult.a && lastResult.b && lastResult.op && (
            <div className="memory">
              <div>{lastResult.a}</div>
              <div>{lastResult.op} {lastResult.b}</div>
              <div className="memory-line">────────</div>
            </div>
          )}
        </div>

        {/* Right side - Keypad */}
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