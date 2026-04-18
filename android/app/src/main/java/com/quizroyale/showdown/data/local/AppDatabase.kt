package com.quizroyale.showdown.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.quizroyale.showdown.data.local.dao.CosmeticDao
import com.quizroyale.showdown.data.local.dao.GameCacheDao
import com.quizroyale.showdown.data.local.dao.UserDao
import com.quizroyale.showdown.data.local.entity.CosmeticEntity
import com.quizroyale.showdown.data.local.entity.GameCacheEntity
import com.quizroyale.showdown.data.local.entity.UserEntity

@Database(
    entities = [
        UserEntity::class,
        GameCacheEntity::class,
        CosmeticEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun gameCacheDao(): GameCacheDao
    abstract fun cosmeticDao(): CosmeticDao
}
