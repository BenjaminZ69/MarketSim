const DEMO_SESSION_KEY = 'marketsim-demo-session'

export function createDemoSession(): void {
  window.sessionStorage.setItem(DEMO_SESSION_KEY, 'active')
}

export function hasDemoSession(): boolean {
  return window.sessionStorage.getItem(DEMO_SESSION_KEY) === 'active'
}

export function clearDemoSession(): void {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY)
}
