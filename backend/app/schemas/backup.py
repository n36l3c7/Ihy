from pydantic import BaseModel, Field


class BackupImportRequest(BaseModel):
    sections: list[str] = Field(min_length=1)
    data: dict


class BackupImportResult(BaseModel):
    sections: dict[str, dict[str, int]]
