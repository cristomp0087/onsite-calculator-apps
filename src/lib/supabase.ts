import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Auth features disabled.')
}

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Helper para verificar se Supabase está disponível
export const isSupabaseEnabled = () => !!supabase

// Helper para pegar sessão atual
export const getCurrentUser = async () => {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Helper para pegar sessão
export const getSession = async () => {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
