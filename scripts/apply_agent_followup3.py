from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "backend/src/services/__tests__/GameOrchestrator.test.ts"
content = PATH.read_text(encoding="utf-8")

old = '''    prismaMock.user.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({
        id,
        email: `${id}@example.com`,
        displayName: id,
      })),
    );'''
new = '''    prismaMock.user.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id) => ({
        id,
        email: `${id}@example.com`,
        displayName: id === "finalist-b" ? "Finalist B" : id === "finalist-a" ? "Finalist A" : "Solo Player",
      })),
    );'''
if old not in content:
    raise RuntimeError("Expected GameOrchestrator user fixture was not found")
content = content.replace(old, new, 1)
content = content.replace('displayName: "finalist-b"', 'displayName: "Finalist B"', 1)
content = content.replace('displayName: "finalist-a"', 'displayName: "Finalist A"', 1)
PATH.write_text(content, encoding="utf-8")
print("Updated final standings test to use public display names.")
