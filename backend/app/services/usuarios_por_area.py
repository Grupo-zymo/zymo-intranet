"""Usuarios activos de un grupo de áreas, con su cargo del directorio.

Lo consume la Central de tickets (zymoally-backend) para saber a quién se le
puede asignar un caso. El ÁREA de una persona es el texto `User.area` de la
cuenta; la ficha del directorio solo aporta el cargo, nunca el área.
"""
from __future__ import annotations

import re
import unicodedata

from sqlmodel import Session, select

from app.models.user import User
from app.personal_database import PtcCargo, PtcPersona

# Cargos que mandan sobre un equipo. Se compara sin tildes ni mayúsculas.
_CARGO_LIDER = re.compile(r"\b(coordinador|supervisor|director|lider|jefe)", re.IGNORECASE)


def normalizar(texto: str | None) -> str:
    """Sin tildes, en minúsculas y con espacios simples: «  Operaciónes  IMCC » → «operaciones imcc»."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFD", texto or "") if unicodedata.category(c) != "Mn"
    )
    return " ".join(sin_tildes.lower().split())


def area_empieza_por(area: str | None, prefijo: str) -> bool:
    """«Operaciones IMCC» empieza por «operaciones»; «Cooperaciones» no."""
    a, p = normalizar(area), normalizar(prefijo)
    return bool(p) and (a == p or a.startswith(p + " "))


def es_cargo_lider(cargo: str | None) -> bool:
    """Coordinador(a), supervisor(a), director(a), líder o jefe."""
    return bool(_CARGO_LIDER.search(normalizar(cargo)))


def _cargo_de(fichas: list[PtcPersona], cargos: dict[int, str]) -> str | None:
    """Con varias fichas vinculadas a la misma cuenta el vínculo es ambiguo: no se adivina el cargo."""
    if len(fichas) != 1 or not fichas[0].cargo_id:
        return None
    return cargos.get(fichas[0].cargo_id) or None


def listar_usuarios_por_area(main_db: Session, personal_db: Session, prefijo: str) -> list[dict]:
    """Cuentas activas cuya área empieza por `prefijo`. Líderes primero y por nombre."""
    usuarios = [
        u
        for u in main_db.exec(select(User).where(User.is_active == True)).all()  # noqa: E712
        if area_empieza_por(u.area, prefijo)
    ]
    ids = [u.id for u in usuarios]
    cargos: dict[int, str] = {}
    fichas: dict[int, list[PtcPersona]] = {}
    if ids:
        cargos = {c.id: c.nombre for c in personal_db.exec(select(PtcCargo)).all()}
        for p in personal_db.exec(select(PtcPersona).where(PtcPersona.user_id.in_(ids))).all():
            fichas.setdefault(p.user_id, []).append(p)

    filas = []
    for u in usuarios:
        cargo = _cargo_de(fichas.get(u.id, []), cargos)
        filas.append({
            "id": int(u.id),
            "nombre": (u.full_name or "").strip() or u.email,
            "email": u.email.strip().lower(),
            "area": u.area,
            "cargo": cargo,
            "esLider": es_cargo_lider(cargo),
        })
    filas.sort(key=lambda f: (not f["esLider"], normalizar(f["nombre"])))
    return filas
