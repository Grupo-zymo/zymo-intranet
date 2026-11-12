import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models.user import User
from app.personal_database import PtcCargo, PtcPersona
from app.routers import tasks_v2
from app.services.usuarios_por_area import (
    area_empieza_por,
    es_cargo_lider,
    listar_usuarios_por_area,
    normalizar,
)


def memoria():
    return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


class FuncionesPurasTests(unittest.TestCase):
    def test_normalizar_quita_tildes_mayusculas_y_espacios(self) -> None:
        self.assertEqual(normalizar("  Operaciónes   IMCC "), "operaciones imcc")
        self.assertEqual(normalizar(None), "")

    def test_area_empieza_por(self) -> None:
        self.assertTrue(area_empieza_por("Operaciones IMCC", "Operaciones"))
        self.assertTrue(area_empieza_por("OPERACIÓNES logimat", "operaciones"))
        self.assertTrue(area_empieza_por("Operaciones", "Operaciones"))
        self.assertFalse(area_empieza_por("Cooperaciones", "Operaciones"))
        self.assertFalse(area_empieza_por("Operacionesx", "Operaciones"))
        self.assertFalse(area_empieza_por("Comercial", "Operaciones"))
        self.assertFalse(area_empieza_por(None, "Operaciones"))
        self.assertFalse(area_empieza_por("Operaciones IMCC", ""))

    def test_es_cargo_lider(self) -> None:
        for cargo in ("Coordinadora de Operaciones", "SUPERVISOR de bodega", "Directora", "Líder de turno",
                      "Lider logístico", "Jefe de patio"):
            self.assertTrue(es_cargo_lider(cargo), cargo)
        for cargo in ("Auxiliar de bodega", "Analista", "", None):
            self.assertFalse(es_cargo_lider(cargo), cargo)


class ListarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.main, self.pers = memoria(), memoria()
        SQLModel.metadata.create_all(self.main, tables=[SQLModel.metadata.tables["user"]])
        SQLModel.metadata.create_all(self.pers, tables=[SQLModel.metadata.tables[t] for t in ("ptc_cargo", "ptc_persona")])
        with Session(self.main) as db:
            db.add_all([
                User(id=1, email="Zoe@x.co", full_name="Zoe Auxiliar", hashed_password="x", area="Operaciones IMCC"),
                User(id=2, email="ana@x.co", full_name="Ana Coordina", hashed_password="x", area="operaciónes Logimat"),
                User(id=3, email="beto@x.co", full_name=None, hashed_password="x", area="Operaciones IMCD"),
                User(id=4, email="com@x.co", full_name="Carla", hashed_password="x", area="Comercial"),
                User(id=5, email="ido@x.co", full_name="Ido", hashed_password="x", area="Operaciones IMCC", is_active=False),
                User(id=6, email="dos@x.co", full_name="Dos Fichas", hashed_password="x", area="Operaciones IMCC"),
            ])
            db.commit()
        with Session(self.pers) as p:
            p.add_all([PtcCargo(id=1, nombre="Auxiliar"), PtcCargo(id=2, nombre="Coordinadora de Operaciones")])
            p.add_all([
                PtcPersona(id=1, nombre="Zoe", cargo_id=1, user_id=1),
                # la ficha dice otra área: no importa, el área es la de la cuenta
                PtcPersona(id=2, nombre="Ana", cargo_id=2, user_id=2, area_id=99),
                PtcPersona(id=3, nombre="Dos a", cargo_id=2, user_id=6),
                PtcPersona(id=4, nombre="Dos b", cargo_id=1, user_id=6),
            ])
            p.commit()

    def _listar(self) -> list[dict]:
        with Session(self.main) as db, Session(self.pers) as p:
            return listar_usuarios_por_area(db, p, "Operaciones")

    def test_solo_activos_de_operaciones_lideres_primero(self) -> None:
        filas = self._listar()
        self.assertEqual([f["id"] for f in filas], [2, 3, 6, 1])  # líder primero; luego por nombre (beto@…, Dos, Zoe)
        ana = filas[0]
        self.assertEqual(ana, {"id": 2, "nombre": "Ana Coordina", "email": "ana@x.co", "area": "operaciónes Logimat",
                               "cargo": "Coordinadora de Operaciones", "esLider": True})

    def test_sin_ficha_o_ficha_ambigua_no_adivina_cargo(self) -> None:
        por_id = {f["id"]: f for f in self._listar()}
        self.assertIsNone(por_id[3]["cargo"])
        self.assertEqual(por_id[3]["nombre"], "beto@x.co")  # sin nombre cae al correo, nunca «Usuario N»
        self.assertIsNone(por_id[6]["cargo"])
        self.assertFalse(por_id[6]["esLider"])
        self.assertEqual(por_id[1]["email"], "zoe@x.co")  # correo siempre en minúsculas

    def test_endpoint_exige_clave_interna(self) -> None:
        with Session(self.main) as db:
            with self.assertRaises(HTTPException) as ctx:
                tasks_v2.list_users_por_area(prefijo="Operaciones", x_internal_key=None, db=db)
            self.assertEqual(ctx.exception.status_code, 403)
            with patch.object(tasks_v2.settings, "internal_key", "clave-de-prueba"), \
                    patch.object(tasks_v2, "get_personal_engine", return_value=self.pers):
                with self.assertRaises(HTTPException):
                    tasks_v2.list_users_por_area(prefijo="Operaciones", x_internal_key="otra", db=db)
                filas = tasks_v2.list_users_por_area(prefijo="Operaciones", x_internal_key="clave-de-prueba", db=db)
            self.assertEqual(len(filas), 4)


if __name__ == "__main__":
    unittest.main()
