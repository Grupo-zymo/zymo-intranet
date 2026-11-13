import { zymoallyApi } from "@/lib/zymoallyApi"
import { guardarArchivo, nombreDesdeDisposition } from "@/lib/archivos"

// Los endpoints de exportar requieren el JWT de sesión (interceptor de
// zymoallyApi) — un <a href> plano no manda ese header, por eso se pide como
// blob y se dispara la descarga a mano. El nombre de archivo lo pone el
// backend vía Content-Disposition; se reusa acá en vez de inventar uno nuevo.
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const response = await zymoallyApi.get<Blob>(url, { responseType: "blob" })
  const filename = nombreDesdeDisposition(response.headers["content-disposition"] as string | undefined, fallbackName)
  await guardarArchivo(response.data, filename)
}
