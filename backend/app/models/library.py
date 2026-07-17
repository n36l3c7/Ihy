from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Column,
    ForeignKey,
    String,
    Table,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

track_genres = Table(
    "track_genres",
    Base.metadata,
    Column("track_id", ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True),
    Column("genre_id", ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True),
)

# A track can credit multiple artists (split from tags via configurable separators)
track_artists = Table(
    "track_artists",
    Base.metadata,
    Column("track_id", ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True),
    Column("artist_id", ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True),
)


class Source(TimestampMixin, Base):
    """A configured media folder (local path or host-mounted remote storage)."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    path: Mapped[str] = mapped_column(String(1024), unique=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    last_scanned_at: Mapped[datetime | None]

    tracks: Mapped[list["Track"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class Artist(TimestampMixin, Base):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    sort_name: Mapped[str | None] = mapped_column(String(255))

    albums: Mapped[list["Album"]] = relationship(back_populates="artist")
    tracks: Mapped[list["Track"]] = relationship(secondary=track_artists, back_populates="artists")


class Album(TimestampMixin, Base):
    __tablename__ = "albums"
    __table_args__ = (UniqueConstraint("title", "artist_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    artist_id: Mapped[int | None] = mapped_column(
        ForeignKey("artists.id", ondelete="SET NULL"), index=True
    )
    year: Mapped[int | None]
    cover_path: Mapped[str | None] = mapped_column(String(1024))

    artist: Mapped["Artist | None"] = relationship(back_populates="albums")
    tracks: Mapped[list["Track"]] = relationship(
        back_populates="album", order_by="Track.disc_number, Track.track_number"
    )


class Genre(Base):
    __tablename__ = "genres"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)

    tracks: Mapped[list["Track"]] = relationship(secondary=track_genres, back_populates="genres")


class Track(TimestampMixin, Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(primary_key=True)

    # File information
    source_id: Mapped[int] = mapped_column(
        ForeignKey("sources.id", ondelete="CASCADE"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(1024), unique=True)
    file_size: Mapped[int] = mapped_column(BigInteger)
    file_mtime: Mapped[float]  # POSIX timestamp, used to detect changes between scans
    format: Mapped[str] = mapped_column(String(10))  # e.g. "mp3", "flac"
    duration: Mapped[float]  # seconds
    bitrate: Mapped[int | None]  # bits per second
    sample_rate: Mapped[int | None]  # Hz

    # Tag information
    title: Mapped[str] = mapped_column(String(255), index=True)
    album_id: Mapped[int | None] = mapped_column(
        ForeignKey("albums.id", ondelete="SET NULL"), index=True
    )
    track_number: Mapped[int | None]
    disc_number: Mapped[int | None]
    year: Mapped[int | None]
    has_embedded_cover: Mapped[bool] = mapped_column(default=False)

    source: Mapped["Source"] = relationship(back_populates="tracks")
    artists: Mapped[list["Artist"]] = relationship(
        secondary=track_artists, back_populates="tracks"
    )
    album: Mapped["Album | None"] = relationship(back_populates="tracks")
    genres: Mapped[list["Genre"]] = relationship(secondary=track_genres, back_populates="tracks")
