#!/usr/bin/env python3
"""Read-only inspection. No launch, TCC prompt, token/keychain or project access."""
import json, pathlib, plistlib, platform, subprocess

def command(args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return {'exitCode': r.returncode, 'output': (r.stdout + r.stderr).strip()}
    except (OSError, subprocess.TimeoutExpired) as e:
        return {'error': type(e).__name__}

def inspect(app_path='/Applications/Edits.app'):
    app = pathlib.Path(app_path)
    report = {'platform': platform.system(), 'architecture': platform.machine(), 'appPath': str(app), 'installed': app.exists()}
    if not app.exists():
        return report
    try:
        with (app / 'Contents/Info.plist').open('rb') as stream:
            info = plistlib.load(stream)
        report.update(bundleId=info.get('CFBundleIdentifier'), version=info.get('CFBundleShortVersionString'),
                      build=info.get('CFBundleVersion'), minimumMacOS=info.get('LSMinimumSystemVersion'),
                      platforms=info.get('CFBundleSupportedPlatforms'), urlSchemes=info.get('CFBundleURLTypes'),
                      updaterFeed=info.get('SUFeedURL'), appleScriptDeclared=bool(info.get('NSAppleScriptEnabled')),
                      scriptingDefinitions=[str(p.relative_to(app)) for p in app.rglob('*.sdef')])
        report['signature'] = command(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)])
        report['signatureMetadata'] = command(['/usr/bin/codesign', '-dv', '--verbose=4', str(app)])
        report['identityVerified'] = report['signature'].get('exitCode') == 0
        report['identityNote'] = 'Signature integrity only; independently verify publisher/source. Team metadata alone is not proof.'
    except (OSError, plistlib.InvalidFileException) as e:
        report['inspectionError'] = type(e).__name__
    return report

if __name__ == '__main__':
    print(json.dumps(inspect(), ensure_ascii=False, indent=2))
