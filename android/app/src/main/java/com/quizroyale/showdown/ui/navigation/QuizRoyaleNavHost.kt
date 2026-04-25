package com.quizroyale.showdown.ui.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.quizroyale.showdown.ui.game.GameScreen
import com.quizroyale.showdown.ui.game.GameUiState
import com.quizroyale.showdown.ui.game.GameViewModel
import com.quizroyale.showdown.ui.game.ResultsScreen
import com.quizroyale.showdown.ui.lobby.LobbyScreen
import com.quizroyale.showdown.ui.lobby.ROOM_REFERENCE_ARGUMENT
import com.quizroyale.showdown.ui.screens.auth.LoginScreen
import com.quizroyale.showdown.ui.screens.auth.RegisterScreen
import com.quizroyale.showdown.ui.screens.home.HomeScreen
import com.quizroyale.showdown.ui.screens.splash.SplashScreen

@Composable
fun QuizRoyaleNavHost() {
  val navController = rememberNavController()

  NavHost(
    navController = navController,
    startDestination = QuizRoyaleRoute.Splash.route
  ) {
    composable(QuizRoyaleRoute.Splash.route) {
      SplashScreen(
        onNavigateToLogin = {
          navController.navigateAndClearBackStack(QuizRoyaleRoute.Login.route)
        },
        onNavigateToHome = {
          navController.navigateAndClearBackStack(QuizRoyaleRoute.Home.route)
        }
      )
    }

    composable(QuizRoyaleRoute.Login.route) {
      LoginScreen(
        onLoginSuccess = {
          navController.navigateAndClearBackStack(QuizRoyaleRoute.Home.route)
        },
        onNavigateToRegister = {
          navController.navigate(QuizRoyaleRoute.Register.route)
        }
      )
    }

    composable(QuizRoyaleRoute.Register.route) {
      RegisterScreen(
        onRegisterSuccess = {
          navController.navigateAndClearBackStack(QuizRoyaleRoute.Home.route)
        },
        onNavigateToLogin = {
          navController.popBackStack()
        }
      )
    }

    composable(QuizRoyaleRoute.Home.route) {
      HomeScreen(
        onNavigateToLobby = { roomReference ->
          navController.navigate(QuizRoyaleRoute.Lobby.createRoute(roomReference))
        }
      )
    }

    composable(
      route = QuizRoyaleRoute.Lobby.route,
      arguments = listOf(
        navArgument(ROOM_REFERENCE_ARGUMENT) {
          type = NavType.StringType
          defaultValue = ""
        }
      )
    ) {
      LobbyScreen(
        onNavigateHome = {
          navController.navigateAndClearTop(QuizRoyaleRoute.Home.route)
        },
        onOpenGameplay = { roomCode ->
          val normalizedRoomCode = roomCode.trim().uppercase()
          if (normalizedRoomCode.isNotEmpty()) {
            navController.navigate(QuizRoyaleRoute.Game.createRoute(normalizedRoomCode))
          }
        }
      )
    }

    composable(
      route = QuizRoyaleRoute.Game.route,
      arguments = listOf(
        navArgument(QuizRoyaleRoute.Game.ROOM_CODE_ARG) {
          type = NavType.StringType
        }
      )
    ) { backStackEntry ->
      val roomCode = backStackEntry.arguments
        ?.getString(QuizRoyaleRoute.Game.ROOM_CODE_ARG)
        ?.trim()
        .orEmpty()
      val viewModel: GameViewModel = hiltViewModel()
      val state by viewModel.uiStateFlow.collectAsState()
      val isReconnecting by viewModel.isReconnecting.collectAsState()

      LaunchedEffect(roomCode) {
        if (roomCode.isNotEmpty()) {
          viewModel.joinRoom(roomCode)
        }
      }

      GameScreen(
        state = state,
        onAnswerSelected = viewModel::submitAnswer,
        sideEffects = viewModel.sideEffects,
        onIntent = viewModel::onIntent,
        isReconnecting = isReconnecting,
        onNavigateToResults = { roomId ->
          navController.navigate(QuizRoyaleRoute.Results.createRoute(roomId)) {
            popUpTo(QuizRoyaleRoute.Lobby.route) { inclusive = false }
          }
        },
      )
    }

    composable(
      route = QuizRoyaleRoute.Results.route,
      arguments = listOf(
        navArgument(QuizRoyaleRoute.Results.ROOM_CODE_ARG) {
          type = NavType.StringType
        }
      )
    ) { backStackEntry ->
      val roomCode = backStackEntry.arguments
        ?.getString(QuizRoyaleRoute.Results.ROOM_CODE_ARG)
        .orEmpty()

      // Reuse the GameViewModel from the Game back-stack entry so we keep the player list.
      val gameEntry = runCatching {
        navController.getBackStackEntry(QuizRoyaleRoute.Game.createRoute(roomCode))
      }.getOrNull()
      val viewModel: GameViewModel = if (gameEntry != null) {
        hiltViewModel(gameEntry)
      } else {
        hiltViewModel()
      }
      val state by viewModel.uiStateFlow.collectAsState()
      val players = when (state) {
        is GameUiState.GameOver  -> (state as GameUiState.GameOver).players
        is GameUiState.RoundResult -> (state as GameUiState.RoundResult).players
        else -> emptyList()
      }

      ResultsScreen(
        players = players,
        onPlayAgain = {
          navController.navigateAndClearBackStack(QuizRoyaleRoute.Home.route)
        },
        onHome = {
          navController.navigateAndClearBackStack(QuizRoyaleRoute.Home.route)
        },
      )
    }
  }
}

private sealed class QuizRoyaleRoute(val route: String) {
  data object Splash : QuizRoyaleRoute("splash")
  data object Login : QuizRoyaleRoute("login")
  data object Register : QuizRoyaleRoute("register")
  data object Home : QuizRoyaleRoute("home")
  data object Lobby : QuizRoyaleRoute("lobby?$ROOM_REFERENCE_ARGUMENT={$ROOM_REFERENCE_ARGUMENT}") {
    fun createRoute(roomReference: String? = null): String {
      if (roomReference.isNullOrBlank()) {
        return "lobby"
      }
      return "lobby?$ROOM_REFERENCE_ARGUMENT=${Uri.encode(roomReference)}"
    }
  }

  data object Game : QuizRoyaleRoute("game/{$ROOM_CODE_ARG}") {
    const val ROOM_CODE_ARG = ROOM_CODE_ARGUMENT

    fun createRoute(roomCode: String): String = "game/${Uri.encode(roomCode)}"
  }

  data object Results : QuizRoyaleRoute("results/{$ROOM_CODE_ARG}") {
    const val ROOM_CODE_ARG = ROOM_CODE_ARGUMENT

    fun createRoute(roomCode: String): String = "results/${Uri.encode(roomCode)}"
  }
}

private fun NavHostController.navigateAndClearBackStack(route: String) {
  navigate(route) {
    popUpTo(graph.id) {
      inclusive = true
    }
    launchSingleTop = true
  }
}

private fun NavHostController.navigateAndClearTop(route: String) {
  navigate(route) {
    popUpTo(route) {
      inclusive = true
    }
    launchSingleTop = true
  }
}

private const val ROOM_CODE_ARGUMENT = "roomCode"
