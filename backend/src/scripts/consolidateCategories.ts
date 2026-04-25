import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONSOLIDATIONS: Array<{ from: string[]; to: string }> = [
  {
    from: ["Rock", "Country", "Hip-Hop", "Albums", "Famous Songs", "Music Awards"],
    to: "Music",
  },
  {
    from: ["AI Tools", "Gadgets", "Tech Companies", "Social Media Platforms", "Apps", "Startups", "Programming"],
    to: "Technology & AI",
  },
  {
    from: ["Business News"],
    to: "Business",
  },
  {
    from: ["Scientific Discoveries"],
    to: "Science & Nature",
  },
];

async function main(): Promise<void> {
  let grandTotal = 0;

  for (const { from, to } of CONSOLIDATIONS) {
    for (const src of from) {
      const result = await prisma.questionBank.updateMany({
        where: { category: src },
        data: { category: to },
      });
      if (result.count > 0) {
        console.log(`  "${src}" → "${to}" : ${result.count} rows`);
        grandTotal += result.count;
      }
    }
  }

  console.log(`\nDone. ${grandTotal} rows re-categorised.`);

  const byCat = await prisma.questionBank.groupBy({
    by: ["category"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  console.log("\n── Updated category counts ─────────────────");
  byCat.forEach((c) => console.log(`  ${String(c._count.id).padStart(4)}  ${c.category}`));
}

main().catch(console.error).finally(() => void prisma.$disconnect());
