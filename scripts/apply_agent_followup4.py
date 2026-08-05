from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "webapp/src/pages/LoginPage.tsx"
content = PATH.read_text(encoding="utf-8")
old = '''  const invitedCode = normalizeCode(
    new URLSearchParams(window.location.search).get('roomCode') ?? '',
  );'''
new = '''  const invitedCode = normalizeCode(
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('roomCode') ?? '',
  );'''
if old not in content:
    raise RuntimeError("Expected guest invite parsing block was not found")
PATH.write_text(content.replace(old, new, 1), encoding="utf-8")
print("Made guest invite parsing safe for server rendering and tests.")
