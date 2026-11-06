import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

token = load('save_token', ROOT / 'scripts/save-token.py')
doctor = load('doctor', ROOT / 'scripts/doctor.py')

class TokenTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='edits-python-test-')
        self.addCleanup(self.tmp.cleanup)
        self.file = Path(self.tmp.name) / 'private.token'

    def test_writes_private_file_without_output(self):
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            token.save_token(str(self.file), 'test-only-secret')
        self.assertEqual(self.file.read_text(), 'test-only-secret\n')
        self.assertEqual(stat.S_IMODE(self.file.stat().st_mode), 0o600)
        self.assertEqual(stream.getvalue(), '')

    def test_never_overwrites(self):
        self.file.write_text('existing')
        with self.assertRaises(FileExistsError):
            token.save_token(str(self.file), 'new-secret')
        self.assertEqual(self.file.read_text(), 'existing')

    def test_never_follows_symlink(self):
        target = self.file.parent / 'target'
        target.write_text('original')
        self.file.symlink_to(target)
        with self.assertRaises(OSError):
            token.save_token(str(self.file), 'new-secret')
        self.assertEqual(target.read_text(), 'original')

    def test_relative_path_rejected(self):
        with self.assertRaises(ValueError):
            token.save_token('relative.token', 'secret')

    def test_invalid_inputs_create_no_file(self):
        for value in ['', 'a\nb', 'a\tb', '\x00', '\x7f', 'şifre', 'a' * 16384]:
            with self.subTest(value=repr(value[:20])):
                with self.assertRaises(ValueError):
                    token.save_token(str(self.file), value)
                self.assertFalse(self.file.exists())

    def test_maximum_file_size_includes_newline(self):
        token.save_token(str(self.file), 'a' * 16383)
        self.assertEqual(self.file.stat().st_size, 16384)

    def test_noninteractive_refused_before_reading_secret(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/save-token.py'), str(self.file)],
                                input='should-not-be-read\n', text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('interactive Terminal', result.stderr)
        self.assertNotIn('should-not-be-read', result.stdout + result.stderr)
        self.assertFalse(self.file.exists())

    def test_echoing_getpass_fallback_is_refused(self):
        with mock.patch.object(sys, 'argv', ['save-token.py', str(self.file)]), \
             mock.patch.object(sys.stdin, 'isatty', return_value=True), \
             mock.patch.object(token.getpass, 'getpass', side_effect=token.getpass.GetPassWarning('fallback')):
            with self.assertRaises(SystemExit):
                token.main()
        self.assertFalse(self.file.exists())

    def test_missing_argument_is_usage_error(self):
        with mock.patch.object(sys, 'argv', ['save-token.py']):
            with self.assertRaises(SystemExit):
                token.main()

class DoctorTests(unittest.TestCase):
    def test_missing_app_is_normal_report(self):
        with tempfile.TemporaryDirectory() as directory:
            report = doctor.inspect(str(Path(directory) / 'missing.app'))
        self.assertFalse(report['installed'])
        self.assertNotIn('identityVerified', report)

    def test_corrupt_plist_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / 'Edits.app'
            (app / 'Contents').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(b'not a plist')
            report = doctor.inspect(str(app))
        self.assertEqual(report['inspectionError'], 'InvalidFileException')

    def test_signature_failure_is_not_verified_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / 'Edits.app'
            (app / 'Contents').mkdir(parents=True)
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier': 'fixture-only', 'CFBundleShortVersionString': '1'}))
            with mock.patch.object(doctor, 'command', return_value={'exitCode': 1, 'output': 'fixture failure'}):
                report = doctor.inspect(str(app))
        self.assertFalse(report['identityVerified'])
        self.assertEqual(report['bundleId'], 'fixture-only')

    def test_subprocess_timeout_is_sanitized(self):
        with mock.patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('fixture', 10)):
            self.assertEqual(doctor.command(['fixture']), {'error': 'TimeoutExpired'})

    def test_missing_executable_is_reported(self):
        with mock.patch.object(subprocess, 'run', side_effect=FileNotFoundError()):
            self.assertEqual(doctor.command(['fixture']), {'error': 'FileNotFoundError'})

if __name__ == '__main__':
    unittest.main()
