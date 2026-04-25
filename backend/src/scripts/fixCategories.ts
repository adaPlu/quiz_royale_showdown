import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const fixes = [
    { from: "Science &amp; Nature", to: "Science & Nature" },
    { from: "Entertainment: Japanese Anime &amp; Manga", to: "Entertainment: Anime & Manga" },
  ];

  for (const { from, to } of fixes) {
    const result = await prisma.questionBank.updateMany({
      where: { category: from },
      data: { category: to },
    });
    console.log(`"${from}" → "${to}" : ${result.count} rows updated`);
  }
  console.log("Done.");
}

main().catch(console.error).finally(() => void prisma.$disconnect());
