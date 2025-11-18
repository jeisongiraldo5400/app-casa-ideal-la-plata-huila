/**
 * Auth Module - Exportaciones principales
 * 
 * Este módulo contiene toda la funcionalidad relacionada con autenticación:
 * - Store de Zustand para el estado de autenticación
 * - Hook personalizado useAuth
 * - Componentes de autenticación
 */

export { useAuthStore } from './infrastructure/store/authStore';
export { useAuth } from './infrastructure/hooks/useAuth';
export { LoginForm } from './components/LoginForm';

