package com.quizroyale.showdown.ui.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quizroyale.showdown.data.game.FinalStanding
import com.quizroyale.showdown.data.game.GameEvent
import com.quizroyale.showdown.data.game.GameRepository
import com.quizroyale.showdown.data.game.RoomSnapshot
import com.quizroyale.showdown.data.game.ScoreRanking
import com.quizroyale.showdown.domain.model.GamePlayer
import com.quizroyale.showdown.domain.model.PowerupType
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

sealed class GameIntent {
  data class JoinRoom(val roomCode: String) : GameIntent()
  data class SubmitAnswer(val answerIndex: Int) : GameIntent()
  data class UsePowerup(val type: PowerupType, val targetPlayerId: String? = null) : GameIntent()
}

@HiltViewModel
class GameViewModel @Inject constructor(
  private val gameRepository: GameRepository
) : ViewModel() {
  private val _uiState = MutableStateFlow<GameUiState>(GameUiState.Idle)
  val uiState: GameUiState get() = _uiState.value
  val uiStateFlow: StateFlow<GameUiState> = _uiState.asStateFlow()

  private val _sideEffects = Channel<GameSideEffect>(Channel.BUFFERED)
  val sideEffects = _sideEffects.receiveAsFlow()

  private var timerJob: Job? = null
  private var heartbeatJob: Job? = null

  init {
    observeGameEvents()
  }

  fun onIntent(intent: GameIntent) {
    when (intent) {
      is GameIntent.JoinRoom -> joinRoom(intent.roomCode)
      is GameIntent.SubmitAnswer -> submitAnswer(intent.answerIndex)
      is GameIntent.UsePowerup -> usePowerup(intent.type, intent.targetPlayerId)
    }
  }

  fun joinRoom(roomCode: String) {
    val joined = gameRepository.joinRoom(roomCode)
    if (joined) {
      _uiState.value = GameUiState.Lobby(roomId = roomCode, roomCode = roomCode)
      startHeartbeat(roomCode)
    } else {
      _sideEffects.trySend(GameSideEffect.ShowToast("Sign in required before joining a room."))
    }
  }

  fun submitAnswer(answerIndex: Int) {
    val state = _uiState.value as? GameUiState.ActiveQuestion ?: return
    if (state.isAnswerLocked) return

    _uiState.value = state.copy(selectedAnswerIndex = answerIndex)
    gameRepository.submitAnswer(
      roomId = state.roomId,
      questionId = state.questionId,
      answerIndex = answerIndex
    )
  }

  fun usePowerup(type: PowerupType, targetPlayerId: String? = null) {
    val state = _uiState.value as? GameUiState.ActiveQuestion ?: return
    gameRepository.activatePowerup(
      roomId = state.roomId,
      powerUpId = type.name,
      targetPlayerId = targetPlayerId
    )
  }

  private fun observeGameEvents() {
    viewModelScope.launch {
      gameRepository.events.collect { event ->
        when (event) {
          is GameEvent.RoomState -> handleRoomState(event.room)
          is GameEvent.PlayerJoined -> updatePlayers(event.roomId) { players ->
            (players.filterNot { it.id == event.player.id } + event.player.toUiModel())
              .sortedByDescending { it.score }
          }
          is GameEvent.PlayerLeft -> updatePlayers(event.roomId) { players ->
            players.filterNot { it.id == event.playerId }
          }
          is GameEvent.CountdownStarted -> handleCountdown(event)
          is GameEvent.QuestionStarted -> handleQuestion(event)
          is GameEvent.AnswerLocked -> handleAnswerLocked(event)
          is GameEvent.RoundResult -> handleRoundResult(event)
          is GameEvent.RoundElimination -> handleElimination(event)
          is GameEvent.FinaleStarted -> handleFinale(event)
          is GameEvent.GameOver -> handleGameOver(event)
          is GameEvent.PowerupActivated -> {
            _sideEffects.trySend(GameSideEffect.PlayPowerup)
            _sideEffects.trySend(GameSideEffect.ShowToast("Power-up: ${event.powerupId}"))
          }
          is GameEvent.LootDrop -> {
            _sideEffects.trySend(GameSideEffect.ShowLootDrop(event.powerupCode))
          }
          is GameEvent.LevelUp -> {
            _sideEffects.trySend(GameSideEffect.ShowLevelUp(event.newLevel))
          }
          is GameEvent.ServerError -> _sideEffects.trySend(GameSideEffect.ShowToast(event.message))
        }
      }
    }
  }

  private fun handleRoomState(room: RoomSnapshot) {
    val players = room.players.map { it.toUiModel() }
    _uiState.value = GameUiState.Lobby(
      roomId = room.roomId,
      roomCode = room.code,
      players = players,
      phaseLabel = room.phase
    )
    if (room.roomId.isNotBlank()) {
      startHeartbeat(room.roomId)
    }
  }

  private fun handleCountdown(event: GameEvent.CountdownStarted) {
    timerJob?.cancel()
    _uiState.value = GameUiState.Countdown(
      roomId = event.roomId,
      seconds = event.seconds,
      players = currentPlayers()
    )
    startCountdown(event.seconds) { remaining ->
      val current = _uiState.value
      if (current is GameUiState.Countdown) {
        _uiState.value = current.copy(seconds = remaining)
      }
    }
  }

  private fun handleQuestion(event: GameEvent.QuestionStarted) {
    val remainingSeconds = remainingSeconds(event.startedAt, event.timeLimitMs)
    _uiState.value = GameUiState.ActiveQuestion(
      roomId = event.roomId,
      roundId = event.roundId,
      questionId = event.questionId,
      prompt = event.prompt,
      answers = event.answers,
      timeLimitMs = event.timeLimitMs,
      timerSeconds = remainingSeconds,
      players = currentPlayers(),
      phaseLabel = "QUESTION_ACTIVE"
    )
    startCountdown(remainingSeconds) { remaining ->
      val current = _uiState.value
      if (current is GameUiState.ActiveQuestion) {
        _uiState.value = current.copy(timerSeconds = remaining)
      }
    }
  }

  private fun handleAnswerLocked(event: GameEvent.AnswerLocked) {
    timerJob?.cancel()
    val current = _uiState.value
    if (current is GameUiState.ActiveQuestion && matchesRoom(current.roomId, event.roomId)) {
      _uiState.value = current.copy(isAnswerLocked = true, phaseLabel = "ANSWER_LOCKED")
      _sideEffects.trySend(GameSideEffect.HapticFeedback)
    }
  }

  private fun handleRoundResult(event: GameEvent.RoundResult) {
    timerJob?.cancel()
    val players = applyRankings(currentPlayers(), event.rankings)
    _uiState.value = GameUiState.RoundResult(
      roomId = event.roomId,
      summary = if (event.correctAnswerIndex >= 0) {
        "Correct answer: ${event.correctAnswerIndex + 1}"
      } else {
        "Round complete."
      },
      players = players,
      correctAnswerIndex = event.correctAnswerIndex.takeIf { it >= 0 }
    )
  }

  private fun handleElimination(event: GameEvent.RoundElimination) {
    val survivorsById = event.survivors.associateBy { it.id }
    val players = currentPlayers().map { player ->
      val survivor = survivorsById[player.id]?.toUiModel()
      survivor ?: player.copy(isEliminated = player.id in event.eliminatedPlayerIds)
    }
    _uiState.value = GameUiState.Elimination(
      roomId = event.roomId,
      eliminatedPlayerIds = event.eliminatedPlayerIds,
      players = players
    )
  }

  private fun handleFinale(event: GameEvent.FinaleStarted) {
    _uiState.value = GameUiState.Finale(
      roomId = event.roomId,
      finalistIds = event.finalistIds,
      players = currentPlayers()
    )
  }

  private fun handleGameOver(event: GameEvent.GameOver) {
    timerJob?.cancel()
    heartbeatJob?.cancel()
    val players = applyFinalStandings(currentPlayers(), event.finalStandings)
    _uiState.value = GameUiState.GameOver(
      roomId = event.roomId,
      winnerId = event.winnerId,
      players = players,
      xpAwarded = event.finalStandings.sumOf { it.xpAwarded }
    )
    _sideEffects.trySend(GameSideEffect.NavigateToResults(event.roomId))
  }

  private fun startCountdown(initialSeconds: Int, onTick: (Int) -> Unit) {
    timerJob?.cancel()
    timerJob = viewModelScope.launch {
      var remaining = initialSeconds
      while (remaining > 0) {
        delay(1_000L)
        remaining -= 1
        onTick(remaining)
      }
    }
  }

  private fun startHeartbeat(roomId: String) {
    if (heartbeatJob?.isActive == true) return
    heartbeatJob = viewModelScope.launch {
      while (true) {
        delay(30_000L)
        gameRepository.sendHeartbeat(roomId)
      }
    }
  }

  private fun updatePlayers(roomId: String, transform: (List<PlayerUiModel>) -> List<PlayerUiModel>) {
    val current = _uiState.value
    if (!matchesRoom(current.roomIdOrBlank(), roomId)) return

    _uiState.value = when (current) {
      is GameUiState.Lobby -> current.copy(players = transform(current.players))
      is GameUiState.Countdown -> current.copy(players = transform(current.players))
      is GameUiState.ActiveQuestion -> current.copy(players = transform(current.players))
      is GameUiState.RoundResult -> current.copy(players = transform(current.players))
      is GameUiState.Elimination -> current.copy(players = transform(current.players))
      is GameUiState.Finale -> current.copy(players = transform(current.players))
      is GameUiState.GameOver -> current.copy(players = transform(current.players))
      GameUiState.Idle -> current
    }
  }

  private fun currentPlayers(): List<PlayerUiModel> {
    return when (val state = _uiState.value) {
      is GameUiState.Lobby -> state.players
      is GameUiState.Countdown -> state.players
      is GameUiState.ActiveQuestion -> state.players
      is GameUiState.RoundResult -> state.players
      is GameUiState.Elimination -> state.players
      is GameUiState.Finale -> state.players
      is GameUiState.GameOver -> state.players
      GameUiState.Idle -> emptyList()
    }
  }

  private fun remainingSeconds(startedAt: String, timeLimitMs: Int): Int {
    val remainingMs = runCatching {
      val elapsedMs = Duration.between(Instant.parse(startedAt), Instant.now()).toMillis()
      timeLimitMs - elapsedMs
    }.getOrDefault(timeLimitMs.toLong())
    return ((remainingMs.coerceAtLeast(0L) + 999L) / 1_000L).toInt()
  }

  private fun applyRankings(
    players: List<PlayerUiModel>,
    rankings: List<ScoreRanking>
  ): List<PlayerUiModel> {
    val rankingsById = rankings.associateBy { it.playerId }
    val updated = players.map { player ->
      rankingsById[player.id]?.let { ranking -> player.copy(score = ranking.totalScore) } ?: player
    }
    val missing = rankings.filterNot { ranking -> updated.any { it.id == ranking.playerId } }
      .map { ranking ->
        PlayerUiModel(
          id = ranking.playerId,
          displayName = ranking.playerId.ifBlank { "Player" },
          score = ranking.totalScore,
          streak = 0,
          isEliminated = false
        )
      }
    return (updated + missing).sortedByDescending { it.score }
  }

  private fun applyFinalStandings(
    players: List<PlayerUiModel>,
    standings: List<FinalStanding>
  ): List<PlayerUiModel> {
    val standingById = standings.associateBy { it.playerId }
    val updated = players.map { player ->
      standingById[player.id]?.let { standing -> player.copy(score = standing.score) } ?: player
    }
    val missing = standings.filterNot { standing -> updated.any { it.id == standing.playerId } }
      .map { standing ->
        PlayerUiModel(
          id = standing.playerId,
          displayName = standing.playerId.ifBlank { "Player" },
          score = standing.score,
          streak = 0,
          isEliminated = false
        )
      }
    return (updated + missing).sortedByDescending { it.score }
  }

  private fun GamePlayer.toUiModel(): PlayerUiModel {
    return PlayerUiModel(
      id = id,
      displayName = displayName,
      score = score,
      streak = streak,
      isEliminated = isEliminated,
      avatarUrl = avatarUrl
    )
  }

  private fun GameUiState.roomIdOrBlank(): String {
    return when (this) {
      is GameUiState.Lobby -> roomId
      is GameUiState.Countdown -> roomId
      is GameUiState.ActiveQuestion -> roomId
      is GameUiState.RoundResult -> roomId
      is GameUiState.Elimination -> roomId
      is GameUiState.Finale -> roomId
      is GameUiState.GameOver -> roomId
      GameUiState.Idle -> ""
    }
  }

  private fun matchesRoom(currentRoomId: String, eventRoomId: String): Boolean {
    return currentRoomId.isBlank() || eventRoomId.isBlank() || currentRoomId == eventRoomId
  }

  override fun onCleared() {
    timerJob?.cancel()
    heartbeatJob?.cancel()
    super.onCleared()
  }
}
