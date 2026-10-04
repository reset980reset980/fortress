#!/usr/bin/env python3
"""Reject backup members that cannot safely be restored into a static root."""
import sys
import tarfile
from pathlib import PurePosixPath

with tarfile.open(sys.argv[1]) as archive:
    for member in archive.getmembers():
        if (member.name.startswith('/')
                or '..' in PurePosixPath(member.name).parts
                or not (member.isfile() or member.isdir())):
            raise SystemExit('Unsafe or unsupported backup member: ' + member.name)
print('Backup members verified for restoration.')
