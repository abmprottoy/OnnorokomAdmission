<!--
  Author: Ammar Bin Mahmud <@abmprottoy>
  Project: Onnorokom School Admission Portal
-->

# Assumptions & Design Decisions

Where the specification left room for interpretation, the following pragmatic assumptions were made:

### 1. Multi-Process Concurrency Guarantee
- **How it is ensured:** Instead of relying on in-memory locks (`lock` or `SemaphoreSlim`), which only protect a single process, the backend uses **PostgreSQL Row-Level Pessimistic Locking (`SELECT * FROM classes WHERE id = @classId FOR UPDATE`)** inside an explicit database transaction (`BeginTransactionAsync`).
- **Why:** When two or more backend processes run on different ports sharing the same PostgreSQL database, PostgreSQL serializes transaction execution at the row level for the target `classId`. A second process attempting to hold a seat in the same class waits until the first transaction commits or rolls back, guaranteeing that `heldSeats + confirmedSeats` can never exceed `totalSeats`.

### 2. Student ID (`X-Student-Id`) Validation
- **Assumption:** `X-Student-Id` is validated as a 17-digit numeric string (`^\d{17}$`) without any special formatting. Missing or malformed headers return `400 Bad Request`.

### 3. Re-Applying After Hold Expiration or Cancellation
- **Assumption:** If a student's previous hold in a class transitions to `EXPIRED` or `CANCELLED`, they are allowed to apply again for that class if seats are available.

### 4. Cancelling Already Confirmed or Expired Holds
- **Assumption:** Only an active (`HELD`), non-expired application owned by the requesting student can be cancelled via `DELETE /holds/{holdId}`. Attempting to cancel an already `CONFIRMED` or `EXPIRED` application returns `409 Conflict`, while repeating `DELETE` on an already `CANCELLED` hold is treated idempotently and returns `204 No Content`.

### 5. Hybrid Hold Expiration (Background + Inline Evaluation)
- **Assumption:** To ensure seats return immediately when `HOLD_DURATION_SECONDS` elapses (even for short test durations like 1–2 seconds), expiration is handled both **eagerly** via a 1-second `BackgroundService` (`HoldExpirationWorker`) and **lazily** via inline atomic updates (`ExecuteUpdateAsync`) prior to read/write operations.
