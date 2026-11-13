"""Orígenes CORS: los configurados por env + el del WebView Android de la app empaquetada."""

ORIGEN_APP_MOVIL = "https://localhost"  # Capacitor androidScheme=https


def cors_allowed_origins(configurado: str | None) -> list[str]:
    extra = [o.strip() for o in (configurado or "").split(",") if o.strip()]
    return list(dict.fromkeys([*extra, ORIGEN_APP_MOVIL]))
