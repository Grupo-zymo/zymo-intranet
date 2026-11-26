"""Destinatarios de notificaciones push. Servicio-a-servicio (X-Internal-Key)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query
from sqlmodel import Session

from app.config import settings
from app.database import get_db
from app.services.push_client import consultar_destinatarios

router = APIRouter(prefix="/api", tags=["Push"])


def _requiere_clave_interna(x_internal_key: Optional[str] = Header(default=None)) -> None:
    if not (x_internal_key and settings.internal_key and x_internal_key == settings.internal_key):
        raise HTTPException(status_code=403, detail="Requiere X-Internal-Key válida.")


@router.get("/push-destinatarios", dependencies=[Depends(_requiere_clave_interna)])
def push_destinatarios(
    permiso: str = Query(..., min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$"),
    db: Session = Depends(get_db),
):
    return consultar_destinatarios(db, permiso)


@router.get("/push-destinatarios/area/{area_id}", dependencies=[Depends(_requiere_clave_interna)])
def push_destinatarios_de_area(
    area_id: int = Path(..., ge=1),
    permiso: str = Query(..., min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$"),
    db: Session = Depends(get_db),
):
    """Quién tiene `permiso` EN esa área (la de su cuenta o una adicional). Sin los admins: ser admin no hace a nadie
    del área. Lo usa el SIG para avisar solo a los líderes del área de un procedimiento. Ruta propia a propósito:
    un backend que aún no la tenga responde 404 y no se avisa a nadie, en vez de ignorar el filtro y avisar a todos."""
    return consultar_destinatarios(db, permiso, incluir_admin=False, area_id=area_id)
