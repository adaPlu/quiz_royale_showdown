package com.quizroyale.showdown.data.local

import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.RoomDatabase
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Entity(tableName = "cached_room_snapshot")
data class CachedRoomSnapshotEntity(
  @PrimaryKey val roomId: String,
  val code: String,
  val phase: String,
  val roundNumber: Int,
  val totalRounds: Int
)

@Entity(tableName = "cached_player")
data class CachedPlayerEntity(
  @PrimaryKey val id: String,
  val roomId: String,
  val displayName: String,
  val score: Int,
  val streak: Int,
  val isEliminated: Boolean
)

@Dao
interface CachedRoomDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsert(room: CachedRoomSnapshotEntity)

  @Query("SELECT * FROM cached_room_snapshot LIMIT 1")
  suspend fun latest(): CachedRoomSnapshotEntity?
}

@Dao
interface CachedPlayerDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAll(players: List<CachedPlayerEntity>)

  @Query("SELECT * FROM cached_player WHERE roomId = :roomId ORDER BY score DESC")
  suspend fun playersForRoom(roomId: String): List<CachedPlayerEntity>
}

@Database(
  entities = [CachedRoomSnapshotEntity::class, CachedPlayerEntity::class],
  version = 1,
  exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
  abstract fun cachedRoomDao(): CachedRoomDao
  abstract fun cachedPlayerDao(): CachedPlayerDao
}
