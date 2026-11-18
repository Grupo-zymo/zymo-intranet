"""Destinatarios de notificaciones push. Servicio-a-servicio (X-Internal-Key)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
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
