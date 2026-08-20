#!/usr/bin/env python3
"""Upload ./dist to REG.RU hosting over SFTP.

Required env:
  SFTP_HOST
  SFTP_USER
  SFTP_PASSWORD
Optional:
  SFTP_REMOTE_DIR  (default: www/komissarov.online)
  SFTP_PORT        (default: 22)
"""

from __future__ import annotations

import os
import pathlib
import sys
import time
from stat import S_ISDIR

import paramiko

# Must exist after deploy — hero face cycle breaks without these.
REQUIRED_REMOTE_FILES = [
    "images/avatar.webp",
    "images/smile.webp",
    "images/old.webp",
    "images/faces/mage/default.webp",
    "images/faces/mage/smile.webp",
    "images/faces/mage/old.webp",
    "images/faces/paladin/default.webp",
    "images/faces/orc/default.webp",
    "images/faces/duck/default.webp",
    "images/faces/marine/default.webp",
    "images/faces/potter/default.webp",
]


def require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required env var: {name}")
    return value


def ensure_dir(sftp: paramiko.SFTPClient, path: str) -> None:
    parts = path.strip("/").split("/")
    cur = ""
    for part in parts:
        cur = f"{cur}/{part}" if cur else part
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def clear_dir(sftp: paramiko.SFTPClient, path: str) -> None:
    for entry in sftp.listdir_attr(path):
        remote = f"{path}/{entry.filename}"
        if S_ISDIR(entry.st_mode):
            clear_dir(sftp, remote)
            sftp.rmdir(remote)
        else:
            sftp.remove(remote)


def upload_file(sftp: paramiko.SFTPClient, local: pathlib.Path, remote: str) -> None:
    ensure_dir(sftp, str(pathlib.PurePosixPath(remote).parent))
    sftp.put(str(local), remote)


def verify_required(sftp: paramiko.SFTPClient, remote_root: str) -> None:
    missing = []
    for rel in REQUIRED_REMOTE_FILES:
        remote = f"{remote_root}/{rel}"
        try:
            attr = sftp.stat(remote)
            if attr.st_size <= 0:
                missing.append(f"{rel} (empty)")
        except FileNotFoundError:
            missing.append(rel)
    if missing:
        raise SystemExit(
            "Deploy verification failed — missing avatar assets:\n  - "
            + "\n  - ".join(missing)
        )
    print(f"Verified {len(REQUIRED_REMOTE_FILES)} required avatar files on server")


def main() -> None:
    host = require("SFTP_HOST")
    user = require("SFTP_USER")
    password = require("SFTP_PASSWORD")
    port = int(os.environ.get("SFTP_PORT", "22"))
    remote_root = os.environ.get("SFTP_REMOTE_DIR", "www/komissarov.online").strip().strip("/")
    local_root = pathlib.Path("dist")

    if not local_root.is_dir():
        raise SystemExit("dist/ not found — run npm run build first")

    files = [p for p in local_root.rglob("*") if p.is_file()]
    # Upload face packs and core portraits first so a mid-run failure
    # does not leave the hero cycle without alternate avatars.
    def priority(path: pathlib.Path) -> tuple[int, str]:
        rel = path.relative_to(local_root).as_posix()
        if rel.startswith("images/faces/"):
            return (0, rel)
        if rel in {"images/avatar.webp", "images/smile.webp", "images/old.webp"}:
            return (1, rel)
        return (2, rel)

    files.sort(key=priority)

    local_faces = list((local_root / "images" / "faces").rglob("*.webp")) if (local_root / "images" / "faces").is_dir() else []
    if len(local_faces) < 18:
        raise SystemExit(
            f"dist/images/faces is incomplete ({len(local_faces)} webp files, expected 18). "
            "Make sure public/images/faces is committed."
        )

    print(f"Connecting to {user}@{host}:{port}")
    print(f"Uploading {len(files)} files to {remote_root}/ ({len(local_faces)} face images)")

    transport = paramiko.Transport((host, port))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    assert sftp is not None

    try:
        ensure_dir(sftp, remote_root)
        print("Clearing remote directory…")
        clear_dir(sftp, remote_root)

        started = time.time()
        for index, path in enumerate(files, start=1):
            rel = path.relative_to(local_root).as_posix()
            upload_file(sftp, path, f"{remote_root}/{rel}")
            if index % 50 == 0 or index == len(files):
                print(f"  {index}/{len(files)}")
        print(f"Done in {time.time() - started:.1f}s")
        verify_required(sftp, remote_root)
    finally:
        sftp.close()
        transport.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — surface deploy errors in CI logs
        print(f"Deploy failed: {exc}", file=sys.stderr)
        raise
