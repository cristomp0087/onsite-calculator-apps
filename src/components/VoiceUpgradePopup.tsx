import React from 'react';

interface VoiceUpgradePopupProps {
  onClose: () => void;
  userEmail?: string;
}

export default function VoiceUpgradePopup({ onClose, userEmail }: VoiceUpgradePopupProps) {
  const stripeCheckoutUrl = import.meta.env.VITE_STRIPE_CHECKOUT_URL || 
    'https://app.onsiteclub.ca/checkout/voice';

  const handleStartTrial = () => {
    // Redireciona para o Stripe checkout com email pré-preenchido
    const url = userEmail 
      ? `${stripeCheckoutUrl}?prefilled_email=${encodeURIComponent(userEmail)}`
      : stripeCheckoutUrl;
    window.open(url, '_blank');
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={e => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>×</button>
        
        <div className="popup-icon">🎙️</div>
        
        <h2 className="popup-title">Voice Calculator</h2>
        
        <p className="popup-description">
          Speak your measurements and let AI do the math!
        </p>
        
        <div className="popup-features">
          <div className="popup-feature">✓ Voice recognition in English & Portuguese</div>
          <div className="popup-feature">✓ Understands fractions and feet/inches</div>
          <div className="popup-feature">✓ Hands-free on the job site</div>
        </div>
        
        <div className="popup-pricing">
          <div className="popup-trial">
            <span className="popup-trial-badge">6 MONTHS FREE</span>
            <p className="popup-trial-text">Try it free, cancel anytime</p>
          </div>
          <p className="popup-price">Then $9.99/month</p>
        </div>
        
        <button className="popup-btn popup-btn-primary" onClick={handleStartTrial}>
          Start Free Trial
        </button>
        
        <button className="popup-btn popup-btn-secondary" onClick={onClose}>
          Maybe Later
        </button>
        
        <p className="popup-note">
          Credit card required. You won't be charged during trial.
        </p>
      </div>
    </div>
  );
}
