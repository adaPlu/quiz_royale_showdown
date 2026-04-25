import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const total = await prisma.questionBank.count();
  const active = await prisma.questionBank.count({ where: { isActive: true } });

  const all = await prisma.questionBank.findMany({
    select: { id: true, prompt: true, category: true, difficulty: true, optionA: true, optionB: true, optionC: true, optionD: true, correctIndex: true },
  });

  // Exact duplicate prompts
  const seen = new Map<string, string>();
  const dupeIds: string[] = [];
  for (const q of all) {
    const key = q.prompt.trim().toLowerCase();
    if (seen.has(key)) {
      dupeIds.push(q.id);
    } else {
      seen.set(key, q.id);
    }
  }

  // Near-duplicate check (first 60 chars)
  const seen60 = new Map<string, string>();
  const nearDupes: Array<{ id: string; prompt: string }> = [];
  for (const q of all) {
    const key = q.prompt.trim().toLowerCase().slice(0, 60);
    if (seen60.has(key) && !dupeIds.includes(q.id)) {
      nearDupes.push({ id: q.id, prompt: q.prompt.slice(0, 90) });
    } else {
      seen60.set(key, q.id);
    }
  }

  // Invalid correctIndex
  const badIndex = all.filter((q) => q.correctIndex < 0 || q.correctIndex > 3);

  // Empty options
  const emptyOption = all.filter(
    (q) => !q.optionA?.trim() || !q.optionB?.trim() || !q.optionC?.trim() || !q.optionD?.trim(),
  );

  // By category
  const byCat = await prisma.questionBank.groupBy({
    by: ["category"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  // By difficulty
  const byDiff = await prisma.questionBank.groupBy({
    by: ["difficulty"],
    _count: { id: true },
  });

  console.log("\n════════════════════════════════════════");
  console.log("       QUESTION BANK AUDIT REPORT");
  console.log("════════════════════════════════════════\n");
  console.log(`Total questions  : ${total}`);
  console.log(`Active           : ${active}`);
  console.log(`Inactive         : ${total - active}`);
  console.log(`Exact duplicates : ${dupeIds.length}`);
  console.log(`Near-duplicates  : ${nearDupes.length}`);
  console.log(`Bad correctIndex : ${badIndex.length}`);
  console.log(`Empty options    : ${emptyOption.length}`);

  console.log("\n── By Difficulty ──────────────────────");
  byDiff.forEach((d) => console.log(`  ${d.difficulty.padEnd(8)} ${d._count.id}`));

  console.log("\n── By Category ────────────────────────");
  byCat.forEach((c) => console.log(`  ${String(c._count.id).padStart(4)}  ${c.category}`));

  if (dupeIds.length > 0) {
    console.log(`\n── Exact Duplicate IDs (${dupeIds.length}) ─────────`);
    dupeIds.slice(0, 30).forEach((id) => console.log(`  ${id}`));
    if (dupeIds.length > 30) console.log(`  ... and ${dupeIds.length - 30} more`);
  }

  if (nearDupes.length > 0) {
    console.log(`\n── Near-Duplicates (first 10) ─────────`);
    nearDupes.slice(0, 10).forEach((q) => console.log(`  [${q.id}] ${q.prompt}`));
  }

  if (badIndex.length > 0) {
    console.log(`\n── Bad correctIndex ───────────────────`);
    badIndex.forEach((q) => console.log(`  [${q.id}] index=${q.correctIndex} | ${q.prompt.slice(0, 60)}`));
  }

  if (dupeIds.length > 0) {
    console.log(`\n════════════════════════════════════════`);
    console.log(`Run with --fix to delete ${dupeIds.length} exact duplicates`);
    console.log(`════════════════════════════════════════\n`);

    if (process.argv.includes("--fix")) {
      console.log("Deleting exact duplicates...");
      const result = await prisma.questionBank.deleteMany({ where: { id: { in: dupeIds } } });
      console.log(`Deleted ${result.count} duplicate questions.`);
      const remaining = await prisma.questionBank.count();
      console.log(`Remaining: ${remaining}`);
    }
  } else {
    console.log("\n✓ No exact duplicates found.\n");
  }
}

main()
  .catch(console.error)
  .finally(() => void prisma.$disconnect());
