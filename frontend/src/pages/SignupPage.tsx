import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import '../styles/SignupPage.css'

type FormValues = {
  fullName: string
  email: string
  password: string
  confirmPassword: string
  termsAccepted: boolean
}

type FormErrors = Partial<Record<keyof FormValues, string>>

const initialValues: FormValues = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  termsAccepted: false,
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {}

  if (!values.fullName.trim()) errors.fullName = 'Enter your full name.'
  if (!values.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!values.password) {
    errors.password = 'Create a password.'
  } else if (values.password.length < 8) {
    errors.password = 'Use at least 8 characters.'
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirm your password.'
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.'
  }
  if (!values.termsAccepted) errors.termsAccepted = 'You must agree to continue.'

  return errors
}

export default function SignupPage() {
  const [values, setValues] = useState<FormValues>(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function updateField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitted(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length === 0) {
      setSubmitted(true)
      // Discard the credentials immediately; this page does not authenticate or retain them.
      setValues((current) => ({ ...current, password: '', confirmPassword: '' }))
    }
  }

  return (
    <main className="signup-page">
      <header className="signup-header">
        <Link className="signup-brand" to="/" aria-label="MarketSim home">
          <span className="signup-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M5 23.5 12.5 16l5 4.5L27 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.5 10H27v6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>Market<span className="signup-brand-accent">Sim</span></span>
        </Link>
        <p className="signup-header-note">Already have an account? <Link to="/login">Log in</Link></p>
      </header>

      <div className="signup-main">
        <aside className="signup-story" aria-label="MarketSim introduction">
          <div className="signup-story-content">
            <span className="signup-eyebrow"><span /> MARKET INSIGHTS, MADE CLEAR</span>
            <h1>Make your next move <span>with confidence.</span></h1>
            <p>Build your edge with a smarter view of the markets. Your investing journey starts here.</p>
            <div className="signup-market-card" aria-label="Illustrative market performance">
              <div className="signup-market-card-top"><span>Market overview</span><span className="signup-live"><i /> LIVE</span></div>
              <div className="signup-market-value">$48,294.62 <span>+2.84%</span></div>
              <div className="signup-market-period">Portfolio value <span>Today</span></div>
              <svg className="signup-chart" viewBox="0 0 440 116" role="img" aria-label="Illustrative rising market chart">
                <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#35d49a" stopOpacity=".24" /><stop offset="1" stopColor="#35d49a" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 91C20 87 28 98 48 83s30 3 48-11 27 5 44-3 26-8 41-1 32-29 49-21 26-12 44-8 27-31 44-23 32 14 47-2 36 5 45-1 19-2 30-10v113H0Z" fill="url(#chart-fill)" />
                <path d="M0 91C20 87 28 98 48 83s30 3 48-11 27 5 44-3 26-8 41-1 32-29 49-21 26-12 44-8 27-31 44-23 32 14 47-2 36 5 45-1 19-2 30-10" fill="none" stroke="#35d49a" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <div className="signup-chart-labels"><span>9:30 AM</span><span>12 PM</span><span>3:30 PM</span></div>
            </div>
            <div className="signup-trust"><span className="signup-trust-icon" aria-hidden="true">✓</span><span>Clear insights. Smarter decisions.</span></div>
          </div>
          <div className="signup-story-footer">Market data shown for illustrative purposes.</div>
        </aside>

        <section className="signup-panel" aria-labelledby="signup-title">
          <div className="signup-form-wrap">
            <div className="signup-heading">
              <span className="signup-form-eyebrow">GET STARTED FOR FREE</span>
              <h2 id="signup-title">Create your account</h2>
              <p>Join MarketSim and start making informed moves.</p>
            </div>

            <form className="signup-form" onSubmit={handleSubmit} noValidate>
              <div className="signup-field">
                <label htmlFor="full-name">Full name</label>
                <input id="full-name" name="fullName" type="text" autoComplete="name" placeholder="e.g. Alex Morgan" value={values.fullName} onChange={(event) => updateField('fullName', event.target.value)} aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'full-name-error' : undefined} />
                {errors.fullName && <span className="signup-error" id="full-name-error">{errors.fullName}</span>}
              </div>

              <div className="signup-field">
                <label htmlFor="email">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={(event) => updateField('email', event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
                {errors.email && <span className="signup-error" id="email-error">{errors.email}</span>}
              </div>

              <div className="signup-field">
                <label htmlFor="password">Password</label>
                <div className="signup-password-wrap">
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" value={values.password} onChange={(event) => updateField('password', event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : 'password-hint'} />
                  <button className="signup-visibility" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                {errors.password ? <span className="signup-error" id="password-error">{errors.password}</span> : <span className="signup-hint" id="password-hint">Use 8 or more characters.</span>}
              </div>

              <div className="signup-field">
                <label htmlFor="confirm-password">Confirm password</label>
                <div className="signup-password-wrap">
                  <input id="confirm-password" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter your password" value={values.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined} />
                  <button className="signup-visibility" type="button" onClick={() => setShowConfirmPassword((shown) => !shown)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword}>{showConfirmPassword ? 'Hide' : 'Show'}</button>
                </div>
                {errors.confirmPassword && <span className="signup-error" id="confirm-password-error">{errors.confirmPassword}</span>}
              </div>

              <div className="signup-terms-row">
                <input id="terms" name="termsAccepted" type="checkbox" checked={values.termsAccepted} onChange={(event) => updateField('termsAccepted', event.target.checked)} aria-invalid={Boolean(errors.termsAccepted)} aria-describedby={errors.termsAccepted ? 'terms-error' : undefined} />
                <label htmlFor="terms">I agree to the <a href="#terms">Terms of Service</a> and <a href="#privacy">Privacy Policy</a>.</label>
              </div>
              {errors.termsAccepted && <span className="signup-error signup-terms-error" id="terms-error">{errors.termsAccepted}</span>}

              <button className="signup-submit" type="submit">Create account <span aria-hidden="true">→</span></button>
              {submitted && <p className="signup-success" role="status">Your details are ready. Backend authentication will be connected later.</p>}
            </form>

            <p className="signup-login-prompt">Already have an account? <Link to="/login">Log in</Link></p>
            <p className="signup-secure-note"><span aria-hidden="true">⌑</span> Your information is kept private and secure.</p>
          </div>
        </section>
      </div>
      <footer className="signup-footer">© 2025 MarketSim. All rights reserved.</footer>
    </main>
  )
}
