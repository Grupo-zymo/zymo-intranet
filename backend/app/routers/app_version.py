"""Versión mínima/última del APK Android. Público (sin token): la app lo consulta incluso antes de iniciar sesión."""
from fastapi import APIRouter, Response

from app.config import settings

router = APIRouter(prefix="/api/app", tags=["app"])


def datos_android() -> dict:
    ultimo = max(1, settings.app_android_latest_version_code)
    minimo = max(1, min(settings.app_android_min_version_code, ultimo))
    return {
        "minVersionCode": minimo,
        "latestVersionCode": ultimo,
        "latestVersionName": settings.app_android_latest_version_name,
        "apkUrl": settings.app_android_apk_url,
        "mensaje": settings.app_android_mensaje,
    }


@router.get("/version")
def version(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"android": datos_android()}
