from datetime import datetime

from pydantic import BaseModel


class ScanResultRead(BaseModel):
    added: int
    updated: int
    removed: int
    unchanged: int
    errors: int


class ScanStatusRead(BaseModel):
    running: bool
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    last_result: ScanResultRead | None
