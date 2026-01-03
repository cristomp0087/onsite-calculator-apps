import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

type Step = 'email' | 'login' | 'signup';

const trades = [
  { value: 'other', label: 'Other / Not in construction' },
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'framer', label: 'Framer' },
  { value: 'drywaller', label: 'Drywaller' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'hvac', label: 'HVAC Technician' },
  { value: 'painter', label: 'Painter' },
  { value: 'roofer', label: 'Roofer' },
  { value: 'mason', label: 'Mason / Bricklayer' },
  { value: 'concrete', label: 'Concrete Finisher' },
  { value: 'ironworker', label: 'Ironworker' },
  { value: 'welder', label: 'Welder' },
  { value: 'glazier', label: 'Glazier' },
  { value: 'insulator', label: 'Insulator' },
  { value: 'flooring', label: 'Flooring Installer' },
  { value: 'tile', label: 'Tile Setter' },
  { value: 'siding', label: 'Siding Installer' },
  { value: 'landscaper', label: 'Landscaper' },
  { value: 'general_laborer', label: 'General Laborer' },
  { value: 'superintendent', label: 'Superintendent' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'estimator', label: 'Estimator' },
  { value: 'safety_officer', label: 'Safety Officer' },
];

const months = [
  { value: '1', label: 'January' }, { value: '2', label: 'February' },
  { value: '3', label: 'March' }, { value: '4', label: 'April' },
  { value: '5', label: 'May' }, { value: '6', label: 'June' },
  { value: '7', label: 'July' }, { value: '8', label: 'August' },
  { value: '9', label: 'September' }, { value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
];

const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 80 }, (_, i) => String(currentYear - 16 - i));

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState('');
  const [trade, setTrade] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const goBack = () => {
    setStep('email');
    setPassword('');
    setError(null);
    setSuccessMessage(null);
  };

  // Verificar se email existe na tabela profiles
  async function checkEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError('Authentication not available');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email');
      setLoading(false);
      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', cleanEmail);

      if (queryError) {
        console.error('Query error:', queryError);
        setStep('signup');
        return;
      }

      if (data && data.length > 0) {
        setStep('login');
      } else {
        setStep('signup');
      }
    } catch (err) {
      console.error('Check email error:', err);
      setStep('signup');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes('invalid')) {
          setError('Incorrect password. Try again or reset your password.');
        } else {
          setError(signInError.message);
        }
        return;
      }

      if (data.session) {
        onAuthSuccess();
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!supabase) return;
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/reset-password` }
      );

      if (resetError) throw resetError;

      setSuccessMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name');
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    if (!trade) {
      setError('Please select your trade');
      setLoading(false);
      return;
    }

    try {
      const birthday = birthYear && birthMonth && birthDay
        ? `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`
        : null;

      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            nome: fullName,
            trade: trade,
            birthday: birthday,
            gender: gender || null,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('This email is already registered. Please sign in instead.');
          setStep('login');
        } else if (signUpError.message.includes('rate limit') || signUpError.message.includes('429')) {
          setError('Too many attempts. Please wait a minute and try again.');
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (data.user) {
        // Aguarda um pouco para o trigger criar o profile
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Cria/atualiza o profile manualmente se necessário
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            email: cleanEmail,
            nome: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            trade: trade,
            birthday: birthday,
            gender: gender || null,
            subscription_status: 'trialing',
            trial_ends_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 meses
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        // Login automático após cadastro
        if (data.session) {
          onAuthSuccess();
        } else {
          setSuccessMessage('Account created! Please check your email to verify.');
        }
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🏗️</div>
        </div>
        <h1 className="auth-title">OnSite Calculator</h1>

        {/* Step: Email */}
        {step === 'email' && (
          <form onSubmit={checkEmail} className="auth-form">
            <p className="auth-subtitle">Enter your email to continue</p>
            
            {error && <div className="auth-error">{error}</div>}
            
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              placeholder="Email"
              autoFocus
              autoComplete="email"
            />

            <button type="submit" disabled={loading} className="auth-btn auth-btn-primary">
              {loading ? <span className="auth-spinner"></span> : <>Continue →</>}
            </button>
          </form>
        )}

        {/* Step: Login */}
        {step === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-email-info">
              <p className="auth-subtitle">Welcome back!</p>
              <p className="auth-email-display">{email}</p>
              <button type="button" onClick={goBack} className="auth-link">
                Use a different email
              </button>
            </div>

            {error && <div className="auth-error">{error}</div>}
            {successMessage && <div className="auth-success">{successMessage}</div>}

            <div className="auth-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="Password"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-password-toggle"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>

            <button type="submit" disabled={loading} className="auth-btn auth-btn-primary">
              {loading ? <span className="auth-spinner"></span> : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="auth-link auth-forgot"
            >
              Forgot password?
            </button>
          </form>
        )}

        {/* Step: Signup */}
        {step === 'signup' && (
          <form onSubmit={handleSignup} className="auth-form">
            <div className="auth-email-info">
              <p className="auth-subtitle-lg">Create your account</p>
              <p className="auth-subtitle">for {email}</p>
              <button type="button" onClick={goBack} className="auth-link">
                Use a different email
              </button>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <div className="auth-row">
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="auth-input"
                placeholder="First name"
                autoComplete="given-name"
              />
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="auth-input"
                placeholder="Last name"
                autoComplete="family-name"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Your trade *</label>
              <select
                required
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className="auth-select"
              >
                <option value="">Select your trade...</option>
                {trades.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="auth-field">
              <label className="auth-label">Birthday (optional)</label>
              <div className="auth-row-3">
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  className="auth-select"
                >
                  <option value="">Month</option>
                  {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  className="auth-select"
                >
                  <option value="">Day</option>
                  {days.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  className="auth-select"
                >
                  <option value="">Year</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label">Gender (optional)</label>
              <div className="auth-radio-group">
                {['Female', 'Male', 'Other'].map(g => (
                  <label key={g} className="auth-radio-label">
                    <input
                      type="radio"
                      name="gender"
                      value={g.toLowerCase()}
                      checked={gender === g.toLowerCase()}
                      onChange={(e) => setGender(e.target.value)}
                      className="auth-radio"
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="auth-password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="Create password (min 8 characters)"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="auth-password-toggle"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>

            <p className="auth-terms">
              By signing up, you agree to our{' '}
              <a href="https://onsiteclub.ca/terms" target="_blank" rel="noopener noreferrer">Terms</a> and{' '}
              <a href="https://onsiteclub.ca/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </p>

            <button type="submit" disabled={loading} className="auth-btn auth-btn-success">
              {loading ? <span className="auth-spinner"></span> : 'Create Account'}
            </button>

            <p className="auth-trial-info">
              6 months free trial - No credit card required
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
