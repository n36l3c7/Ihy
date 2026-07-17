from dataclasses import asdict

from fastapi import APIRouter, HTTPException, status

from app.api.deps import AdminUserDep
from app.schemas.scan import ScanResultRead, ScanStatusRead
from app.services.scan_manager import scan_manager

router = APIRouter()


def _current_status() -> ScanStatusRead:
    last_result = scan_manager.last_result
    return ScanStatusRead(
        running=scan_manager.running,
        started_at=scan_manager.started_at,
        finished_at=scan_manager.finished_at,
        error=scan_manager.error,
        last_result=ScanResultRead(**asdict(last_result)) if last_result is not None else None,
    )


@router.get("/scan", response_model=ScanStatusRead)
def scan_status(_admin: AdminUserDep) -> ScanStatusRead:
    return _current_status()


@router.post("/scan", response_model=ScanStatusRead, status_code=status.HTTP_202_ACCEPTED)
def start_scan(_admin: AdminUserDep, full: bool = False) -> ScanStatusRead:
    """Start a scan. With full=true, unchanged files are re-read too
    (needed after changing metadata separators)."""
    if not scan_manager.start(full=full):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A scan is already running"
        )
    return _current_status()
