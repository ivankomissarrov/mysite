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

# Must exist after deploy — hero face cycle / homepage break without these.
REQUIRED_REMOTE_FILES = [
    "index.html",
    "images/favicon-32.png",
    "favicon.ico",
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

# Keep these on the server while the rest of the tree is cleared, so a long
# upload (or a cancelled job) cannot blank the homepage, favicon, or hero cycle.
PRESERVE_EXACT = {
    "index.html",
    "404.html",
    "favicon.ico",
    "favicon.png",
    "favicon-32.png",
    "apple-touch-icon.png",
    "images/favicon-32.png",
    "images/avatar.webp",
    "images/smile.webp",
    "images/old.webp",
}
PRESERVE_PREFIXES = ("images/faces/",)


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


def rel_under(remote_root: str, remote_path: str) -> str:
    prefix = remote_root.rstrip("/") + "/"
    if remote_path == remote_root.rstrip("/"):
        return ""
    if not remote_path.startswith(prefix):
        raise ValueError(f"Path {remote_path!r} is not under {remote_root!r}")
    return remote_path[len(prefix) :]


def is_preserved(rel: str) -> bool:
    if not rel:
        return False
    if rel in PRESERVE_EXACT:
        return True
    return any(rel == prefix.rstrip("/") or rel.startswith(prefix) for prefix in PRESERVE_PREFIXES)


def clear_dir(sftp: paramiko.SFTPClient, path: str, remote_root: str) -> None:
    """Remove remote files except homepage + avatar packs (kept online during upload)."""
    for entry in sftp.listdir_attr(path):
        remote = f"{path}/{entry.filename}"
        rel = rel_under(remote_root, remote)
        if is_preserved(rel):
            continue
        if S_ISDIR(entry.st_mode):
            clear_dir(sftp, remote, remote_root)
            # Keep non-empty preserved dirs (e.g. images/faces/...); drop emptied ones.
            if not sftp.listdir(remote):
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
            "Deploy verification failed — missing required files:\n  - "
            + "\n  - ".join(missing)
        )
    print(f"Verified {len(REQUIRED_REMOTE_FILES)} required files on server")


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

    def priority(path: pathlib.Path) -> tuple[int, str]:
        rel = path.relative_to(local_root).as_posix()
        if rel.startswith("images/faces/"):
            return (0, rel)
        if rel in {
            "images/avatar.webp",
            "images/smile.webp",
            "images/old.webp",
            "images/favicon-32.png",
            "favicon.ico",
            "favicon.png",
            "favicon-32.png",
            "apple-touch-icon.png",
        }:
            return (1, rel)
        if rel in {"index.html", "404.html"}:
            return (2, rel)
        return (3, rel)

    files.sort(key=priority)

    local_faces = (
        list((local_root / "images" / "faces").rglob("*.webp"))
        if (local_root / "images" / "faces").is_dir()
        else []
    )
    if len(local_faces) < 18:
        raise SystemExit(
            f"dist/images/faces is incomplete ({len(local_faces)} webp files, expected 18). "
            "Make sure public/images/faces is committed."
        )

    critical_first = [p for p in files if priority(p)[0] < 3]

    print(f"Connecting to {user}@{host}:{port}")
    print(f"Uploading {len(files)} files to {remote_root}/ ({len(local_faces)} face images)")

    transport = paramiko.Transport((host, port))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    assert sftp is not None

    try:
        ensure_dir(sftp, remote_root)

        # Refresh homepage + faces in place before wiping the rest of the tree.
        print(f"Pre-uploading {len(critical_first)} critical assets…")
        for path in critical_first:
            rel = path.relative_to(local_root).as_posix()
            upload_file(sftp, path, f"{remote_root}/{rel}")

        print("Clearing remote directory (preserving homepage + avatar packs)…")
        clear_dir(sftp, remote_root, remote_root)

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
