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
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

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

    private var timerJob: Job? = null

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
            """{"type":"v1:room:join","roomId":"$roomCode","senderId":"${authRepository.currentUserId()}","ts":${System.currentTimeMillis()},"payload":{"roomCode":"$roomCode"}}"""
        )
        _uiState.value = GameUiState.Lobby(roomCode = roomCode)
    }

    /** Send a player answer over WebSocket. */
    fun submitAnswer(optionIndex: Int) {
        val state = _uiState.value as? GameUiState.ActiveQuestion ?: return
        // Mark locally so UI can reflect selection immediately
        _uiState.value = state.copy(selectedOptionIndex = optionIndex)
        webSocketManager.send(
            """{"type":"v1:player:answer","roomId":"${state.roomId}","senderId":"${authRepository.currentUserId()}","ts":${System.currentTimeMillis()},"payload":{"questionId":"${state.questionId}","optionIndex":$optionIndex}}"""
        )
    }

    /** Activate a powerup for the current user. */
    fun usePowerup(type: PowerupType) {
        val state = _uiState.value as? GameUiState.ActiveQuestion ?: return
        webSocketManager.send(
            """{"type":"v1:powerup:use","roomId":"${state.roomId}","senderId":"${authRepository.currentUserId()}","ts":${System.currentTimeMillis()},"payload":{"powerup":"${type.name}"}}"""
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

            when {
                // v1:round:question — server pushes a new question
                type == "v1:round:question" -> {
                    val questionId = payload.optString("questionId")
                    val roundId = payload.optString("roundId")
                    val prompt = payload.optString("prompt")
                    val timeLimitMs = payload.optInt("timeLimitMs", 20_000)
                    val optionsArray = payload.optJSONArray("options")
                    val answers = buildList {
                        if (optionsArray != null) {
                            for (i in 0 until optionsArray.length()) {
                                add(optionsArray.getJSONObject(i).optString("text", optionsArray.getString(i)))
                            }
                        }
                    }
                    val players = parsePlayers(payload)

                    _uiState.value = GameUiState.ActiveQuestion(
                        roomId = roomId,
                        roundId = roundId,
                        questionId = questionId,
                        prompt = prompt,
                        answers = answers,
                        timeLimitMs = timeLimitMs,
                        timerSeconds = timeLimitMs / 1_000,
                        players = players,
                        phaseLabel = "QUESTION_ACTIVE",
                    )
                    startCountdown(timeLimitMs / 1_000)
                }

                // v1:round:end — round finished, show leaderboard / eliminated markers
                type == "v1:round:end" -> {
                    timerJob?.cancel()
                    val summary = payload.optString("summary", "Round complete.")
                    val players = parsePlayers(payload)
                    val roomIdFinal = roomId.ifEmpty {
                        (_uiState.value as? GameUiState.ActiveQuestion)?.roomId ?: ""
                    }
                    _uiState.value = GameUiState.RoundResult(
                        roomId = roomIdFinal,
                        summary = summary,
                        players = players,
                    )
                }

                // v1:game:end — game over, navigate to Results
                type == "v1:game:end" -> {
                    timerJob?.cancel()
                    val players = parsePlayers(payload)
                    val roomIdFinal = roomId.ifEmpty {
                        (_uiState.value as? GameUiState.ActiveQuestion)?.roomId
                            ?: (_uiState.value as? GameUiState.RoundResult)?.roomId ?: ""
                    }
                    _uiState.value = GameUiState.GameOver(roomId = roomIdFinal, players = players)
                    _sideEffects.trySend(GameSideEffect.NavigateToResults(roomIdFinal))
                }

                // Legacy / alternate event name variants for compatibility
                type.contains("round:question") -> handleRawEvent(
                    raw.replace("\"type\":\"${type}\"", "\"type\":\"v1:round:question\"")
                )
                type.contains("round:result") || type.contains("round:end") -> handleRawEvent(
                    raw.replace("\"type\":\"${type}\"", "\"type\":\"v1:round:end\"")
                )
                type.contains("game:end") || type.contains("game:over") -> handleRawEvent(
                    raw.replace("\"type\":\"${type}\"", "\"type\":\"v1:game:end\"")
                )

                // Level-up cosmetic event
                type == "v1:player:levelup" -> {
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

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
    }
}
