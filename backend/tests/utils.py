from pathlib import Path

from app.services.tag_reader import AudioFileInfo


def make_info(**overrides) -> AudioFileInfo:
    defaults: dict = {
        "format": "mp3",
        "duration": 180.0,
        "bitrate": 320000,
        "sample_rate": 44100,
        "title": "Song",
        "album": "Album",
        "artists": ["Artist"],
        "album_artists": [],
        "genres": ["Rock"],
        "year": 2020,
        "track_number": 1,
        "disc_number": 1,
        "has_embedded_cover": False,
    }
    defaults.update(overrides)
    return AudioFileInfo(**defaults)


class FakeReader:
    """Tag reader driven by a path registry; unknown paths read as unreadable."""

    def __init__(self):
        self.infos: dict[str, AudioFileInfo | None] = {}

    def add(self, path: Path, info: AudioFileInfo | None) -> None:
        self.infos[str(path)] = info

    def __call__(self, path: Path) -> AudioFileInfo | None:
        return self.infos.get(str(path))


def write_audio_file(directory: Path, name: str, content: bytes = b"fake audio") -> Path:
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path
