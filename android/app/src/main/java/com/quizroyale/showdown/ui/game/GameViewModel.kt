package com.quizroyale.showdown.ui.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.BuildConfig
import com.quizroyale.showdown.data.auth.AuthRepository
import com.quizroyale.showdown.data.socket.WebSocketManager
import com.quizroyale.showdown.domain.model.PowerupType
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

// ── Power-up inventory (keyed by PowerupType) ─────────────────────────────────
private typealias PowerupInventory = MutableMap<PowerupType, Int>

// ── Intent ────────────────────────────────────────────────────────────────────

sealed class GameIntent {
    data class JoinRoom(val roomCode: String) : GameIntent()
    data class SubmitAnswer(val optionIndex: Int) : GameIntent()
    data class UsePowerup(val type: PowerupType) : GameIntent()
}

// ── ViewModel ─────────────────────────────────────────────────────────────────

@HiltViewModel
class GameViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val webSocketManager: WebSocketManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<GameUiState>(GameUiState.Idle)
    val uiState: GameUiState get() = _uiState.value
    val uiStateFlow: StateFlow<GameUiState> = _uiState.asStateFlow()

    private val _sideEffects = Channel<GameSideEffect>(Channel.BUFFERED)
    val sideEffects = _sideEffects.receiveAsFlow()

    val isReconnecting: StateFlow<Boolean> = webSocketManager.isConnected
        .map { connected ->
            val state = _uiState.value
            !connected && state !is GameUiState.Idle && state !is GameUiState.GameOver
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private var timerJob: Job? = null
    private var activeRoomCode: String? = null

    /** Persistent inventory that survives across rounds; updated by loot drop events. */
    private val powerupInventory: PowerupInventory = mutableMapOf()

    /** Set of powerup types used in the current round — cleared on each new question. */
    private val usedThisRound: MutableSet<PowerupType> = mutableSetOf()

    init {
        observeWsEvents()
        observeReconnects()
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    fun onIntent(intent: GameIntent) {
        when (intent) {
            is GameIntent.JoinRoom -> joinRoom(intent.roomCode)
            is GameIntent.SubmitAnswer -> submitAnswer(intent.optionIndex)
            is GameIntent.UsePowerup -> usePowerup(intent.type)
        }
    }

    /** Called from legacy MainActivity wiring — delegates to intent. */
    fun joinRoom(roomCode: String) {
        val accessToken = authRepository.currentAccessToken() ?: return
        activeRoomCode = roomCode.trim().uppercase().takeIf { it.isNotBlank() }
        webSocketManager.connect(BuildConfig.WS_BASE_URL, accessToken)
        sendJoinRoom()
        _uiState.value = GameUiState.Lobby(roomCode = roomCode)
    }

    /** Send a player answer over WebSocket. */
    fun submitAnswer(optionIndex: Int) {
        val state = _uiState.value as? GameUiState.ActiveQuestion ?: return
        // Mark locally so UI can reflect selection immediately
        _uiState.value = state.copy(selectedOptionIndex = optionIndex)
        webSocketManager.send(
            """{"type":"round:submit_answer","version":"v1","payload":{"roomId":"${state.roomId}","questionId":"${state.questionId}","answerIndex":$optionIndex,"clientSentAt":"${java.time.Instant.now()}"}}"""
        )
        _sideEffects.trySend(GameSideEffect.AnswerSubmitted)
    }

    /** Activate a powerup for the current user. */
    fun usePowerup(type: PowerupType) {
        val state = _uiState.value as? GameUiState.ActiveQuestion ?: return
        // Don't send if already used this round or no charges remain
        if (usedThisRound.contains(type)) return
        val qty = powerupInventory[type] ?: 0
        if (qty <= 0) return

        usedThisRound.add(type)
        powerupInventory[type] = (qty - 1).coerceAtLeast(0)
        _uiState.value = state.copy(ownedPowerups = buildOwnedPowerupList())
        webSocketManager.send(
            """{"type":"powerup:activate","version":"v1","payload":{"roomId":"${state.roomId}","powerUpId":"${type.name}"}}"""
        )
    }

    // ── WS Event Handling ─────────────────────────────────────────────────────

    private fun observeWsEvents() {
        viewModelScope.launch {
            webSocketManager.events.collect { rawEvent ->
                handleRawEvent(rawEvent)
            }
        }
    }

    private fun observeReconnects() {
        viewModelScope.launch {
            webSocketManager.isConnected
                .collect { connected ->
                    if (connected) {
                        sendJoinRoom()
                    }
                }
        }
    }

    private fun sendJoinRoom() {
        val roomCode = activeRoomCode ?: return
        webSocketManager.send(
            """{"type":"room:join","version":"v1","payload":{"roomCode":"$roomCode"}}"""
        )
    }

    private fun handleRawEvent(raw: String) {
        runCatching {
            val envelope = JSONObject(raw)
            val type = envelope.optString("type")
            val payload = envelope.optJSONObject("payload") ?: JSONObject()

            when (type) {
                // round:question_started — server pushes a new question
                "round:question_started" -> {
                    val questionId = payload.optString("questionId")
                    val roundId = payload.optString("roundId")
                    val prompt = payload.optString("prompt")
                    val timeLimitMs = payload.optInt("timeLimitMs", 20_000)
                    val answersArray = payload.optJSONArray("answers")
                    val answers = buildList {
                        if (answersArray != null) {
                            for (i in 0 until answersArray.length()) {
                                add(answersArray.getString(i))
                            }
                        }
                    }
                    val players = parsePlayers(payload).ifEmpty { currentPlayers() }

                    // Reset per-round used set for the new question
                    usedThisRound.clear()

                    _uiState.value = GameUiState.ActiveQuestion(
                        roomId = payload.optString("roomId", currentRoomId()),
                        roundId = roundId,
                        questionId = questionId,
                        prompt = prompt,
                        answers = answers,
                        timeLimitMs = timeLimitMs,
                        timerSeconds = timeLimitMs / 1_000,
                        players = players,
                        phaseLabel = "QUESTION_ACTIVE",
                        ownedPowerups = buildOwnedPowerupList(),
                    )
                    startCountdown(timeLimitMs / 1_000)
                }

                // round:countdown_started — pre-question countdown; show lobby/waiting state
                "round:countdown_started" -> {
                    val currentRoomId = payload.optString("roomId", currentRoomId())
                    _uiState.value = GameUiState.Lobby(
                        roomCode = currentRoomId,
                        players = currentPlayers(),
                    )
                }

                // round:result — round finished, show leaderboard / eliminated markers
                "round:result" -> {
                    timerJob?.cancel()
                    val correctAnswerIndex = payload.optInt("correctAnswerIndex", -1)
                    val summary = if (correctAnswerIndex >= 0)
                        "Correct answer: option ${correctAnswerIndex + 1}"
                    else
                        "Round complete."
                    val players = parseRankings(payload)
                    val roomIdFinal = payload.optString("roomId", currentRoomId())
                    // Check if local player was eliminated
                    val localId = authRepository.currentUserId() ?: ""
                    val wasEliminated = players.any { it.id == localId && it.isEliminated }
                    if (wasEliminated) _sideEffects.trySend(GameSideEffect.PlayerEliminated)

                    _uiState.value = GameUiState.RoundResult(
                        roomId = roomIdFinal,
                        summary = summary,
                        players = players,
                    )
                }

                // game:over — game over, navigate to Results
                "game:over" -> {
                    timerJob?.cancel()
                    val players = parseFinalStandings(payload)
                    val roomIdFinal = payload.optString("roomId", currentRoomId())
                    _uiState.value = GameUiState.GameOver(roomId = roomIdFinal, players = players)
                    _sideEffects.trySend(GameSideEffect.NavigateToResults(roomIdFinal))
                }

                // round:answer_locked — server confirmed answer was received
                "round:answer_locked" -> {
                    // no-op: local state already updated on submit
                }

                // room:state_sync — full room state snapshot
                "room:state_sync" -> {
                    applyRoomStateSync(payload)
                }

                "room:player_joined" -> {
                    val player = payload.optJSONObject("player")?.toPlayerUiModel()
                    if (player != null) {
                        updatePlayers { players -> mergePlayers(players, listOf(player)) }
                    }
                }

                "room:player_left" -> {
                    val playerId = payload.optString("playerId", "")
                    if (playerId.isNotBlank()) {
                        updatePlayers { players -> players.filterNot { it.id == playerId } }
                    }
                }

                // round:finale_started — last round announcement
                "round:finale_started" -> {
                    _sideEffects.trySend(GameSideEffect.CorrectAnswerRevealed)
                }

                // round:elimination — a player was eliminated mid-round
                "round:elimination" -> {
                    val eliminatedIds = payload.optStringArray("eliminatedPlayerIds").toSet()
                    val survivors = parsePlayersFromArray(payload.optJSONArray("survivors"))
                    val survivorIds = survivors.map { it.id }.toSet()

                    updatePlayers { players ->
                        val merged = mergePlayers(players, survivors)
                        merged.map { player ->
                            when {
                                player.id in survivorIds -> player.copy(isEliminated = false)
                                player.id in eliminatedIds -> player.copy(isEliminated = true)
                                else -> player
                            }
                        }
                    }

                    val localId = authRepository.currentUserId() ?: ""
                    if (localId in eliminatedIds) {
                        _sideEffects.trySend(GameSideEffect.PlayerEliminated)
                    }
                }

                "powerup:loot_drop" -> {
                    val powerupName = payload.optString("powerup", "")
                    val parsedType = runCatching { PowerupType.valueOf(powerupName) }.getOrNull()
                    if (parsedType != null) {
                        powerupInventory[parsedType] = (powerupInventory[parsedType] ?: 0) + 1
                        _sideEffects.trySend(GameSideEffect.ShowLootDrop(parsedType))
                        val current = _uiState.value
                        if (current is GameUiState.ActiveQuestion) {
                            _uiState.value = current.copy(ownedPowerups = buildOwnedPowerupList())
                        }
                    }
                }

                "error" -> {
                    val message = payload.optString("message", "Socket error")
                    val code = payload.optString("code", "")
                    _sideEffects.trySend(
                        GameSideEffect.ShowToast(
                            if (code.isBlank()) message else "$message ($code)"
                        )
                    )
                }
            }
        }.onFailure { /* swallow parse errors — bad envelope shouldn't crash the game */ }
    }

    // ── Countdown Timer ───────────────────────────────────────────────────────

    private fun startCountdown(initialSeconds: Int) {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            var remaining = initialSeconds
            while (remaining > 0) {
                delay(1_000L)
                remaining--
                val current = _uiState.value
                if (current is GameUiState.ActiveQuestion) {
                    _uiState.value = current.copy(timerSeconds = remaining)
                } else {
                    break // state changed (e.g. round ended), stop ticking
                }
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Builds the [OwnedPowerup] list from the current inventory + used-this-round state.
     * Shows ALL known [PowerupType] values so the tray always has the full set of slots.
     */
    private fun buildOwnedPowerupList(): List<OwnedPowerup> =
        PowerupType.entries.map { type ->
            OwnedPowerup(
                type = type,
                quantity = powerupInventory[type] ?: 0,
                usedThisRound = usedThisRound.contains(type),
            )
        }

    private fun parsePlayers(payload: JSONObject): List<PlayerUiModel> {
        val arr = payload.optJSONArray("players") ?: return emptyList()
        return parsePlayersFromArray(arr)
    }

    private fun parsePlayersFromArray(arr: JSONArray?): List<PlayerUiModel> {
        if (arr == null) return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                add(o.toPlayerUiModel())
            }
        }
    }

    private fun JSONObject.toPlayerUiModel(): PlayerUiModel =
        PlayerUiModel(
            id = optString("id", optString("playerId")),
            displayName = optString("displayName", optString("username", optString("playerId"))),
            score = optInt("score", optInt("totalScore", 0)),
            streak = optInt("streak", 0),
            isEliminated = optBoolean("isEliminated", false),
        )

    private fun applyRoomStateSync(payload: JSONObject) {
        val room = payload.optJSONObject("room") ?: payload
        val players = parsePlayers(room)
        val roomId = room.optString("roomId", payload.optString("roomId", currentRoomId()))
        val roomCode = room.optString("code", room.optString("roomCode", roomId))
        activeRoomCode = roomCode.takeIf { it.isNotBlank() } ?: activeRoomCode
        val phase = room.optString("phase", "")
        val nextPlayers = players.ifEmpty { currentPlayers() }

        _uiState.value = when (val current = _uiState.value) {
            is GameUiState.ActiveQuestion -> current.copy(
                roomId = roomId,
                players = nextPlayers,
                phaseLabel = phase.ifBlank { current.phaseLabel },
            )
            is GameUiState.RoundResult -> current.copy(
                roomId = roomId,
                players = nextPlayers,
            )
            is GameUiState.GameOver -> current.copy(
                roomId = roomId,
                players = nextPlayers,
            )
            is GameUiState.Lobby -> current.copy(
                roomCode = roomCode,
                players = nextPlayers,
            )
            GameUiState.Idle -> GameUiState.Lobby(
                roomCode = roomCode,
                players = nextPlayers,
            )
        }
    }

    private fun updatePlayers(transform: (List<PlayerUiModel>) -> List<PlayerUiModel>) {
        _uiState.value = when (val current = _uiState.value) {
            is GameUiState.ActiveQuestion -> current.copy(players = transform(current.players))
            is GameUiState.RoundResult -> current.copy(players = transform(current.players))
            is GameUiState.GameOver -> current.copy(players = transform(current.players))
            is GameUiState.Lobby -> current.copy(players = transform(current.players))
            GameUiState.Idle -> GameUiState.Lobby(players = transform(emptyList()))
        }
    }

    private fun mergePlayers(
        currentPlayers: List<PlayerUiModel>,
        nextPlayers: List<PlayerUiModel>,
    ): List<PlayerUiModel> {
        val playersById = linkedMapOf<String, PlayerUiModel>()
        currentPlayers.forEach { playersById[it.id] = it }
        nextPlayers.forEach { playersById[it.id] = it }
        return playersById.values.toList()
    }

    private fun currentPlayers(): List<PlayerUiModel> =
        when (val current = _uiState.value) {
            is GameUiState.ActiveQuestion -> current.players
            is GameUiState.RoundResult -> current.players
            is GameUiState.GameOver -> current.players
            is GameUiState.Lobby -> current.players
            GameUiState.Idle -> emptyList()
        }

    private fun currentRoomId(): String =
        when (val current = _uiState.value) {
            is GameUiState.ActiveQuestion -> current.roomId
            is GameUiState.RoundResult -> current.roomId
            is GameUiState.GameOver -> current.roomId
            is GameUiState.Lobby -> current.roomCode
            GameUiState.Idle -> ""
        }

    private fun JSONObject.optStringArray(name: String): List<String> {
        val arr = optJSONArray(name) ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val value = arr.optString(i)
                if (value.isNotBlank()) add(value)
            }
        }
    }

    /** Parses the `rankings` array from a `round:result` payload.
     *  Merges with current player list to preserve display names (backend omits them). */
    private fun parseRankings(payload: JSONObject): List<PlayerUiModel> {
        val arr = payload.optJSONArray("rankings") ?: return emptyList()
        val existing = currentPlayers().associateBy { it.id }
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val id = o.optString("playerId")
                val prev = existing[id]
                add(
                    PlayerUiModel(
                        id = id,
                        displayName = prev?.displayName ?: o.optString("displayName", id),
                        score = o.optInt("totalScore", prev?.score ?: 0),
                        streak = prev?.streak ?: 0,
                        isEliminated = prev?.isEliminated ?: false,
                    )
                )
            }
        }
    }

    /** Parses the `finalStandings` array from a `game:over` payload. */
    private fun parseFinalStandings(payload: JSONObject): List<PlayerUiModel> {
        val arr = payload.optJSONArray("finalStandings") ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                add(
                    PlayerUiModel(
                        id = o.optString("playerId"),
                        displayName = o.optString("displayName", o.optString("playerId")),
                        score = o.optInt("score", 0),
                        streak = 0,
                        isEliminated = false,
                        xpAwarded = o.optInt("xpAwarded", 0),
                    )
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
    }
}
