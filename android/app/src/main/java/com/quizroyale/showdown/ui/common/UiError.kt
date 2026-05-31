package com.quizroyale.showdown.ui.common

import retrofit2.HttpException
import java.net.UnknownHostException

fun Throwable.toUiMessage(): String = when (this) {
    is HttpException -> when (code()) {
        401 -> "Session expired. Please log in again."
        403 -> "You don't have permission to do that."
        404 -> "Not found."
        409 -> "Conflict — this action cannot be completed."
        in 500..599 -> "Server error. Please try again later."
        else -> "Request failed (${code()})."
    }
    is UnknownHostException -> "No internet connection."
    else -> "Something went wrong. Please try again."
}
