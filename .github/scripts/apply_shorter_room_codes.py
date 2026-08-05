from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    matches = text.count(old)
    if matches != expected:
        raise RuntimeError(f"{path}: expected {expected} matches, found {matches}")
    file_path.write_text(text.replace(old, new, expected))


replace_exact(
    "backend/src/services/RoomService.ts",
    "    const codeLength = 8;",
    "    const codeLength = 6;",
)

replace_exact(
    "backend/src/services/__tests__/RoomService.test.ts",
    '  it("generates 8-character URL-safe room invite codes", async () => {',
    '  it("generates 6-character URL-safe room invite codes", async () => {',
)
replace_exact(
    "backend/src/services/__tests__/RoomService.test.ts",
    "    expect(generatedCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);",
    "    expect(generatedCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);",
)

replace_exact(
    "backend/src/routes/rooms.ts",
    '''const joinRoomSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(8)
    .max(8)
    .nullable()
    .optional()
    .transform((value) => {
      const normalized = value?.trim().toUpperCase();
      return normalized ? normalized : undefined;
    }),
});

const roomCodeParamsSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .length(8, "roomCode must be exactly 8 characters")
    .transform((value) => value.toUpperCase()),
});''',
    '''const ROOM_CODE_LENGTH = 6;
const LEGACY_ROOM_CODE_LENGTH = 8;
const roomCodeLengthMessage =
  "roomCode must be 6 characters (8-character legacy codes are also accepted)";

const supportedRoomCodeSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value.length === ROOM_CODE_LENGTH || value.length === LEGACY_ROOM_CODE_LENGTH,
    roomCodeLengthMessage
  )
  .transform((value) => value.toUpperCase());

const joinRoomSchema = z.object({
  roomCode: supportedRoomCodeSchema
    .nullable()
    .optional()
    .transform((value) => value || undefined),
});

const roomCodeParamsSchema = z.object({
  roomCode: supportedRoomCodeSchema,
});''',
)

replace_exact(
    "backend/src/routes/__tests__/rooms.http.test.ts",
    'const VALID_ROOM_CODE = "ABCD2345";',
    'const VALID_ROOM_CODE = "ABCD23";',
)

replace_exact(
    "webapp/src/pages/HomePage.tsx",
    '''const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
''',
    '''const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const ROOM_CODE_LENGTH = 6;
const LEGACY_ROOM_CODE_LENGTH = 8;
const MAX_ROOM_CODE_LENGTH = LEGACY_ROOM_CODE_LENGTH;
const isSupportedRoomCode = (value: string) =>
  value.length === ROOM_CODE_LENGTH || value.length === LEGACY_ROOM_CODE_LENGTH;
''',
)
replace_exact(
    "webapp/src/pages/HomePage.tsx",
    "    setCode(invitedRoomCode.slice(0, 8));",
    "    setCode(invitedRoomCode.slice(0, MAX_ROOM_CODE_LENGTH));",
)
replace_exact(
    "webapp/src/pages/HomePage.tsx",
    '''    if (normalizedCode.length < 8) {
      return;
    }''',
    '''    if (!isSupportedRoomCode(normalizedCode)) {
      return;
    }''',
)
replace_exact(
    "webapp/src/pages/HomePage.tsx",
    '''              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 8))}
              placeholder="Room Code"''',
    '''              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, MAX_ROOM_CODE_LENGTH),
                )
              }
              placeholder="6-character Room Code"''',
)
replace_exact(
    "webapp/src/pages/HomePage.tsx",
    "              disabled={code.trim().length < 8 || !!loading}",
    "              disabled={!isSupportedRoomCode(code.trim()) || !!loading}",
)

replace_exact(
    "android/app/src/main/java/com/quizroyale/showdown/ui/screens/home/HomeViewModel.kt",
    '''        if (roomCode.length < MIN_ROOM_CODE_LENGTH) {
            _uiState.update {
                it.copy(errorMessage = "Enter a valid room code to join.")
            }
            return
        }''',
    '''        if (!isSupportedRoomCode(roomCode)) {
            _uiState.update {
                it.copy(errorMessage = "Enter a valid room code to join.")
            }
            return
        }''',
)
replace_exact(
    "android/app/src/main/java/com/quizroyale/showdown/ui/screens/home/HomeViewModel.kt",
    '''    companion object {
        private const val MIN_ROOM_CODE_LENGTH = 4
        private const val MAX_ROOM_REFERENCE_LENGTH = 8
    }''',
    '''    companion object {
        private const val ROOM_CODE_LENGTH = 6
        private const val LEGACY_ROOM_CODE_LENGTH = 8
        private const val MAX_ROOM_REFERENCE_LENGTH = LEGACY_ROOM_CODE_LENGTH

        private fun isSupportedRoomCode(value: String): Boolean =
            value.length == ROOM_CODE_LENGTH || value.length == LEGACY_ROOM_CODE_LENGTH
    }''',
)

replace_exact(
    "android/app/src/main/java/com/quizroyale/showdown/ui/screens/home/HomeScreen.kt",
    '                    supportingText = { Text("Use the room code shared by the host.") },',
    '                    supportingText = { Text("Use the 6-character code shared by the host.") },',
)
