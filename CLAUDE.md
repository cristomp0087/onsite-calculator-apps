# CLAUDE.md - OnSite Calculator Apps

Este arquivo fornece contexto para o Claude Code entender rapidamente este codebase.

## Visao Geral do Projeto

**OnSite Calculator** é uma calculadora voltada para construção civil que suporta:
- Medidas em pés e polegadas (ex: `5' 6 1/2"`)
- Frações comuns de construção (1/8, 1/4, 3/8, 1/2, etc.)
- Entrada por voz com IA (OpenAI Whisper + GPT-4o)
- Apps nativos via Capacitor (Android/iOS)

## Stack Tecnológico

```
Frontend:     React 18 + TypeScript + Vite
Mobile:       Capacitor 8 (Android/iOS)
Backend:      Vercel Serverless Functions
AI:           OpenAI (Whisper para transcrição, GPT-4o para interpretação)
Auth/DB:      Supabase
Pagamentos:   Stripe
```

## Estrutura de Diretórios

```
/
├── src/                    # Código fonte React/TypeScript
│   ├── App.tsx             # Componente principal (toda lógica da calculadora)
│   ├── main.tsx            # Entry point React
│   ├── components/         # Componentes React
│   │   └── VoiceUpgradePopup.tsx
│   └── lib/
│       └── supabase.ts     # Cliente Supabase
├── api/
│   └── interpret.js        # API serverless (processa áudio)
├── android/                # Projeto Android nativo (Capacitor)
├── docs/
│   └── codebase-documentation.yaml  # Documentação detalhada
└── [configs]               # vite.config.ts, capacitor.config.ts, etc.
```

## Arquivos Principais

### `src/App.tsx` (628 linhas) - Core da Aplicação

**Tipos:**
- `VoiceState` (linha 8): `'idle' | 'recording' | 'processing'`
- `CalculationResult` (linha 10): Interface com resultados em múltiplos formatos

**Funções de Cálculo:**
- `parseToInches(str)` (linha 40): Converte `"5 1/2"` → `5.5`
- `formatInches(inches)` (linha 70): Converte `30.5` → `"2' 6 1/2"`
- `formatTotalInches(inches)` (linha 102): Formata apenas em polegadas
- `tokenize(expression)` (linha 124): Divide expressão em tokens
- `evaluateTokens(tokens)` (linha 157): Avalia tokens matematicamente
- `calculate(expression)` (linha 194): Engine principal de cálculo

**Hooks:**
- `useAudioRecorder(onComplete)` (linha 279): Grava áudio do microfone
- `useOnlineStatus()` (linha 316): Monitora conexão internet

**Componente App** (linha 334):
- `handleVoiceButtonClick`: Verifica permissão de voz
- `handleAudioUpload`: Envia áudio para API
- `handleKeypadInput`: Processa teclas numéricas
- `handleKeyClick`: Processa operadores e comandos
- `handleFractionClick`: Processa botões de fração

### `api/interpret.js` (139 linhas) - API de Voz

Endpoint serverless que:
1. Recebe áudio via `multipart/form-data`
2. Transcreve com OpenAI Whisper
3. Interpreta com GPT-4o (extrai expressão matemática)
4. Retorna JSON: `{ expression, transcription }`

### `src/lib/supabase.ts` - Autenticação

Exports:
- `supabase`: Cliente Supabase (ou null)
- `isSupabaseEnabled()`: Verifica se está configurado
- `getCurrentUser()`: Retorna usuário logado
- `getSession()`: Retorna sessão atual

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev              # Inicia dev server (localhost:5173)

# Build
npm run build            # Build para produção
npm run preview          # Preview do build

# Mobile (Capacitor)
npx cap sync android     # Sincroniza web → Android
npx cap open android     # Abre no Android Studio
npx cap run android      # Roda no dispositivo/emulador

# Deploy
git push                 # Vercel faz deploy automático
```

## Variáveis de Ambiente

```env
# Supabase (opcional - app funciona sem)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# OpenAI (obrigatório para voz)
OPENAI_API_KEY=sk-...

# Stripe (opcional - para upgrades)
VITE_STRIPE_CHECKOUT_URL=https://checkout.stripe.com/...
```

## Fluxo de Dados - Entrada por Voz

```
[Usuário fala]
    ↓
[MediaRecorder API grava WebM]
    ↓
[POST /api/interpret com FormData]
    ↓
[Whisper transcreve → "cinco pés e seis polegadas mais dois"]
    ↓
[GPT-4o interpreta → "5' 6\" + 2\""]
    ↓
[calculate() processa → { resultFeetInches: "5' 8\"", ... }]
    ↓
[UI exibe resultado]
```

## Padrões de Código

- **Sem CSS-in-JS**: Estilos em `App.css` e `index.css`
- **Componentes funcionais**: Hooks para estado e efeitos
- **API stateless**: Cada request é independente
- **Env vars Vite**: Prefixo `VITE_` para expor no cliente

## Pontos de Atenção

1. **Frações**: O sistema usa frações reais (1/8, 1/4, etc.), não decimais
2. **Bilíngue**: Suporta inglês e português na interpretação de voz
3. **Offline**: Cálculos funcionam offline, voz requer internet
4. **Mobile-first**: UI otimizada para toque, funciona em desktop

## Documentação Completa

Para detalhes de cada função, tipo e export, consulte:
`docs/codebase-documentation.yaml`
