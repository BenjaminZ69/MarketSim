import { Navigate, Outlet } from 'react-router-dom'
import { hasDemoSession } from '../services/demoSession'

export default function DemoSessionGuard() {
  return hasDemoSession() ? <Outlet /> : <Navigate to="/login" replace />
}
