package com.quizroyale.showdown.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
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
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun gameCacheDao(): GameCacheDao
    abstract fun cosmeticDao(): CosmeticDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE game_cache ADD COLUMN powerupInventoryJson TEXT"
                )
            }
        }
    }
}
