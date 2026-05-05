from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, List
from datetime import datetime
from app.models.usuario import RolUsuario


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type:   str
    rol:          str
    username:     str


class UsuarioCreate(BaseModel):
    username:      str
    email:         str
    password:      str
    rol:           RolUsuario = RolUsuario.operador
    permisos_tabs: Optional[Dict[str, List[str]]] = None


class UsuarioUpdate(BaseModel):
    email:         Optional[str]                    = None
    rol:           Optional[RolUsuario]             = None
    activo:        Optional[bool]                   = None
    password:      Optional[str]                    = None
    permisos_tabs: Optional[Dict[str, List[str]]]  = None


class UsuarioResponse(BaseModel):
    id:            int
    username:      str
    email:         str
    rol:           RolUsuario
    activo:        bool
    created_at:    Optional[datetime]               = None
    permisos_tabs: Optional[Dict[str, List[str]]]  = None

    class Config:
        from_attributes = True