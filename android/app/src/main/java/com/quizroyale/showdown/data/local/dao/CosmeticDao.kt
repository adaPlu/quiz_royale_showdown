package com.quizroyale.showdown.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.quizroyale.showdown.data.local.entity.CosmeticEntity

@Dao
interface CosmeticDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(cosmetics: List<CosmeticEntity>)

    @Query("SELECT * FROM cosmetics WHERE isOwned = 1")
    suspend fun getOwned(): List<CosmeticEntity>

    @Query("SELECT * FROM cosmetics WHERE isEquipped = 1 LIMIT 1")
    suspend fun getEquipped(): CosmeticEntity?

    @Query("UPDATE cosmetics SET isEquipped = 0")
    suspend fun unequipAll()

    @Query("UPDATE cosmetics SET isEquipped = 1 WHERE id = :id")
    suspend fun equip(id: String)
}
