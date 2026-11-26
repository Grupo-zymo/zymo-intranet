import contextlib
import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings
from app.database import get_db
from app.models.area import Area
from app.models.area_acceso import HerramientaAcceso, UsuarioPermiso
from app.models.role import Role
from app.models.user import User
from app.routers.push_destinatarios import router
from app.services import oc_push, push_client


def _engine():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(e, tables=[Role.__table__, User.__table__, UsuarioPermiso.__table__, HerramientaAcceso.__table__, Area.__table__])
    with Session(e) as s:
        s.add(Role(name="aprobador", label="A", app_permissions=["mod_oc_aprobar"]))
        s.add(Role(name="otro", label="O", app_permissions=["mod_x"]))
        filas = [
            ("Ana@z.com", "aprobador", True), ("bob@z.com", "otro", True),
            ("root@z.com", "admin", True), ("off@z.com", "aprobador", False),
            ("ANA@z.com ", "admin", True),
            ("dada@z.com", "empleado", True),   # id 6: permiso dado DIRECTAMENTE a la persona (así se dan casi todos en producción)
            ("dada-off@z.com", "empleado", False),  # id 7: con el permiso pero desactivada
            ("sinpermiso@z.com", "empleado", True),  # id 8: empleado sin permiso
        ]
        for i, (mail, role, act) in enumerate(filas, 1):
            s.add(User(id=i, email=mail, full_name=f"U{i}", hashed_password="x", role=role, is_active=act))
        s.add(UsuarioPermiso(user_id=6, permiso="mod_oc_aprobar"))
        s.add(UsuarioPermiso(user_id=7, permiso="mod_oc_aprobar"))
        s.commit()
    return e


class DestinatariosTests(unittest.TestCase):
    def setUp(self):
        self.e = _engine()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: Session(self.e)
        self.c = TestClient(app)
        self.p = patch.object(settings, "internal_key", "k")
        self.p.start()

    def tearDown(self):
        self.p.stop()

    def test_403_sin_clave(self):
        url = "/api/push-destinatarios?permiso=mod_oc_aprobar"
        self.assertEqual(self.c.get(url).status_code, 403)
        self.assertEqual(self.c.get(url, headers={"X-Internal-Key": "mala"}).status_code, 403)

    def test_422_permiso_invalido(self):
        h = {"X-Internal-Key": "k"}
        for q in ("", "?permiso=", "?permiso=Mod-X", "?permiso=a%20b"):
            self.assertEqual(self.c.get("/api/push-destinatarios" + q, headers=h).status_code, 422, q)

    def test_incluye_admins_sin_duplicados_y_activos(self):
        r = self.c.get("/api/push-destinatarios?permiso=mod_oc_aprobar", headers={"X-Internal-Key": "k"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(sorted(d["email"] for d in r.json()), ["ana@z.com", "dada@z.com", "root@z.com"])
        self.assertEqual(set(r.json()[0]), {"id", "email", "nombre"})


def _engine_areas():
    """Líderes del SIG repartidos en dos áreas: el área de una persona es el texto de su cuenta o una adicional (areas_extra)."""
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(e, tables=[Role.__table__, User.__table__, UsuarioPermiso.__table__, HerramientaAcceso.__table__, Area.__table__])
    with Session(e) as s:
        s.add(Area(id=1, name="Gestión Humana"))
        s.add(Area(id=2, name="Compras"))
        s.add(Role(name="lider_sig", label="L", app_permissions=["mod_sig_lider"]))
        filas = [
            # id, correo, rol, activa, área de la cuenta, áreas adicionales, permiso dado a la persona
            (1, "gh@z.com", "empleado", True, " gestion  HUMANA ", None, True),   # sin tilde y con espacios de más: misma área
            (2, "compras@z.com", "empleado", True, "Compras", None, True),        # líder de OTRA área
            (3, "extra@z.com", "empleado", True, "Compras", [1], True),           # Gestión Humana como área adicional
            (4, "rol@z.com", "lider_sig", True, "Gestión Humana", None, False),   # el permiso le llega por su rol
            (5, "sinpermiso@z.com", "empleado", True, "Gestión Humana", None, False),
            (6, "off@z.com", "empleado", False, "Gestión Humana", None, True),    # desactivada
            (7, "root@z.com", "admin", True, "Gestión Humana", None, False),      # admin del área: no es su líder
            (8, "sinarea@z.com", "empleado", True, None, None, True),
        ]
        for uid, mail, role, act, area, extra, dado in filas:
            s.add(User(id=uid, email=mail, full_name=f"U{uid}", hashed_password="x", role=role, is_active=act, area=area, areas_extra=extra))
            if dado:
                s.add(UsuarioPermiso(user_id=uid, permiso="mod_sig_lider"))
        s.commit()
    return e


class DestinatariosDeAreaTests(unittest.TestCase):
    """GET /api/push-destinatarios/area/{id}: lo usa el SIG para avisar SOLO a los líderes del área del procedimiento."""

    def setUp(self):
        self.e = _engine_areas()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: Session(self.e)
        self.c = TestClient(app)
        self.p = patch.object(settings, "internal_key", "k")
        self.p.start()

    def tearDown(self):
        self.p.stop()

    def _correos(self, area_id, permiso="mod_sig_lider"):
        r = self.c.get(f"/api/push-destinatarios/area/{area_id}?permiso={permiso}", headers={"X-Internal-Key": "k"})
        self.assertEqual(r.status_code, 200)
        return sorted(d["email"] for d in r.json())

    def test_403_sin_clave(self):
        url = "/api/push-destinatarios/area/1?permiso=mod_sig_lider"
        self.assertEqual(self.c.get(url).status_code, 403)
        self.assertEqual(self.c.get(url, headers={"X-Internal-Key": "mala"}).status_code, 403)

    def test_422_datos_invalidos(self):
        h = {"X-Internal-Key": "k"}
        for ruta in ("/area/1", "/area/1?permiso=Mod-X", "/area/0?permiso=mod_sig_lider", "/area/abc?permiso=mod_sig_lider"):
            self.assertEqual(self.c.get("/api/push-destinatarios" + ruta, headers=h).status_code, 422, ruta)

    def test_solo_los_del_area_principal_o_adicional(self):
        self.assertEqual(self._correos(1), ["extra@z.com", "gh@z.com", "rol@z.com"])
        self.assertEqual(self._correos(2), ["compras@z.com", "extra@z.com"])

    def test_sin_admins_ni_inactivos_ni_sin_permiso(self):
        correos = self._correos(1)
        for fuera in ("root@z.com", "off@z.com", "sinpermiso@z.com", "sinarea@z.com", "compras@z.com"):
            self.assertNotIn(fuera, correos)

    def test_area_inexistente_o_permiso_que_nadie_tiene(self):
        self.assertEqual(self._correos(99), [])
        self.assertEqual(self._correos(1, "mod_otro"), [])

    def test_misma_forma_que_el_listado_general(self):
        r = self.c.get("/api/push-destinatarios/area/1?permiso=mod_sig_lider", headers={"X-Internal-Key": "k"})
        self.assertEqual(set(r.json()[0]), {"id", "email", "nombre"})


class _FakeThread:
    def __init__(self, target, args, daemon):
        self.t, self.a = target, args

    def start(self):
        self.t(*self.a)


class ClienteTests(unittest.TestCase):
    def setUp(self):
        self.ps = [patch.object(settings, "internal_key", "k"),
                   patch.object(settings, "zymoally_internal_url", "http://x:1")]
        for p in self.ps:
            p.start()

    def tearDown(self):
        for p in self.ps:
            p.stop()

    def _correr(self, **kw):
        enviados = []

        def fake_urlopen(req, timeout):
            enviados.append((req, timeout))
            return contextlib.nullcontext()

        with patch.object(push_client.threading, "Thread", _FakeThread), \
                patch.object(push_client.urllib.request, "urlopen", side_effect=fake_urlopen):
            push_client.notificar(**kw)
        return enviados

    def test_recorta_y_dedupe(self):
        env = self._correr(correos=["A@z.com", "a@z.com"], titulo="t" * 200, texto="x" * 500, url="/ok", etiqueta="e")
        self.assertEqual(len(env), 1)
        req, timeout = env[0]
        body = json.loads(req.data)
        self.assertEqual((len(body["titulo"]), len(body["texto"]), body["correos"]), (80, 180, ["a@z.com"]))
        self.assertEqual(timeout, 5)
        self.assertEqual(req.get_header("X-internal-key"), "k")
        self.assertEqual(req.full_url, "http://x:1/api/push/interno")

    def test_url_invalida_descarta(self):
        self.assertEqual(self._correr(correos=["a@z.com"], titulo="t", texto="x", url="http://evil", etiqueta="e"), [])

    def test_sin_config_no_hace_nada(self):
        with patch.object(settings, "internal_key", ""):
            self.assertEqual(self._correr(correos=["a@z.com"], titulo="t", texto="x", url="/ok", etiqueta="e"), [])

    def test_nunca_lanza(self):
        with patch.object(push_client.urllib.request, "urlopen", side_effect=OSError("boom")):
            push_client._enviar({"a": 1})


class DisparadoresTests(unittest.TestCase):
    def setUp(self):
        self.ps = [patch.object(settings, "internal_key", "k"),
                   patch.object(settings, "zymoally_internal_url", "http://x:1")]
        for p in self.ps:
            p.start()
        self.sid = uuid.uuid4()
        self.sol = SimpleNamespace(
            id=self.sid, consecutivo_os="OS-2026-0001", descripcion="d" * 200,
            solicitante_nombre="Sol", solicitante_email="Sol@z.com",
        )
        self.db = SimpleNamespace(get=lambda m, i: self.sol)

    def tearDown(self):
        for p in self.ps:
            p.stop()

    def test_pendiente_aprobacion(self):
        with patch.object(push_client, "correos_con_permiso", return_value=["a@z.com", "act@z.com"]), \
                patch.object(oc_push, "_email_usuario", return_value="act@z.com"), \
                patch.object(push_client, "notificar") as n:
            oc_push.avisar_cambio_estado(self.db, self.sid, "pendiente_aprobacion", 1)
        a = n.call_args.args
        self.assertEqual(a[0], ["a@z.com"])
        self.assertEqual(a[1], "Solicitud por aprobar")
        self.assertEqual(a[2], "OS-2026-0001 · " + "d" * 90 + " · Sol")
        self.assertEqual(a[3:], (f"/oc/solicitudes/{self.sid}", f"oc-aprobar-{self.sid}"))

    def test_pendiente_sin_aprobadores_cae_a_admin(self):
        def fake(permiso, incluir_admin=True):
            return ["root@z.com"] if incluir_admin else []

        with patch.object(push_client, "correos_con_permiso", side_effect=fake), \
                patch.object(oc_push, "_email_usuario", return_value=""), \
                patch.object(push_client, "notificar") as n:
            oc_push.avisar_cambio_estado(self.db, self.sid, "pendiente_aprobacion", 1)
        self.assertEqual(n.call_args.args[0], ["root@z.com"])

    def test_solicitante(self):
        casos = {"oc_en_plataforma": "Tu pedido llegó", "en_correccion": "Tu solicitud fue devuelta",
                 "rechazada": "Tu solicitud fue rechazada"}
        for estado, titulo in casos.items():
            with patch.object(oc_push, "_email_usuario", return_value="otro@z.com"), \
                    patch.object(push_client, "notificar") as n:
                oc_push.avisar_cambio_estado(self.db, self.sid, estado, 1)
            a = n.call_args.args
            self.assertEqual((a[0], a[1]), (["sol@z.com"], titulo))
            self.assertEqual(a[3:], (f"/operativo/mis-solicitudes/{self.sid}", f"oc-mia-{self.sid}"))

    def test_sin_ruido_ni_autoaviso(self):
        for estado, actor in (("cerrada", "x"), ("entregada", "x"), ("rechazada", "sol@z.com")):
            with patch.object(oc_push, "_email_usuario", return_value=actor), \
                    patch.object(push_client, "notificar") as n:
                oc_push.avisar_cambio_estado(self.db, self.sid, estado, 1)
            n.assert_not_called()

    def test_solicitud_nueva_excluye_solicitante(self):
        with patch.object(push_client, "correos_con_permiso", return_value=["sol@z.com", "c@z.com"]) as q, \
                patch.object(push_client, "notificar") as n:
            oc_push.avisar_solicitud_nueva(self.sol)
        q.assert_called_once_with("mod_oc_ver", incluir_admin=False)
        a = n.call_args.args
        self.assertEqual((a[0], a[1]), (["c@z.com"], "Solicitud nueva por asignar"))
        self.assertEqual(a[3:], (f"/oc/solicitudes/{self.sid}", f"oc-nueva-{self.sid}"))


if __name__ == "__main__":
    unittest.main()
