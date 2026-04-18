package com.quizroyale.showdown.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cosmetics")
data class CosmeticEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val assetUrl: String,
    val isOwned: Boolean = false,
    val isEquipped: Boolean = false,
)
