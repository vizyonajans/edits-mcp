#!/usr/bin/env python3
"""Manual interactive use only; refuse getpass's potentially echoing fallback."""
import getpass
import os
import pathlib
import sys
import warnings


def save_token(path_string, token):
    path = pathlib.Path(path_string)
    if not path.is_absolute():
        raise ValueError('Use an absolute path.')
    token = token.strip()
    if not token or len(token.encode('utf-8')) > 16383 or any(ord(c) < 33 or ord(c) > 126 for c in token):
        raise ValueError('Invalid token; no file written.')
    # Never overwrite an existing file/symlink. Parent must already exist.
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(token + '\n')


def main():
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 scripts/save-token.py /absolute/private/path/edits.token')
    if not sys.stdin.isatty():
        sys.exit('Use an interactive Terminal. Refusing potentially visible token input.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', getpass.GetPassWarning)
            token = getpass.getpass('Paste Edits Automation access token (hidden): ')
        save_token(sys.argv[1], token)
    except (ValueError, OSError, getpass.GetPassWarning):
        sys.exit('Token not saved. Check absolute path, input, and whether the file already exists.')
    print('Token saved with private permissions. The token was not printed.')


if __name__ == '__main__':
    main()
