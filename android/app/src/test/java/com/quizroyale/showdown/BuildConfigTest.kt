package com.quizroyale.showdown

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BuildConfigTest {
  @Test
  fun apiBaseUrlIsRetrofitCompatible() {
    assertTrue(BuildConfig.API_BASE_URL.endsWith("/"))
  }

  @Test
  fun releaseBaseUrlsDoNotUseEmulatorCleartextDefaults() {
    if (BuildConfig.DEBUG) return

    assertTrue(BuildConfig.API_BASE_URL.startsWith("https://"))
    assertTrue(BuildConfig.WS_BASE_URL.startsWith("wss://"))
    assertFalse(BuildConfig.API_BASE_URL.contains("10.0.2.2"))
    assertFalse(BuildConfig.WS_BASE_URL.contains("10.0.2.2"))
    assertFalse(BuildConfig.API_BASE_URL.contains("localhost"))
    assertFalse(BuildConfig.WS_BASE_URL.contains("localhost"))
  }
}
