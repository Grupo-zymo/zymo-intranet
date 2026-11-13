import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.routers.app_version import router


def cliente() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


class AppVersionTests(unittest.TestCase):
    def test_defaults_sin_token(self) -> None:
        with patch.multiple(
            settings, app_android_min_version_code=1, app_android_latest_version_code=2,
            app_android_latest_version_name="1.1.0", app_android_apk_url="", app_android_mensaje="",
        ):
            r = cliente().get("/api/app/version")  # sin Authorization
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("cache-control"), "no-store")
        self.assertEqual(r.json(), {"android": {
            "minVersionCode": 1, "latestVersionCode": 2, "latestVersionName": "1.1.0", "apkUrl": "", "mensaje": "",
        }})

    def test_valores_configurados(self) -> None:
        with patch.multiple(
            settings, app_android_min_version_code=2, app_android_latest_version_code=3,
            app_android_latest_version_name="1.2.0", app_android_apk_url="https://x.test/a.apk", app_android_mensaje="Actualiza",
        ):
            a = cliente().get("/api/app/version").json()["android"]
        self.assertEqual((a["minVersionCode"], a["latestVersionCode"], a["apkUrl"], a["mensaje"]), (2, 3, "https://x.test/a.apk", "Actualiza"))

    def test_normaliza_min_mayor_que_latest(self) -> None:
        with patch.multiple(settings, app_android_min_version_code=9, app_android_latest_version_code=4):
            a = cliente().get("/api/app/version").json()["android"]
        self.assertEqual((a["minVersionCode"], a["latestVersionCode"]), (4, 4))


if __name__ == "__main__":
    unittest.main()
