from pydantic import BaseModel, Field, field_validator


class LibrarySettings(BaseModel):
    metadata_separators: list[str] = Field(max_length=20)

    @field_validator("metadata_separators")
    @classmethod
    def validate_separators(cls, value: list[str]) -> list[str]:
        for separator in value:
            if separator == "":
                raise ValueError("Separators cannot be empty strings")
            if len(separator) > 10:
                raise ValueError("Separators cannot be longer than 10 characters")
        return value
