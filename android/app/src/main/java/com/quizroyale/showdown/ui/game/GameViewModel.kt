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

    /** Persistent inventory that survives across rounds; updated by loot drop events. */
    private val powerupInventory: PowerupInventory = mutableMapOf()

    /** Set of powerup types used in the current round — cleared on each new question. */
    private val usedThisRound: MutableSet<PowerupType> = mutableSetOf()

    init {
        observeWsEvents()
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
        webSocketManager.connect(BuildConfig.WS_BASE_URL, accessToken)
        webSocketManager.send(
            """{"type":"room:join","version":"v1","payload":{"roomCode":"$roomCode"}}"""
        )
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

    private fun handleRawEvent(raw: String) {
        runCatching {
            val envelope = JSONObject(raw)
            val type = envelope.optString("type")
            val payload = envelope.optJSONObject("payload") ?: JSONObject()
            val roomId = envelope.optString("roomId")

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
                    val players = parsePlayers(payload)

                    // Reset per-round used set for the new question
                    usedThisRound.clear()

                    _uiState.value = GameUiState.ActiveQuestion(
                        roomId = roomId.ifEmpty {
                            payload.optString("roomId", "")
                        },
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
                    val currentRoomId = roomId.ifEmpty {
                        (_uiState.value as? GameUiState.ActiveQuestion)?.roomId
                            ?: (_uiState.value as? GameUiState.RoundResult)?.roomId
                            ?: (_uiState.value as? GameUiState.Lobby)?.roomCode ?: ""
                    }
                    _uiState.value = GameUiState.Lobby(roomCode = currentRoomId)
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
                    val roomIdFinal = roomId.ifEmpty {
                        payload.optString("roomId",
                            (_uiState.value as? GameUiState.ActiveQuestion)?.roomId ?: "")
                    }
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
                    val roomIdFinal = roomId.ifEmpty {
                        payload.optString("roomId",
                            (_uiState.value as? GameUiState.ActiveQuestion)?.roomId
                                ?: (_uiState.value as? GameUiState.RoundResult)?.roomId ?: "")
                    }
                    _uiState.value = GameUiState.GameOver(roomId = roomIdFinal, players = players)
                    _sideEffects.trySend(GameSideEffect.NavigateToResults(roomIdFinal))
                }

                // round:answer_locked — server confirmed answer was received
                "round:answer_locked" -> {
                    // no-op: local state already updated on submit
                }

                // room:state_sync — full room state snapshot
                "room:state_sync" -> {
                    val players = parsePlayers(payload)
                    val current = _uiState.value
                    if (current is GameUiState.Lobby && players.isNotEmpty()) {
                        _uiState.value = current.copy()
                    }
                }

                // round:finale_started — last round announcement
                "round:finale_started" -> {
                    _sideEffects.trySend(GameSideEffect.CorrectAnswerRevealed)
                }

                // round:elimination — a player was eliminated mid-round
                "round:elimination" -> {
                    val eliminatedId = payload.optString("playerId", "")
                    val localId = authRepository.currentUserId() ?: ""
                    if (eliminatedId == localId) {
                        _sideEffects.trySend(GameSideEffect.PlayerEliminated)
                    }
                }

                // v1:powerup:loot_drop — player received a powerup from the server
                "v1:powerup:loot_drop" -> {
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

                // v1:round:reveal / v1:answer:reveal — correct answer was revealed
                "v1:round:reveal", "v1:answer:reveal" -> {
                    _sideEffects.trySend(GameSideEffect.CorrectAnswerRevealed)
                }

                // v1:player:levelup — level-up cosmetic event
                "v1:player:levelup" -> {
                    val newLevel = payload.optInt("newLevel", 0)
                    if (newLevel > 0) _sideEffects.trySend(GameSideEffect.ShowLevelUp(newLevel))
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
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                add(
                    PlayerUiModel(
                        id = o.optString("id"),
                        displayName = o.optString("displayName", o.optString("username")),
                        score = o.optInt("score", 0),
                        streak = o.optInt("streak", 0),
                        isEliminated = o.optBoolean("isEliminated", false),
                    )
                )
            }
        }
    }

    /** Parses the `rankings` array from a `round:result` payload. */
    private fun parseRankings(payload: JSONObject): List<PlayerUiModel> {
        val arr = payload.optJSONArray("rankings") ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                add(
                    PlayerUiModel(
                        id = o.optString("playerId"),
                        displayName = o.optString("displayName", o.optString("playerId")),
                        score = o.optInt("totalScore", o.optInt("scoreDelta", 0)),
                        streak = 0,
                        isEliminated = false,
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
                        isEliminated = o.optInt("rank", 1) > 1,
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
