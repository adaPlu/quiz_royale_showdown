package com.quizroyale.showdown.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val email: String,
    val username: String,
    val level: Int = 1,
    val xp: Int = 0,
    val avatarUrl: String? = null,
)
