package com.quizroyale.showdown.ui.navigation

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.quizroyale.showdown.domain.model.PowerupType
import com.quizroyale.showdown.ui.game.GameIntent
import com.quizroyale.showdown.ui.game.GameScreen
import com.quizroyale.showdown.ui.game.GameSideEffect
import com.quizroyale.showdown.ui.game.GameUiState
import com.quizroyale.showdown.ui.game.GameViewModel
import com.quizroyale.showdown.ui.lobby.LobbyScreen
import com.quizroyale.showdown.ui.screens.cosmetics.CosmeticsScreen
import com.quizroyale.showdown.ui.screens.home.HomeScreen
import com.quizroyale.showdown.ui.screens.leaderboard.LeaderboardScreen
import com.quizroyale.showdown.ui.screens.friends.FriendsScreen
import com.quizroyale.showdown.ui.screens.profile.ProfileScreen
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
          navController.navigate(Screen.Profile.route)
        },
        onNavigateToLeaderboard = {
          navController.navigate(Screen.Leaderboard.route)
        },
      )
    }

    composable(
      route = Screen.Lobby.route,
      arguments = listOf(navArgument("roomId") { type = NavType.StringType }),
      deepLinks = listOf(navDeepLink { uriPattern = "quizroyale://lobby?invite={roomId}" })
    ) { backStackEntry ->
      val roomCode = backStackEntry.arguments?.getString("roomId").orEmpty()
      LobbyScreen(
        roomCode = roomCode,
        onGameStarted = { roomId ->
          navController.navigate(Screen.Game.createRoute(roomId))
        }
      )
    }

    composable(
      route = Screen.Game.route,
      arguments = listOf(navArgument("roomId") { type = NavType.StringType })
    ) { backStackEntry ->
      val roomCode = backStackEntry.arguments?.getString("roomId").orEmpty()
      val context = LocalContext.current
      val viewModel: GameViewModel = hiltViewModel()
      val state by viewModel.uiState.collectAsState()
      val snackbarHostState = remember { SnackbarHostState() }

      // Consume side effects
      LaunchedEffect(viewModel) {
        viewModel.sideEffects.collect { effect ->
          when (effect) {
            is GameSideEffect.ShowLevelUp ->
              snackbarHostState.showSnackbar("Level Up! You reached Level ${effect.newLevel} 🌟")
            is GameSideEffect.ShowToast ->
              snackbarHostState.showSnackbar(effect.message)
            is GameSideEffect.NavigateToResults ->
              navController.navigate(Screen.Results.createRoute(effect.roomId))
            is GameSideEffect.ShowLootDrop ->
              snackbarHostState.showSnackbar("You received a ${effect.powerupCode} power-up!")
            is GameSideEffect.HapticFeedback -> {
              val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
              } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
              }
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(50L, VibrationEffect.DEFAULT_AMPLITUDE))
              } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(50L)
              }
            }
            else -> Unit
          }
        }
      }


      LaunchedEffect(roomCode) {
        if (state is GameUiState.Idle && roomCode.isNotBlank()) {
          viewModel.joinRoom(roomCode)
        }
      }

      val isReconnecting by viewModel.isReconnecting.collectAsState()

      Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { _ ->
        GameScreen(
          state = state,
          onAnswerSelected = viewModel::submitAnswer,
          ownedPowerups = (state as? GameUiState.ActiveQuestion)?.ownedPowerups ?: emptyList(),
          onPowerupSelected = { code ->
            runCatching { PowerupType.valueOf(code) }.getOrNull()?.let { type ->
              viewModel.onIntent(GameIntent.UsePowerup(type))
            }
          },
          isReconnecting = isReconnecting,
        )
      }
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

    composable(Screen.Profile.route) {
      ProfileScreen(
        onNavigateBack = { navController.popBackStack() },
        onNavigateToCosmetics = { navController.navigate(Screen.Cosmetics.route) },
        onNavigateToFriends = { navController.navigate(Screen.Friends.route) }
      )
    }

    composable(Screen.Friends.route) {
      FriendsScreen(onNavigateBack = { navController.popBackStack() })
    }

    composable(Screen.Leaderboard.route) {
      LeaderboardScreen(onNavigateBack = { navController.popBackStack() })
    }

    composable(Screen.Cosmetics.route) {
      CosmeticsScreen(onNavigateBack = { navController.popBackStack() })
    }
  }
}
