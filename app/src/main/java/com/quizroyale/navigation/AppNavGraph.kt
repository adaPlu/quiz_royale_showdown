package com.quizroyale.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.quizroyale.ui.screens.EliminatedScreen
import com.quizroyale.ui.screens.HomeScreen
import com.quizroyale.ui.screens.LeaderboardsScreen
import com.quizroyale.ui.screens.LobbyScreen
import com.quizroyale.ui.screens.ProfileScreen
import com.quizroyale.ui.screens.QuestionScreen
import com.quizroyale.ui.screens.ResultsScreen
import com.quizroyale.ui.screens.SettingsScreen
import com.quizroyale.ui.screens.ShopScreen

@Composable
fun AppNavGraph() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Routes.Home.route
    ) {
        composable(Routes.Home.route) {
            HomeScreen(
                onQuickMatch = { navController.navigate(Routes.Lobby.route) },
                onProfile = { navController.navigate(Routes.Profile.route) },
                onLeaderboards = { navController.navigate(Routes.Leaderboards.route) },
                onShop = { navController.navigate(Routes.Shop.route) },
                onSettings = { navController.navigate(Routes.Settings.route) }
            )
        }

        composable(Routes.Lobby.route) {
            LobbyScreen(
                onBack = { navController.popBackStack() },
                onMatchReady = { navController.navigate(Routes.Question.route) }
            )
        }

        composable(Routes.Question.route) {
            QuestionScreen(
                onCorrectAnswer = { navController.navigate(Routes.Results.route) },
                onWrongAnswer = { navController.navigate(Routes.Eliminated.route) }
            )
        }

        composable(Routes.Eliminated.route) {
            EliminatedScreen(
                onSpectate = { navController.navigate(Routes.Results.route) },
                onReturnHome = {
                    navController.navigate(Routes.Home.route) {
                        popUpTo(Routes.Home.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.Results.route) {
            ResultsScreen(
                onPlayAgain = {
                    navController.navigate(Routes.Lobby.route) {
                        popUpTo(Routes.Home.route)
                    }
                },
                onReturnHome = {
                    navController.navigate(Routes.Home.route) {
                        popUpTo(Routes.Home.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.Profile.route) {
            ProfileScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.Leaderboards.route) {
            LeaderboardsScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.Shop.route) {
            ShopScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.Settings.route) {
            SettingsScreen(onBack = { navController.popBackStack() })
        }
    }
}