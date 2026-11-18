"""Disparadores de push del flujo de órdenes de compra. Nunca lanzan."""
from __future__ import annotations

import logging
from typing import Optional

from sqlmodel import Session

from app.services import push_client
from app.services.push_client import push_habilitado, recortar

log = logging.getLogger(__name__)

_AVISOS_SOLICITANTE = {
    "oc_en_plataforma": ("Tu pedido llegó", "Confírmalo."),
    "en_correccion": ("Tu solicitud fue devuelta", "Revisa las observaciones."),
    "rechazada": ("Tu solicitud fue rechazada", "Consulta el motivo."),
}


def _val(x) -> str:
    return str(getattr(x, "value", x) or "")


def _email_usuario(usuario_id: Optional[int]) -> str:
    if not usuario_id:
        return ""
    try:
        from app.database import get_engine
        from app.models.user import User

        with Session(get_engine()) as db:
            u = db.get(User, usuario_id)
            return (u.email or "").strip().lower() if u else ""
    except Exception:
        return ""


def _texto(s) -> str:
    return f"{s.consecutivo_os or ''} · {recortar(s.descripcion, 90)} · {s.solicitante_nombre or ''}"


def avisar_cambio_estado(oc_db: Session, solicitud_id, estado_nuevo, usuario_id: Optional[int]) -> None:
    try:
        if not push_habilitado():
            return
        from app.models.oc import SolicitudOC

        s = oc_db.get(SolicitudOC, solicitud_id)
        if not s:
            return
        estado = _val(estado_nuevo)
        actor = _email_usuario(usuario_id)
        if estado == "pendiente_aprobacion":
            correos = push_client.correos_con_permiso("mod_oc_aprobar", incluir_admin=False) \
                or push_client.correos_con_permiso("__sin_permiso__", incluir_admin=True)
            push_client.notificar(
                [c for c in correos if c != actor], "Solicitud por aprobar", _texto(s),
                f"/oc/solicitudes/{s.id}", f"oc-aprobar-{s.id}",
            )
        elif estado in _AVISOS_SOLICITANTE and s.solicitante_email:
            correo = s.solicitante_email.strip().lower()
            if correo != actor:
                titulo, resto = _AVISOS_SOLICITANTE[estado]
                push_client.notificar(
                    [correo], titulo, f"{s.consecutivo_os or ''} · {resto}",
                    f"/operativo/mis-solicitudes/{s.id}", f"oc-mia-{s.id}",
                )
    except Exception:
        log.warning("push OC: fallo al avisar cambio de estado", exc_info=True)


def avisar_solicitud_nueva(solicitud) -> None:
    try:
        if not push_habilitado():
            return
        propio = (solicitud.solicitante_email or "").strip().lower()
        correos = [c for c in push_client.correos_con_permiso("mod_oc_ver", incluir_admin=False) if c != propio]
        push_client.notificar(
            correos, "Solicitud nueva por asignar", _texto(solicitud),
            f"/oc/solicitudes/{solicitud.id}", f"oc-nueva-{solicitud.id}",
        )
    except Exception:
        log.warning("push OC: fallo al avisar solicitud nueva", exc_info=True)
