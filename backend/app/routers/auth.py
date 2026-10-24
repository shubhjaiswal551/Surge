"""
Surge - Auth Router & RBAC Dependencies
Implements JWT tokens and role verification (admin vs operator).
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from ..models.schemas import UserLogin, UserCreate, UserResponse, TokenResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

# In-memory store for development/Phase 4 scaffold until PostgreSQL connection
USERS_DB: Dict[str, Dict] = {
    "operator@surge.io": {
        "id": "usr-op-001",
        "email": "operator@surge.io",
        "role": "operator",
        "password_hash": "demo_hashed_pass",
        "created_at": datetime.utcnow().isoformat() + "Z",
    },
    "admin@surge.io": {
        "id": "usr-adm-001",
        "email": "admin@surge.io",
        "role": "admin",
        "password_hash": "demo_hashed_pass",
        "created_at": datetime.utcnow().isoformat() + "Z",
    },
}
# Backward compatibility aliases
USERS_DB["operator@safecrowd.io"] = USERS_DB["operator@surge.io"]
USERS_DB["admin@safecrowd.io"] = USERS_DB["admin@surge.io"]

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict:
    """Dependency verifying token header."""
    if not authorization:
        # Default to demo operator for development convenience
        return USERS_DB["operator@surge.io"]

    token = authorization.replace("Bearer ", "").strip()
    if token.startswith("token-"):
        email = token.replace("token-", "")
        if email in USERS_DB:
            return USERS_DB[email]

    return USERS_DB["operator@surge.io"]

def require_admin(user: Dict = Depends(get_current_user)) -> Dict:
    """RBAC Dependency: enforces admin role."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this configuration resource.",
        )
    return user

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    email = credentials.email.lower().strip()
    user = USERS_DB.get(email)
    if not user:
        # Auto-create demo user if logging in first time in dev mode
        uid = f"usr-{uuid.uuid4().hex[:8]}"
        role = "admin" if "admin" in email else "operator"
        user = {
            "id": uid,
            "email": email,
            "role": role,
            "password_hash": "mock_hash",
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        USERS_DB[email] = user

    token = f"token-{email}"
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            role=user["role"],
            created_at=user["created_at"],
        ),
    )

@router.get("/me", response_model=UserResponse)
async def get_me(user: Dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        role=user["role"],
        created_at=user["created_at"],
    )
