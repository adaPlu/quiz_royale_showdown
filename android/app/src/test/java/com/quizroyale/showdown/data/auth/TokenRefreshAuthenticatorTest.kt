package com.quizroyale.showdown.data.auth

import io.mockk.*
import kotlinx.coroutines.test.runTest
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.*
import org.junit.Test

class TokenRefreshAuthenticatorTest {

    private val authRepository = mockk<AuthRepository>()
    private val authenticator = TokenRefreshAuthenticator(authRepository)

    // Helper: build a fake Response with a given request
    private fun fakeResponse(request: Request, code: Int = 401): Response = mockk {
        every { this@mockk.request } returns request
        every { this@mockk.code } returns code
    }

    private fun fakeRequest(withRetryHeader: Boolean = false): Request {
        val builder = Request.Builder().url("https://api.example.com/test")
        if (withRetryHeader) builder.header("X-Auth-Retry", "true")
        return builder.build()
    }

    @Test
    fun `returns null when X-Auth-Retry header is present (prevents infinite loop)`() {
        val response = fakeResponse(fakeRequest(withRetryHeader = true))
        val result = authenticator.authenticate(null, response)
        assertNull(result)
        verify { authRepository wasNot Called }
    }

    @Test
    fun `returns null when refreshIfPossible returns null (refresh failed)`() = runTest {
        coEvery { authRepository.refreshIfPossible() } returns null
        val response = fakeResponse(fakeRequest())
        val result = authenticator.authenticate(null, response)
        assertNull(result)
    }

    @Test
    fun `returns new request with refreshed token when refresh succeeds`() = runTest {
        val fakeTokens = mockk<AuthTokens> { every { accessToken } returns "new-access-token" }
        coEvery { authRepository.refreshIfPossible() } returns fakeTokens
        val response = fakeResponse(fakeRequest())
        val result = authenticator.authenticate(null, response)
        assertNotNull(result)
        assertEquals("Bearer new-access-token", result!!.header("Authorization"))
    }

    @Test
    fun `new request includes X-Auth-Retry header to prevent loops`() = runTest {
        val fakeTokens = mockk<AuthTokens> { every { accessToken } returns "tok" }
        coEvery { authRepository.refreshIfPossible() } returns fakeTokens
        val response = fakeResponse(fakeRequest())
        val result = authenticator.authenticate(null, response)
        assertNotNull(result!!.header("X-Auth-Retry"))
    }
}
