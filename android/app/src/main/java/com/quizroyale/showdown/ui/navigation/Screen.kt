package com.quizroyale.showdown.ui.navigation

sealed class Screen(val route: String) {
    data object Home     : Screen("home")
    data object Lobby    : Screen("lobby/{roomId}") {
        fun createRoute(roomId: String) = "lobby/$roomId"
    }
    data object Game     : Screen("game/{roomId}") {
        fun createRoute(roomId: String) = "game/$roomId"
    }
    data object Results  : Screen("results/{roomId}") {
        fun createRoute(roomId: String) = "results/$roomId"
    }
}
