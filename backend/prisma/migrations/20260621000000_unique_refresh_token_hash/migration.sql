-- Enforce one stored row per refresh token hash so token consumption can be
-- guarded by an atomic delete/create rotation.
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
