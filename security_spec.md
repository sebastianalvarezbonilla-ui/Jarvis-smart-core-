# Security Specification — Jarvis Smart Core Accounts

## 1. Data Invariants
1. Every document under `/users/{userId}` and its subcollections (`/private/*`, `/memories/*`, `/connectedApps/*`, `/messages/*`) strictly belongs to `userId` (`data.uid == userId == request.auth.uid`).
2. Only authenticated users with verified emails (`request.auth.token.email_verified == true`) can read or write their own account records.
3. PII (`email`) is isolated in `/users/{userId}/private/account` and never placed on `/users/{userId}` or subcollections.
4. All document IDs (`userId`, `memoryId`, `appId`, `messageId`) must pass `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
5. All string fields enforce explicit `.size()` bounds and enum fields enforce allowlists.
6. `createdAt` is immutable and must equal `request.time` at creation; `updatedAt` must equal `request.time` on updates.
7. Every update explicitly enumerates mutable fields via `incoming().diff(existing()).affectedKeys().hasOnly([...])`.

## 2. Adversarial "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated read**: `GET /users/alice/private/account` with `auth = null`.
2. **Unverified email write**: `CREATE /users/alice/memories/m1` with `email_verified: false`.
3. **Cross-user read**: User `bob` reads `/users/alice/private/preferences`.
4. **UID spoofing on create**: User `bob` writes `/users/bob/memories/m1` with `uid: "alice"`.
5. **Shadow field ("Ghost Field") injection**: Create `/users/alice` with extra `{ isAdmin: true }`.
6. **ID poisoning**: Create `/users/alice/memories/bad..slash` or a 500-char ID.
7. **Oversized string DoS**: Create `/users/alice/memories/m1` with 10,000-char `content`.
8. **Invalid enum injection**: Update `/users/alice/private/preferences` with `engineRoute: "hacked-mode"`.
9. **Client-forged timestamp**: Create `/users/alice/memories/m1` with client timestamp instead of `serverTimestamp()`.
10. **Immutable field tampering**: Update `/users/alice/memories/m1` attempting to alter `createdAt` or `uid`.
11. **Cross-user list scraping**: User `bob` runs `list` on `/users/alice/memories`.
12. **Catch-all collection probe**: Write to `/admins/bob` or `/secrets/test`.
