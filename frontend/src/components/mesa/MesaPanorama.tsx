import { useSearchParams } from "react-router-dom"
import { useMesaPanorama } from "@/hooks/useMesa"
import { mensajeDeError } from "@/lib/mesa"
import { MesaLista } from "./MesaLista"

/**
 * Vista de administración: cuántos tickets tiene cada área ahora mismo y, debajo,
 * la lista completa. No son métricas (eso es del tablero de cada líder): es el
 * panorama entre áreas. El área elegida vive en la URL (?area=).
 */
export function MesaPanorama({ onAbrir }: { onAbrir: (id: number) => void }) {
  const [params, setParams] = useSearchParams()
  const panorama = useMesaPanorama()
  const areaId = Number(params.get("area")) || undefined
  const elegir = (id?: number) => {
    const sig = new URLSearchParams(params)
    if (id) sig.set("area", String(id)); else sig.delete("area")
    setParams(sig, { replace: true })
  }
  const areas = panorama.data?.areas ?? []
  const elegida = areas.find((a) => a.areaId === areaId)
  const total = (k: "abierto" | "en_espera" | "sinRespuesta" | "sinAsignar" | "cerrado") => areas.reduce((n, a) => n + a[k], 0)

  return (
    <>
      {panorama.isError ? (
        <p className="mesa-error" role="alert">{mensajeDeError(panorama.error)}</p>
      ) : (
        <div className="mesa-scroll">
          <table className="mesa-tabla mesa-tabla-fija" aria-busy={panorama.isPending}>
            <caption className="sr-only">Tickets por área y estado. Elige un área para ver solo sus tickets.</caption>
            <thead>
              <tr>
                <th scope="col">Área</th>
                <th scope="col" className="mesa-der">Abiertos</th>
                <th scope="col" className="mesa-der">En espera</th>
                <th scope="col" className="mesa-der">Sin respuesta</th>
                <th scope="col" className="mesa-der">Sin asignar</th>
                <th scope="col" className="mesa-der">Cerrados</th>
              </tr>
            </thead>
            <tbody>
              <tr data-elegida={!areaId || undefined}>
                <th scope="row"><button type="button" className="mesa-area-btn" aria-pressed={!areaId} onClick={() => elegir()}>Todas las áreas</button></th>
                <td className="mesa-der mesa-num">{total("abierto")}</td>
                <td className="mesa-der mesa-num">{total("en_espera")}</td>
                <td className="mesa-der mesa-num">{total("sinRespuesta")}</td>
                <td className="mesa-der mesa-num">{total("sinAsignar")}</td>
                <td className="mesa-der mesa-num">{total("cerrado")}</td>
              </tr>
              {areas.map((a) => (
                <tr key={a.areaId} data-elegida={a.areaId === areaId || undefined}>
                  <th scope="row">
                    <button type="button" className="mesa-area-btn" aria-pressed={a.areaId === areaId} onClick={() => elegir(a.areaId)}>
                      {a.nombre}
                    </button>
                    {!a.recibeTickets && <span className="mesa-sub"> (no recibe solicitudes)</span>}
                  </th>
                  <td className="mesa-der mesa-num" data-cero={a.abierto === 0 || undefined}>{a.abierto}</td>
                  <td className="mesa-der mesa-num" data-cero={a.en_espera === 0 || undefined}>{a.en_espera}</td>
                  <td className="mesa-der mesa-num" data-cero={a.sinRespuesta === 0 || undefined}>{a.sinRespuesta}</td>
                  <td className="mesa-der mesa-num" data-cero={a.sinAsignar === 0 || undefined}>{a.sinAsignar}</td>
                  <td className="mesa-der mesa-num" data-cero={a.cerrado === 0 || undefined}>{a.cerrado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mesa-subtitulo">{elegida ? `Tickets de ${elegida.nombre}` : "Tickets de todas las áreas"}</h2>
      <MesaLista key={areaId ?? "todas"} vista="todas" areaId={areaId} onAbrir={onAbrir} />
    </>
  )
}
