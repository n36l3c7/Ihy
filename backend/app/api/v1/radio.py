from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlalchemy import select

from app.api.deps import AdminUserDep, CurrentUserDep, DbDep
from app.models.radio import RadioStation

router = APIRouter()


class StationPayload(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    stream_url: HttpUrl
    homepage_url: HttpUrl | None = None


class StationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    stream_url: str
    homepage_url: str | None


@router.get("", response_model=list[StationRead])
def list_stations(db: DbDep, _user: CurrentUserDep) -> list[RadioStation]:
    return list(db.scalars(select(RadioStation).order_by(RadioStation.name)))


@router.post("", response_model=StationRead, status_code=status.HTTP_201_CREATED)
def create_station(payload: StationPayload, db: DbDep, _admin: AdminUserDep) -> RadioStation:
    station = RadioStation(
        name=payload.name,
        stream_url=str(payload.stream_url),
        homepage_url=str(payload.homepage_url) if payload.homepage_url else None,
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station(station_id: int, db: DbDep, _admin: AdminUserDep) -> None:
    station = db.get(RadioStation, station_id)
    if station is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Station not found")
    db.delete(station)
    db.commit()
