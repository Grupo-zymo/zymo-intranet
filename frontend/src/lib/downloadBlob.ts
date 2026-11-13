import { guardarArchivo } from "@/lib/archivos"

export function downloadBlob(blob: Blob, filename: string): void {
  void guardarArchivo(blob, filename)
}
