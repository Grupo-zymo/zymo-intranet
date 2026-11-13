import unittest

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.cors import cors_allowed_origins


class CorsOrigenesTests(unittest.TestCase):
    def test_lista(self) -> None:
        self.assertEqual(
            cors_allowed_origins(" http://a.test , ,http://b.test,"),
            ["http://a.test", "http://b.test", "https://localhost"],
        )
        self.assertEqual(cors_allowed_origins(""), ["https://localhost"])
        self.assertNotIn("capacitor://localhost", cors_allowed_origins("https://zymointranet.com"))

    def test_preflight(self) -> None:
        app = FastAPI()
        app.add_middleware(
            CORSMiddleware, allow_origins=cors_allowed_origins("https://zymointranet.com"),
            allow_credentials=True, allow_methods=["GET"], allow_headers=["Authorization"],
            expose_headers=["Content-Disposition"],
        )

        @app.get("/x")
        def x():
            return {}

        c = TestClient(app)
        h = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization"}
        ok = c.options("/x", headers={"Origin": "https://localhost", **h})
        self.assertEqual(ok.headers.get("access-control-allow-origin"), "https://localhost")
        for o in ("https://evil.example", "null"):
            r = c.options("/x", headers={"Origin": o, **h})
            self.assertNotIn("access-control-allow-origin", r.headers)
        g = c.get("/x", headers={"Origin": "https://localhost"})
        self.assertEqual(g.headers.get("access-control-expose-headers"), "Content-Disposition")


if __name__ == "__main__":
    unittest.main()
