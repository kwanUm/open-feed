import { signOut } from 'firebase/auth/web-extension'
import { useCallback } from 'react'
import { AuthModalStore, AuthStore } from 'src/features/auth'
import { trackUserDisconnect } from 'src/lib/analytics'
import { firebaseAuth } from 'src/lib/firebase'

export const useAuth = () => {
  const authModalStore = AuthModalStore()
  const authStore = AuthStore()

  const isConnected = authStore.user != null

  const shouldIcrementStreak = useCallback(() => {
    if (!isConnected) return false

    const last = authStore.lastStreakUpdate
    if (!last) return true

    const today = new Date().toISOString()
    const lastDay = new Date(last).toISOString()

    return today !== lastDay
  }, [isConnected, authStore.lastStreakUpdate])

  const logout = useCallback(async () => {
    trackUserDisconnect()
    if (firebaseAuth) {
      signOut(firebaseAuth)
      await firebaseAuth.signOut()
    }
    authStore.clear()
  }, [authStore])

  return {
    ...authModalStore,
    ...authStore,
    isConnected,
    shouldIcrementStreak,
    logout,
  }
}
