import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import '../styles/LoginPage.css'

type LoginValues = {
  email: string
  password: string
}

type LoginErrors = Partial<Record<keyof LoginValues, string>>

function validate(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {}

  if (!values.email.trim()) {
    errors.email = 'Enter your email address.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!values.password) errors.password = 'Enter your password.'

  return errors
}

export default function LoginPage() {
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' })
  const [errors, setErrors] = useState<LoginErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(false)
    const nextErrors = validate(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length === 0) {
      setSubmitted(true)
    }
  }

  function updateField(field: keyof LoginValues, value: string) {
    const nextValues = { ...values, [field]: value }
    setValues(nextValues)
    if (errors[field]) setErrors(validate(nextValues))
    setSubmitted(false)
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-brand">
          <Link className="brand-mark" to="/" aria-label="MarketSim home">
            <span className="brand-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M5 23.5 12.2 16l5 4.6L27 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.5 9H27v6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>Market<span className="brand-accent">Sim</span></span>
          </Link>
          <span className="secure-label"><span aria-hidden="true">●</span> YOUR MARKET, SIMPLIFIED</span>
        </header>

        <div className="login-heading">
          <div className="eyebrow">WELCOME BACK</div>
          <h1 id="login-title">Log in to your account</h1>
          <p>Pick up where your investing journey left off.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={(event) => updateField('email', event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && <p className="field-error" id="email-error" role="alert">{errors.email}</p>}
          </div>

          <div className="form-field">
            <div className="field-label-row">
              <label htmlFor="password">Password</label>
              <a className="text-link" href="#forgot-password" onClick={(event) => event.preventDefault()}>Forgot password?</a>
            </div>
            <div className="password-control">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={values.password}
                onChange={(event) => updateField('password', event.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              <button
                className="visibility-button"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && <p className="field-error" id="password-error" role="alert">{errors.password}</p>}
          </div>

          <label className="remember-option">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span className="custom-checkbox" aria-hidden="true" />
            <span>Remember me</span>
          </label>

          <button className="login-submit" type="submit">Log In <span aria-hidden="true">→</span></button>
          {submitted && <p className="login-notice" role="status">Your details are valid. Backend authentication will be connected later.</p>}
        </form>

        <footer className="login-footer">
          <span>New to MarketSim?</span> <Link to="/signup">Create an account</Link>
        </footer>
      </section>

      <div className="login-caption"><span className="caption-dot" /> A smarter way to explore the markets.</div>
    </main>
  )
}
