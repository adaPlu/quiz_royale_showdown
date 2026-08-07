import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const requireComplete = process.argv.includes("--require-complete");

type CountRow = { count: bigint | number };
type ColumnRow = {
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  is_nullable: "YES" | "NO";
};
type IndexRow = { is_unique: boolean; columns: string[] };
type ConstraintRow = { contype: string; definition: string };
type EnumRow = { enumlabel: string };

type ColumnSpec = {
  name: string;
  dataType: string;
  udtName: string;
  maxLength?: number;
  nullable: boolean;
};

function sqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function normalized(value: string): string {
  return value.replaceAll('"', "").replace(/\s+/g, "").toLowerCase();
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '${sqlLiteral(tableName)}'
  `);
  return Number(rows[0]?.count ?? 0) > 0;
}

async function verifyColumn(
  tableName: string,
  spec: ColumnSpec,
  required: boolean,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<ColumnRow[]>(`
    SELECT data_type, udt_name, character_maximum_length, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '${sqlLiteral(tableName)}'
      AND column_name = '${sqlLiteral(spec.name)}'
  `);

  const row = rows[0];
  if (!row) {
    if (required) {
      throw new Error(`Missing required column ${tableName}.${spec.name}`);
    }
    return;
  }

  if (row.data_type.toLowerCase() !== spec.dataType.toLowerCase()) {
    throw new Error(
      `Column ${tableName}.${spec.name} has data type ${row.data_type}; expected ${spec.dataType}`,
    );
  }
  if (row.udt_name.toLowerCase() !== spec.udtName.toLowerCase()) {
    throw new Error(
      `Column ${tableName}.${spec.name} has underlying type ${row.udt_name}; expected ${spec.udtName}`,
    );
  }
  if (spec.maxLength !== undefined && row.character_maximum_length !== spec.maxLength) {
    throw new Error(
      `Column ${tableName}.${spec.name} has length ${row.character_maximum_length}; expected ${spec.maxLength}`,
    );
  }
  const nullable = row.is_nullable === "YES";
  if (nullable !== spec.nullable) {
    throw new Error(
      `Column ${tableName}.${spec.name} nullable=${nullable}; expected nullable=${spec.nullable}`,
    );
  }
}

async function verifyTable(
  tableName: string,
  columns: readonly ColumnSpec[],
  primaryKeyName: string,
): Promise<void> {
  const exists = await tableExists(tableName);
  if (!exists) {
    if (requireComplete) {
      throw new Error(`Missing required table ${tableName}`);
    }
    return;
  }

  for (const column of columns) {
    await verifyColumn(tableName, column, true);
  }

  await verifyConstraint(
    tableName,
    primaryKeyName,
    "p",
    ["primarykey(id)"],
    true,
  );
}

async function verifyIndex(
  tableName: string,
  indexName: string,
  columns: readonly string[],
  unique: boolean,
  required = requireComplete,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<IndexRow[]>(`
    SELECT
      ix.indisunique AS is_unique,
      array_agg(a.attname::text ORDER BY keys.ordinality) AS columns
    FROM pg_class AS table_class
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    JOIN pg_index AS ix ON ix.indrelid = table_class.oid
    JOIN pg_class AS index_class ON index_class.oid = ix.indexrelid
    JOIN LATERAL unnest(ix.indkey::smallint[]) WITH ORDINALITY AS keys(attnum, ordinality)
      ON TRUE
    JOIN pg_attribute AS a
      ON a.attrelid = table_class.oid
     AND a.attnum = keys.attnum
    WHERE namespace.nspname = 'public'
      AND table_class.relname = '${sqlLiteral(tableName)}'
      AND index_class.relname = '${sqlLiteral(indexName)}'
    GROUP BY ix.indisunique
  `);

  const row = rows[0];
  if (!row) {
    if (required) {
      throw new Error(`Missing required index ${indexName}`);
    }
    return;
  }

  if (row.is_unique !== unique || row.columns.join(",") !== columns.join(",")) {
    throw new Error(
      `Index ${indexName} does not match expected ${unique ? "unique " : ""}(${columns.join(", ")}) shape`,
    );
  }
}

async function verifyConstraint(
  tableName: string,
  constraintName: string,
  type: string,
  expectedFragments: readonly string[],
  required = requireComplete,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<ConstraintRow[]>(`
    SELECT c.contype::text AS contype, pg_get_constraintdef(c.oid, true) AS definition
    FROM pg_constraint AS c
    JOIN pg_class AS table_class ON table_class.oid = c.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    WHERE namespace.nspname = 'public'
      AND table_class.relname = '${sqlLiteral(tableName)}'
      AND c.conname = '${sqlLiteral(constraintName)}'
  `);

  const row = rows[0];
  if (!row) {
    if (required) {
      throw new Error(`Missing required constraint ${constraintName}`);
    }
    return;
  }

  if (row.contype !== type) {
    throw new Error(`Constraint ${constraintName} has type ${row.contype}; expected ${type}`);
  }

  const definition = normalized(row.definition);
  for (const fragment of expectedFragments) {
    if (!definition.includes(normalized(fragment))) {
      throw new Error(
        `Constraint ${constraintName} has unexpected definition: ${row.definition}`,
      );
    }
  }
}

async function verifyEnum(
  enumName: string,
  expectedValues: readonly string[],
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<EnumRow[]>(`
    SELECT e.enumlabel
    FROM pg_type AS t
    JOIN pg_namespace AS namespace ON namespace.oid = t.typnamespace
    JOIN pg_enum AS e ON e.enumtypid = t.oid
    WHERE namespace.nspname = 'public'
      AND t.typname = '${sqlLiteral(enumName)}'
    ORDER BY e.enumsortorder
  `);

  if (rows.length === 0) {
    if (requireComplete) {
      throw new Error(`Missing required enum ${enumName}`);
    }
    return;
  }

  const actualValues = rows.map((row) => row.enumlabel);
  if (actualValues.join(",") !== expectedValues.join(",")) {
    throw new Error(
      `Enum ${enumName} has values ${actualValues.join(", ")}; expected ${expectedValues.join(", ")}`,
    );
  }
}

async function verifyRefreshTokenMigration(): Promise<void> {
  await verifyIndex(
    "RefreshToken",
    "RefreshToken_tokenHash_key",
    ["tokenHash"],
    true,
  );
}

async function verifyEconomyMigration(): Promise<void> {
  await verifyEnum("PowerUpBetStatus", ["PLACED", "WON", "LOST", "REFUNDED"]);

  await verifyTable(
    "PowerUpBet",
    [
      { name: "id", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "roomId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "roundId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "userId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "powerUpId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "quantity", dataType: "integer", udtName: "int4", nullable: false },
      { name: "status", dataType: "USER-DEFINED", udtName: "PowerUpBetStatus", nullable: false },
      { name: "payoutQuantity", dataType: "integer", udtName: "int4", nullable: false },
      { name: "createdAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: false },
      { name: "settledAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: true },
    ],
    "PowerUpBet_pkey",
  );

  await verifyTable(
    "GameSettlement",
    [
      { name: "id", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "roomId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "settledAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: false },
    ],
    "GameSettlement_pkey",
  );

  await verifyTable(
    "GameWinnerReward",
    [
      { name: "id", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "roomId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "userId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "powerUpId", dataType: "character varying", udtName: "varchar", maxLength: 26, nullable: false },
      { name: "quantity", dataType: "integer", udtName: "int4", nullable: false },
      { name: "createdAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: false },
    ],
    "GameWinnerReward_pkey",
  );

  const indexes = [
    ["RefreshToken", "RefreshToken_userId_expiresAt_idx", ["userId", "expiresAt"], false],
    ["Room", "Room_status_createdAt_idx", ["status", "createdAt"], false],
    ["Room", "Room_hostUserId_idx", ["hostUserId"], false],
    ["QuestionBank", "QuestionBank_isActive_difficulty_lastUsedAt_idx", ["isActive", "difficulty", "lastUsedAt"], false],
    ["XpEvent", "XpEvent_userId_createdAt_idx", ["userId", "createdAt"], false],
    ["Season", "Season_startsAt_endsAt_idx", ["startsAt", "endsAt"], false],
    ["PowerUpBet", "PowerUpBet_roundId_userId_key", ["roundId", "userId"], true],
    ["PowerUpBet", "PowerUpBet_roomId_status_idx", ["roomId", "status"], false],
    ["GameSettlement", "GameSettlement_roomId_key", ["roomId"], true],
    ["GameWinnerReward", "GameWinnerReward_roomId_userId_key", ["roomId", "userId"], true],
    ["GameWinnerReward", "GameWinnerReward_userId_createdAt_idx", ["userId", "createdAt"], false],
  ] as const;

  for (const [tableName, indexName, columns, unique] of indexes) {
    await verifyIndex(tableName, indexName, columns, unique);
  }

  const foreignKeys = [
    ["PowerUpBet", "PowerUpBet_roomId_fkey", "roomId", "Room", "CASCADE"],
    ["PowerUpBet", "PowerUpBet_roundId_fkey", "roundId", "Round", "CASCADE"],
    ["PowerUpBet", "PowerUpBet_userId_fkey", "userId", "User", "CASCADE"],
    ["PowerUpBet", "PowerUpBet_powerUpId_fkey", "powerUpId", "PowerUp", "RESTRICT"],
    ["GameSettlement", "GameSettlement_roomId_fkey", "roomId", "Room", "CASCADE"],
    ["GameWinnerReward", "GameWinnerReward_roomId_fkey", "roomId", "Room", "CASCADE"],
    ["GameWinnerReward", "GameWinnerReward_userId_fkey", "userId", "User", "CASCADE"],
    ["GameWinnerReward", "GameWinnerReward_powerUpId_fkey", "powerUpId", "PowerUp", "RESTRICT"],
  ] as const;

  for (const [tableName, constraintName, columnName, referencedTable, deleteAction] of foreignKeys) {
    await verifyConstraint(
      tableName,
      constraintName,
      "f",
      [
        `foreign key (${columnName})`,
        `references ${referencedTable}(id)`,
        `on delete ${deleteAction}`,
        "on update cascade",
      ],
    );
  }
}

async function verifyGuestLifecycleMigration(): Promise<void> {
  const userColumns: readonly ColumnSpec[] = [
    { name: "isGuest", dataType: "boolean", udtName: "bool", nullable: false },
    { name: "expiresAt", dataType: "timestamp without time zone", udtName: "timestamp", nullable: true },
  ];
  const roomColumns: readonly ColumnSpec[] = [
    { name: "isPrivate", dataType: "boolean", udtName: "bool", nullable: false },
    { name: "maxPlayers", dataType: "integer", udtName: "int4", nullable: false },
    { name: "autoStartSolo", dataType: "boolean", udtName: "bool", nullable: false },
    { name: "gameDifficulty", dataType: "character varying", udtName: "varchar", maxLength: 10, nullable: false },
  ];

  for (const column of userColumns) {
    await verifyColumn("User", column, requireComplete);
  }
  for (const column of roomColumns) {
    await verifyColumn("Room", column, requireComplete);
  }

  await verifyIndex("User", "User_isGuest_expiresAt_idx", ["isGuest", "expiresAt"], false);
  await verifyConstraint(
    "Room",
    "Room_maxPlayers_check",
    "c",
    ["maxPlayers", ">= 2", "<= 100"],
  );
  await verifyConstraint(
    "Room",
    "Room_gameDifficulty_check",
    "c",
    ["gameDifficulty", "easy", "medium", "hard"],
  );
}

async function main(): Promise<void> {
  if (!(await tableExists("User")) || !(await tableExists("Room"))) {
    if (requireComplete) {
      throw new Error("Canonical User/Room schema is missing");
    }
    console.log("Known migration schema preflight skipped because the canonical schema is not present.");
    return;
  }

  await verifyRefreshTokenMigration();
  await verifyEconomyMigration();
  await verifyGuestLifecycleMigration();

  console.log(
    requireComplete
      ? "Known migration schema verification passed."
      : "Known migration schema compatibility preflight passed.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "Known migration schema verification failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
