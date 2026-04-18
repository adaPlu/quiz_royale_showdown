package com.quizroyale.showdown.data.remote.model

sealed class WsEvent {
    data class RoomState(val payload: String) : WsEvent()
    data class CountdownStart(val payload: String) : WsEvent()
    data class Question(val payload: String) : WsEvent()
    data class AnswerLocked(val payload: String) : WsEvent()
    data class RoundResult(val payload: String) : WsEvent()
    data class PowerupUsed(val payload: String) : WsEvent()
    data class PowerupEffect(val payload: String) : WsEvent()
    data class GameOver(val payload: String) : WsEvent()
    data class LevelUp(val payload: String) : WsEvent()
    data class ServerError(val payload: String) : WsEvent()
    data class Unknown(val type: String, val payload: String) : WsEvent()
}
