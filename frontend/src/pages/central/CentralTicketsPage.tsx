import { CentralChats } from "@/components/central/CentralChats"
import { CentralDashboard } from "@/components/central/CentralDashboard"
import { CentralStreamProvider } from "@/hooks/useCentralStream"
import { nivelTicketsCentral } from "@/lib/permissions"
import { useAuthStore } from "@/store/authStore"

/**
 * Central de tickets: /servicio-cliente/central (dashboard) y /servicio-cliente/central/chats (conversaciones).
 * El guard de App.tsx ya exige uno de los dos permisos.
 */
export function CentralTicketsPage({ vista }: { vista: "dashboard" | "chats" }) {
  const user = useAuthStore((s) => s.user)
  const nivel = user ? nivelTicketsCentral(user.role, user.app_permissions) : null
  if (!user || !nivel) return null
  const miCorreo = user.email.trim().toLowerCase()
  return (
    <CentralStreamProvider>
      {vista === "chats" ? <CentralChats nivel={nivel} miCorreo={miCorreo} /> : <CentralDashboard nivel={nivel} miCorreo={miCorreo} />}
    </CentralStreamProvider>
  )
}
