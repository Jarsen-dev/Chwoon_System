from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ══════════════════════════════════════════════════════════════════════
# ConfiguracionEmpresa
# ══════════════════════════════════════════════════════════════════════

class ConfiguracionEmpresaBase(BaseModel):
    nombre:              str
    rfc:                 Optional[str] = None
    direccion:           Optional[str] = None
    telefono:            Optional[str] = None
    email:               Optional[str] = None
    logo_url:            Optional[str] = None
    representante_legal: Optional[str] = None
    regimen_fiscal:      Optional[str] = None
    cp:                  Optional[str] = None
    ciudad:              Optional[str] = None
    estado:              Optional[str] = None
    pais:                Optional[str] = "México"
    banco:               Optional[str] = None
    cuenta:              Optional[str] = None
    clabe:               Optional[str] = None


class ConfiguracionEmpresaCreate(ConfiguracionEmpresaBase):
    pass


class ConfiguracionEmpresaUpdate(BaseModel):
    """Todos los campos opcionales para PATCH/PUT parcial."""
    nombre:              Optional[str] = None
    rfc:                 Optional[str] = None
    direccion:           Optional[str] = None
    telefono:            Optional[str] = None
    email:               Optional[str] = None
    logo_url:            Optional[str] = None
    representante_legal: Optional[str] = None
    regimen_fiscal:      Optional[str] = None
    cp:                  Optional[str] = None
    ciudad:              Optional[str] = None
    estado:              Optional[str] = None
    pais:                Optional[str] = None
    banco:               Optional[str] = None
    cuenta:              Optional[str] = None
    clabe:               Optional[str] = None


class ConfiguracionEmpresaOut(ConfiguracionEmpresaBase):
    id:         int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════════
# ContactoEmpresa
# ══════════════════════════════════════════════════════════════════════

class ContactoEmpresaBase(BaseModel):
    area:         str
    nombre:       str
    puesto:       Optional[str]  = None
    telefono:     Optional[str]  = None
    ext:          Optional[str]  = None
    celular:      Optional[str]  = None
    email:        Optional[str]  = None
    es_principal: bool           = False
    horario:      Optional[str]  = None
    notas:        Optional[str]  = None
    activo:       bool           = True


class ContactoEmpresaCreate(ContactoEmpresaBase):
    pass


class ContactoEmpresaUpdate(BaseModel):
    area:         Optional[str]  = None
    nombre:       Optional[str]  = None
    puesto:       Optional[str]  = None
    telefono:     Optional[str]  = None
    ext:          Optional[str]  = None
    celular:      Optional[str]  = None
    email:        Optional[str]  = None
    es_principal: Optional[bool] = None
    horario:      Optional[str]  = None
    notas:        Optional[str]  = None
    activo:       Optional[bool] = None


class ContactoEmpresaOut(ContactoEmpresaBase):
    id:         int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}