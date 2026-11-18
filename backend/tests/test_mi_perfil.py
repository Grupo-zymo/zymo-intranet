"""GET /tc/mi-perfil: cálculo de días al cumpleaños y contrato de la respuesta."""
from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.personal_database import PtcCargo, PtcPersona
from app.routers import personal
from app.routers.personal import _dias_hasta_cumple


def test_hoy():
    assert _dias_hasta_cumple(date(1990, 5, 10), date(2026, 5, 10)) == 0


def test_manana():
    assert _dias_hasta_cumple(date(1990, 5, 11), date(2026, 5, 10)) == 1


def test_ya_paso_este_anio():
    assert _dias_hasta_cumple(date(1990, 5, 9), date(2026, 5, 10)) == 364


def test_29_feb_en_anio_no_bisiesto():
    assert _dias_hasta_cumple(date(1992, 2, 29), date(2027, 2, 20)) == 8  # 28-feb-2027
    assert _dias_hasta_cumple(date(1992, 2, 29), date(2028, 2, 20)) == 9  # 29-feb-2028


def test_cambio_de_anio():
    assert _dias_hasta_cumple(date(1990, 1, 5), date(2026, 12, 30)) == 6


class _MainDb:
    def get(self, *_a):
        return None


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine, tables=[SQLModel.metadata.tables[t.__tablename__] for t in (PtcPersona, PtcCargo)])
    with Session(engine) as s:
        yield s


def test_no_vinculado(db):
    r = personal.mi_perfil(db=db, main_db=_MainDb(), current_user=SimpleNamespace(id=99))
    assert r == {"vinculado": False, "persona": None, "jefe": None, "es_lider": False, "liderados": [], "cumpleanos": []}


def test_lider_con_equipo_y_area(db, monkeypatch):
    monkeypatch.setattr(personal, "_hoy_bogota", lambda: date(2026, 6, 1))
    db.add(PtcPersona(id=1, nombre="Jefe", user_id=7, area_id=3, estado="Activo", documento="123", telefono="555"))
    db.add(PtcPersona(id=2, nombre="Ana", jefe_directo_id=1, area_id=3, estado="Activo", fecha_nacimiento=date(1995, 6, 3)))
    db.add(PtcPersona(id=3, nombre="Beto", area_id=3, estado="Activo", fecha_nacimiento=date(1990, 6, 1)))
    db.add(PtcPersona(id=4, nombre="Lejano", area_id=3, estado="Activo", fecha_nacimiento=date(1990, 12, 1)))
    db.add(PtcPersona(id=5, nombre="Inactivo", jefe_directo_id=1, estado="Inactivo", fecha_nacimiento=date(1990, 6, 2)))
    db.commit()
    r = personal.mi_perfil(db=db, main_db=_MainDb(), current_user=SimpleNamespace(id=7))
    assert r["vinculado"] and r["es_lider"]
    assert [p["id"] for p in r["liderados"]] == [2]
    assert [(c["id"], c["en_dias"], c["es_hoy"], c["origen"]) for c in r["cumpleanos"]] == [
        (3, 0, True, "area"), (2, 2, False, "equipo")]
    assert all(set(c) == {"id", "nombre", "dia", "mes", "en_dias", "es_hoy", "origen"} for c in r["cumpleanos"])
    assert "documento" not in r["persona"] and "telefono" not in r["persona"]
