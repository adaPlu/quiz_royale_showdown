package com.quizroyale.navigation

sealed class Routes(val route: String) {
    data object Home : Routes("home")
    data object Lobby : Routes("lobby")
    data object Question : Routes("question")
    data object Eliminated : Routes("eliminated")
    data object Results : Routes("results")
    data object Profile : Routes("profile")
    data object Leaderboards : Routes("leaderboards")
    data object Shop : Routes("shop")
    data object Settings : Routes("settings")
}