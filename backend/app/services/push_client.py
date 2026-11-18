"""Cliente de notificaciones push (FCM) hacia zymoally-backend.

`notificar` nunca lanza y nunca bloquea: dispara un hilo con un POST de 5 s.
Si falta la URL o la clave interna, no hace nada.
"""
from __future__ import annotations

import json
import logging
import threading
import urllib.request
from typing import Optional

from sqlmodel import Session, select

from app.config import settings

log = logging.getLogger(__name__)

_MAX_DESTINATARIOS = 300


def push_habilitado() -> bool:
    return bool(settings.zymoally_internal_url and settings.internal_key)


def consultar_destinatarios(
    db: Session, permiso: str, incluir_admin: bool = True, limite: int = _MAX_DESTINATARIOS
) -> list[dict]:
    """Cuentas activas que tienen `permiso`: por su rol O asignado directamente a la persona (tabla usuario_permiso,
    que es donde se dan casi todos los permisos reales), más los admins si incluir_admin. Sin duplicados."""
    from app.models.area_acceso import UsuarioPermiso
    from app.models.role import Role
    from app.models.user import User
    from app.services.acceso_area import permisos_asignados

    roles = {"admin"} if incluir_admin else set()
    for r in db.exec(select(Role)).all():
        if permiso in (r.app_permissions or []):
            roles.add(r.name)
    candidatos: dict[int, User] = {}
    if roles:
        for u in db.exec(select(User).where(User.is_active == True, User.role.in_(roles))).all():  # noqa: E712
            candidatos[u.id] = u
    # Permiso dado a la persona: se confirma con permisos_asignados (respeta los permisos exclusivos de otras áreas)
    ids = [f.user_id for f in db.exec(select(UsuarioPermiso).where(UsuarioPermiso.permiso == permiso)).all()]
    if ids:
        for u in db.exec(select(User).where(User.is_active == True, User.id.in_(ids))).all():  # noqa: E712
            if u.id not in candidatos and permiso in permisos_asignados(db, u):
                candidatos[u.id] = u
    vistos: set[str] = set()
    out: list[dict] = []
    for u in sorted(candidatos.values(), key=lambda x: x.id):
        correo = (u.email or "").strip().lower()
        if not correo or correo in vistos:
            continue
        vistos.add(correo)
        out.append({"id": u.id, "email": correo, "nombre": u.full_name or correo})
        if len(out) >= limite:
            break
    return out


def correos_con_permiso(permiso: str, incluir_admin: bool = True) -> list[str]:
    """Correos de los destinatarios de un permiso (para los disparadores). Nunca lanza."""
    try:
        from app.database import get_engine

        with Session(get_engine()) as db:
            return [d["email"] for d in consultar_destinatarios(db, permiso, incluir_admin)]
    except Exception:
        log.warning("push: no se pudo consultar destinatarios de %s", permiso, exc_info=True)
        return []


def _enviar(payload: dict) -> None:
    try:
        req = urllib.request.Request(
            f"{settings.zymoally_internal_url.rstrip('/')}/api/push/interno",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Internal-Key": settings.internal_key},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5):  # noqa: S310 - URL interna de configuración
            pass
    except Exception:
        log.warning("push: no se pudo enviar la notificación", exc_info=True)


def notificar(correos: list[str], titulo: str, texto: str, url: str, etiqueta: str) -> None:
    try:
        if not push_habilitado() or not url or not url.startswith("/"):
            return
        destinos = list(dict.fromkeys(c.strip().lower() for c in (correos or []) if c and c.strip()))
        if not destinos:
            return
        payload = {
            "correos": destinos,
            "titulo": (titulo or "")[:80],
            "texto": (texto or "")[:180],
            "url": url,
            "etiqueta": etiqueta,
        }
        threading.Thread(target=_enviar, args=(payload,), daemon=True).start()
    except Exception:
        log.warning("push: fallo al preparar la notificación", exc_info=True)


def recortar(valor: Optional[str], n: int) -> str:
    return (valor or "").strip()[:n]
