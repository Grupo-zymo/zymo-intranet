import { CentralPanel } from "@/components/central/CentralPanel"
import { nivelTicketsCentral } from "@/lib/permissions"
import { useAuthStore } from "@/store/authStore"

/** Central de tickets (/servicio-cliente/central). El guard de App.tsx ya exige uno de los dos permisos. */
export function CentralTicketsPage() {
  const user = useAuthStore((s) => s.user)
  const nivel = user ? nivelTicketsCentral(user.role, user.app_permissions) : null
  if (!user || !nivel) return null
  return <CentralPanel nivel={nivel} miCorreo={user.email.trim().toLowerCase()} />
}
