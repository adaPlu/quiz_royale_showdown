package com.quizroyale.showdown.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.quizroyale.showdown.data.local.entity.GameCacheEntity

@Dao
interface GameCacheDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(game: GameCacheEntity)

    @Query("SELECT * FROM game_cache WHERE roomId = :roomId")
    suspend fun getByRoomId(roomId: String): GameCacheEntity?

    @Query("SELECT * FROM game_cache ORDER BY cachedAt DESC LIMIT 1")
    suspend fun getLatest(): GameCacheEntity?

    @Query("DELETE FROM game_cache WHERE roomId = :roomId")
    suspend fun deleteByRoomId(roomId: String)
}
