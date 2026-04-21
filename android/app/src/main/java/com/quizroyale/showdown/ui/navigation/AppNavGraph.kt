package com.quizroyale.showdown.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.quizroyale.showdown.ui.game.GameUiState
import com.quizroyale.showdown.ui.game.GameViewModel
import com.quizroyale.showdown.ui.lobby.LobbyScreen
import com.quizroyale.showdown.ui.screens.home.HomeScreen
import com.quizroyale.showdown.ui.screens.results.ResultsScreen

@Composable
fun AppNavGraph() {
  val navController = rememberNavController()

  NavHost(navController = navController, startDestination = Screen.Home.route) {
    composable(Screen.Home.route) {
      HomeScreen(
        onNavigateToLobby = { roomCode ->
          navController.navigate(Screen.Lobby.createRoute(roomCode))
        },
        onNavigateToProfile = {
          // Profile navigation placeholder.
        }
      )
    }

    composable(
      route = Screen.Lobby.route,
      arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
      deepLinks = listOf(navDeepLink { uriPattern = "quizroyale://lobby?invite={roomId}" })
    ) { backStackEntry ->
      val roomCode = backStackEntry.arguments?.getString("roomId").orEmpty()
      LobbyScreen(
        onJoinRoom = {
          navController.navigate(Screen.Game.createRoute(roomCode.ifBlank { it }))
        }
      )
    }

    composable(
      route = Screen.Game.route,
      arguments = listOf(navArgument("roomId") { type = NavType.StringType })
    ) { backStackEntry ->
      val roomCode = backStackEntry.arguments?.getString("roomId").orEmpty()
      val viewModel: GameViewModel = hiltViewModel()
      val state by viewModel.uiStateFlow.collectAsState()

      LaunchedEffect(roomCode, state) {
        if (state is GameUiState.Idle && roomCode.isNotBlank()) {
          viewModel.joinRoom(roomCode)
        }
      }

      GameScreen(
        state = state,
        onAnswerSelected = viewModel::submitAnswer,
        onPowerupSelected = viewModel::usePowerup,
        sideEffects = viewModel.sideEffects,
        onNavigateToResults = { roomId ->
          navController.navigate(Screen.Results.createRoute(roomId))
        }
      )
    }

    composable(
      route = Screen.Results.route,
      arguments = listOf(navArgument("roomId") { type = NavType.StringType })
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
        }
      )
    }
  }
}
