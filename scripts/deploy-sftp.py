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
    print(f"Connecting to {user}@{host}:{port}")
    print(f"Uploading {len(files)} files to {remote_root}/")

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
            remote_path = f"{remote_root}/{rel}"
            ensure_dir(sftp, str(pathlib.PurePosixPath(remote_path).parent))
            sftp.put(str(path), remote_path)
            if index % 50 == 0 or index == len(files):
                print(f"  {index}/{len(files)}")
        print(f"Done in {time.time() - started:.1f}s")
    finally:
        sftp.close()
        transport.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — surface deploy errors in CI logs
        print(f"Deploy failed: {exc}", file=sys.stderr)
        raise
