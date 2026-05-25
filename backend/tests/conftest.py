import os
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "testsecret"

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import engine, Base, AsyncSessionLocal
from app.main import app
from app.core.deps import get_db, get_current_user
from app.models.usuario import Usuario, RolUsuario


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    import asyncio
    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(_create())


async def override_get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def override_get_current_user():
    return Usuario(
        id=1,
        username="admin",
        email="admin@test.com",
        hashed_password="fake",
        rol=RolUsuario.admin,
        activo=True,
    )


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c
