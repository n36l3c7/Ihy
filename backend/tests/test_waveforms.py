import struct
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.v1 import tracks as tracks_api
from app.services.waveforms import compute_peaks


def test_compute_peaks_normalizes_and_buckets() -> None:
    # 1000 samples: first half quiet (1000), second half loud (30000)
    samples = [1000] * 500 + [30000] * 500
    pcm = struct.pack(f"<{len(samples)}h", *samples)
    peaks = compute_peaks(pcm, buckets=10)
    assert len(peaks) == 10
    assert max(peaks) == 1.0  # normalized
    assert peaks[0] < 0.1  # quiet half
    assert peaks[-1] == 1.0  # loud half


def test_compute_peaks_empty_input() -> None:
    assert compute_peaks(b"") == []


def test_waveform_endpoint(
    client: TestClient,
    user_headers: dict,
    seeded_library: SimpleNamespace,
    monkeypatch,
) -> None:
    track = seeded_library.tracks[0]
    monkeypatch.setattr(
        tracks_api.waveforms, "get_or_create_waveform", lambda _track: [0.2, 1.0, 0.5]
    )
    response = client.get(f"/api/v1/tracks/{track.id}/waveform", headers=user_headers)
    assert response.status_code == 200
    assert response.json() == {"peaks": [0.2, 1.0, 0.5]}


def test_waveform_endpoint_unavailable(
    client: TestClient,
    user_headers: dict,
    seeded_library: SimpleNamespace,
    monkeypatch,
) -> None:
    track = seeded_library.tracks[0]
    monkeypatch.setattr(
        tracks_api.waveforms, "get_or_create_waveform", lambda _track: None
    )
    response = client.get(f"/api/v1/tracks/{track.id}/waveform", headers=user_headers)
    assert response.status_code == 404
