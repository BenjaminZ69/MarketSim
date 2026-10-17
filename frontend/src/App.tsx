import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DemoSessionGuard from './components/DemoSessionGuard'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import PortfolioPage from './pages/PortfolioPage'
import SignupPage from './pages/SignupPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DemoSessionGuard />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
