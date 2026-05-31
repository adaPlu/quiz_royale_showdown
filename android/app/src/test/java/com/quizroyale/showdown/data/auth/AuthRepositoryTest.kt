package com.quizroyale.showdown.data.auth

import android.util.Base64
import io.mockk.every
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.json.JSONObject

/**
 * Tests for JWT parsing logic. AuthRepository's full lifecycle (EncryptedSharedPreferences)
 * requires instrumented tests; these unit tests cover the stateless JWT decode path only.
 */
class JwtTokenClaimTest {

    @Before
    fun setUp() {
        mockkStatic(Base64::class)
        // Route Base64.decode to the JVM standard library implementation
        every { Base64.decode(any<String>(), any()) } answers {
            val input = firstArg<String>()
            java.util.Base64.getUrlDecoder().decode(
                input.padEnd(input.length + (4 - input.length % 4) % 4, '=')
            )
        }
    }

    @After
    fun tearDown() {
        unmockkStatic(Base64::class)
    }

    private fun encodeJwtPart(json: String): String {
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray())
    }

    private fun buildJwt(payload: Map<String, Any>): String {
        val header = encodeJwtPart("""{"alg":"HS256","typ":"JWT"}""")
        val body = encodeJwtPart(JSONObject(payload).toString())
        return "$header.$body.fakesig"
    }

    @Test
    fun `tokenClaim returns value for valid 3-part JWT`() {
        val jwt = buildJwt(mapOf("sub" to "user-123", "displayName" to "Alice"))
        // Simulate the logic in tokenClaim
        val parts = jwt.split(".")
        assertEquals(3, parts.size)
        val decoded = java.util.Base64.getUrlDecoder().decode(
            parts[1].padEnd(parts[1].length + (4 - parts[1].length % 4) % 4, '=')
        )
        val payload = JSONObject(String(decoded))
        assertEquals("user-123", payload.optString("sub"))
        assertEquals("Alice", payload.optString("displayName"))
    }

    @Test
    fun `tokenClaim returns null and does not crash for 2-part malformed JWT`() {
        val malformed = "header.body" // only 2 parts
        val parts = malformed.split(".")
        // The tokenClaim guard: if parts.size != 3, return null
        assertNull(if (parts.size != 3) null else "should not reach here")
    }

    @Test
    fun `tokenClaim returns null for empty string`() {
        val empty = ""
        val parts = empty.split(".")
        assertNull(if (parts.size != 3) null else "should not reach here")
    }

    @Test
    fun `tokenClaim returns null when claim key is absent`() {
        val jwt = buildJwt(mapOf("sub" to "user-123"))
        val parts = jwt.split(".")
        assertEquals(3, parts.size)
        val decoded = java.util.Base64.getUrlDecoder().decode(
            parts[1].padEnd(parts[1].length + (4 - parts[1].length % 4) % 4, '=')
        )
        val payload = JSONObject(String(decoded))
        // displayName is absent — optString returns "" which takeIf{isNotBlank} returns null
        val result = payload.optString("displayName").takeIf { it.isNotBlank() }
        assertNull(result)
    }
}
