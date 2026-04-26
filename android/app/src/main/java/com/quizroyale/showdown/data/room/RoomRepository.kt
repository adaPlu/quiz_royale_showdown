package com.quizroyale.showdown.data.room

import com.quizroyale.showdown.data.local.AppDatabase
import com.quizroyale.showdown.data.local.entity.GameCacheEntity
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException

@Singleton
class RoomRepository @Inject constructor(
    private val roomApi: RoomApi,
    appDatabase: AppDatabase,
) {
    private val gameCacheDao = appDatabase.gameCacheDao()

    fun observeLatestCachedRoom(): Flow<CachedRoomSummary?> =
        gameCacheDao.observeLatest().map { it?.toCachedRoomSummary() }

    suspend fun latestCachedRoom(): CachedRoomSummary? =
        gameCacheDao.getLatest()?.toCachedRoomSummary()

    suspend fun getCachedRoom(roomReference: String): CachedRoomSummary? {
        val normalizedReference = roomReference.trim().uppercase()
        val cachedRoom = gameCacheDao.getByRoomCode(normalizedReference)
            ?: gameCacheDao.getByRoomId(normalizedReference)
        return cachedRoom?.toCachedRoomSummary()
    }

    suspend fun createRoom(
        isPrivate: Boolean,
        maxPlayers: Int = DEFAULT_MAX_PLAYERS,
    ): RoomSnapshot {
        val snapshot = roomApi.createRoom(
            CreateRoomRequest(
                isPrivate = isPrivate,
                maxPlayers = maxPlayers,
            )
        ).toRoomSnapshot()
        cache(snapshot)
        return snapshot
    }

    suspend fun joinRoom(roomCode: String): RoomSnapshot {
        val normalizedCode = roomCode.trim().uppercase()
        val snapshot = try {
            roomApi.joinRoom(JoinRoomRequest(roomCode = normalizedCode))
                .toRoomSnapshot(defaultReference = normalizedCode)
        } catch (error: HttpException) {
            if (!error.shouldFallbackToLookup()) {
                throw error
            }
            roomApi.getRoom(normalizedCode).toRoomSnapshot(defaultReference = normalizedCode)
        }
        cache(snapshot)
        return snapshot
    }

    suspend fun startGame(roomId: String) {
        roomApi.startGame(roomId)
    }

    suspend fun refreshRoom(roomReference: String): RoomSnapshot {
        val normalizedReference = roomReference.trim().uppercase()
        val snapshot = roomApi.getRoom(normalizedReference)
            .toRoomSnapshot(defaultReference = normalizedReference)
        cache(snapshot)
        return snapshot
    }

    private suspend fun cache(snapshot: RoomSnapshot) {
        gameCacheDao.upsert(
            GameCacheEntity(
                roomId = snapshot.roomId,
                roomCode = snapshot.roomReference,
                phase = snapshot.phase,
                roundNumber = snapshot.roundNumber,
                totalRounds = snapshot.totalRounds,
            )
        )
    }

    private fun GameCacheEntity.toCachedRoomSummary(): CachedRoomSummary = CachedRoomSummary(
        roomId = roomId,
        roomReference = roomCode,
        phase = phase,
        roundNumber = roundNumber,
        totalRounds = totalRounds,
        cachedAt = cachedAt,
    )

    private fun HttpException.shouldFallbackToLookup(): Boolean = code() in FALLBACK_STATUS_CODES

    private fun JsonObject.toRoomSnapshot(defaultReference: String? = null): RoomSnapshot {
        val rootRoom = this["room"].asJsonObjectOrNull() ?: this
        val roomId = rootRoom.string("roomId")
            ?: rootRoom.string("id")
            ?: string("roomId")
            ?: defaultReference
            ?: error("Room id missing from response")
        val roomCode = rootRoom.string("code")
            ?: rootRoom.string("roomCode")
            ?: string("roomCode")
        val roomReference = roomCode ?: defaultReference ?: roomId
        val players = (rootRoom["players"].asJsonArrayOrNull() ?: emptyJsonArray())
            .mapNotNull { it.asJsonObjectOrNull()?.toRoomPlayerSummary() }
        val totalPlayers = rootRoom.int("totalPlayers") ?: players.size

        return RoomSnapshot(
            roomId = roomId,
            roomReference = roomReference,
            roomCode = roomCode,
            phase = (rootRoom.string("phase") ?: rootRoom.string("status") ?: DEFAULT_PHASE)
                .uppercase(),
            roundNumber = rootRoom.int("roundNumber") ?: rootRoom.int("currentRound") ?: 0,
            totalRounds = rootRoom.int("totalRounds") ?: DEFAULT_TOTAL_ROUNDS,
            totalPlayers = totalPlayers,
            maxPlayers = rootRoom.int("maxPlayers") ?: int("maxPlayers"),
            players = players,
            hostUserId = rootRoom.string("hostUserId") ?: string("hostUserId"),
            wsToken = string("wsToken"),
        )
    }

    private fun JsonObject.toRoomPlayerSummary(): RoomPlayerSummary? {
        val playerId = string("id") ?: string("playerId") ?: return null
        return RoomPlayerSummary(
            id = playerId,
            displayName = string("displayName") ?: string("username") ?: "Player",
            score = int("score") ?: 0,
            streak = int("streak") ?: 0,
            isEliminated = boolean("isEliminated") ?: false,
        )
    }

    private fun JsonObject.string(key: String): String? =
        get(key)?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.int(key: String): Int? =
        get(key)?.jsonPrimitive?.intOrNull

    private fun JsonObject.boolean(key: String): Boolean? =
        get(key)?.jsonPrimitive?.booleanOrNull

    private fun JsonElement?.asJsonObjectOrNull(): JsonObject? = this as? JsonObject

    private fun JsonElement?.asJsonArrayOrNull(): JsonArray? = this as? JsonArray

    private fun emptyJsonArray(): JsonArray = JsonArray(emptyList())

    companion object {
        private const val DEFAULT_MAX_PLAYERS = 8
        private const val DEFAULT_PHASE = "WAITING"
        private const val DEFAULT_TOTAL_ROUNDS = 10
        private val FALLBACK_STATUS_CODES = setOf(404, 405, 501)
    }
}
