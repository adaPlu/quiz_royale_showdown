package com.quizroyale.showdown.di

import android.content.Context
import androidx.room.Room
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.quizroyale.showdown.BuildConfig
import com.quizroyale.showdown.data.auth.AuthApi
import com.quizroyale.showdown.data.auth.TokenRefreshInterceptor
import com.quizroyale.showdown.data.game.GameApi
import com.quizroyale.showdown.data.local.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
  @Provides
  @Singleton
  fun provideJson(): Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
  }

  @Provides
  @Singleton
  @AuthOkHttpClient
  fun provideAuthOkHttp(): OkHttpClient {
    val logging = HttpLoggingInterceptor().apply {
      level = HttpLoggingInterceptor.Level.BASIC
    }
    return OkHttpClient.Builder()
      .addInterceptor(logging)
      .build()
  }

  @Provides
  @Singleton
  @ApiOkHttpClient
  fun provideApiOkHttp(tokenRefreshInterceptor: TokenRefreshInterceptor): OkHttpClient {
    val logging = HttpLoggingInterceptor().apply {
      level = HttpLoggingInterceptor.Level.BASIC
    }
    return OkHttpClient.Builder()
      .addInterceptor(tokenRefreshInterceptor)
      .addInterceptor(logging)
      .build()
  }

  @Provides
  @Singleton
  fun provideDefaultOkHttp(@ApiOkHttpClient okHttpClient: OkHttpClient): OkHttpClient = okHttpClient

  @Provides
  @Singleton
  @AuthRetrofit
  fun provideAuthRetrofit(@AuthOkHttpClient okHttpClient: OkHttpClient, json: Json): Retrofit {
    return Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(okHttpClient)
      .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
      .build()
  }

  @Provides
  @Singleton
  @ApiRetrofit
  fun provideApiRetrofit(@ApiOkHttpClient okHttpClient: OkHttpClient, json: Json): Retrofit {
    return Retrofit.Builder()
      .baseUrl(BuildConfig.API_BASE_URL)
      .client(okHttpClient)
      .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
      .build()
  }

  @Provides
  @Singleton
  fun provideRetrofit(@ApiRetrofit retrofit: Retrofit): Retrofit = retrofit

  @Provides
  @Singleton
  fun provideAuthApi(@AuthRetrofit retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

  @Provides
  @Singleton
  fun provideGameApi(@ApiRetrofit retrofit: Retrofit): GameApi = retrofit.create(GameApi::class.java)

  @Provides
  @Singleton
  fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
    return Room.databaseBuilder(context, AppDatabase::class.java, "quiz_royale.db").build()
  }
}
