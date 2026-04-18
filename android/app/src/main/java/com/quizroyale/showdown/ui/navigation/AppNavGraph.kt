package com.quizroyale.showdown.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.quizroyale.showdown.ui.game.GameScreen
import com.quizroyale.showdown.ui.game.GameViewModel
import com.quizroyale.showdown.ui.lobby.LobbyScreen
import com.quizroyale.showdown.ui.lobby.LobbyViewModel
import com.quizroyale.showdown.ui.screens.auth.LoginScreen
import com.quizroyale.showdown.ui.screens.auth.RegisterScreen
import com.quizroyale.showdown.ui.screens.home.HomeScreen
import com.quizroyale.showdown.ui.screens.results.ResultsScreen
import com.quizroyale.showdown.ui.screens.splash.SplashScreen

@Composable
fun AppNavGraph() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Screen.Splash.route) {

        composable(Screen.Splash.route) {
            SplashScreen(
                onNavigateToLogin = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                },
                onNavigateToHome = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                },
            )
        }

        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
                onNavigateToRegister = {
                    navController.navigate(Screen.Register.route)
                },
            )
        }

        composable(Screen.Register.route) {
            RegisterScreen(
                onRegisterSuccess = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
                onNavigateToLogin = {
                    navController.popBackStack()
                },
            )
        }

        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToLobby = { roomId ->
                    navController.navigate(Screen.Lobby.createRoute(roomId))
                },
                onNavigateToProfile = {
                    // Profile navigation placeholder
                },
            )
        }

        composable(
            route = Screen.Lobby.route,
            arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
            deepLinks = listOf(navDeepLink { uriPattern = "quizroyale://lobby?invite={roomId}" }),
        ) { backStackEntry ->
            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
            LobbyScreen(
                onJoinRoom = {
                    navController.navigate(Screen.Game.createRoute(roomId))
                },
            )
        }

        composable(
            route = Screen.Game.route,
            arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
            val viewModel: GameViewModel = hiltViewModel()
            val state by viewModel.uiStateFlow.collectAsState()
            GameScreen(
                state = state,
                onAnswerSelected = viewModel::submitAnswer,
            )
        }

        composable(
            route = Screen.Results.route,
            arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
        ) {
            ResultsScreen(
                onPlayAgain = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                },
                onHome = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Home.route) { inclusive = true }
                    }
                },
            )
        }
    }
}
