# AI Tool Usage Report

### 1. AI Tools Used & Scope
- **Tool:** Google AI Studio
- **Model:** Gemini 4 Argon
- **Parts Used:** Initial scaffolding of DTO contracts, React component layout styling (Tailwind / customized `shadcn/ui` patterns), and boilerplate test setup.

### 2. Where AI Made Mistakes & How I Caught and Fixed Them

#### Mistake 1: Shared `SqliteConnection` Contention in Automated Concurrency Tests
- **What AI did wrong:** In the `WebApplicationFactory` integration test setup, the initial code registered a single shared `SqliteConnection` instance (`options.UseSqlite(_connection)`) across all scoped `DbContext` instances, and checked `_db.Database.ProviderName` before acquiring the test synchronization lock.
- **How I caught it:** When running `dotnet test` on the 50-request parallel concurrency test (`ConcurrencyTest_50SimultaneousRequestsFor10Seats_Only10HoldsSucceed`), 12 of the 50 simultaneous requests failed with `Microsoft.Data.Sqlite.SqliteException (0x80004005): SQLite Error 5: 'unable to delete/modify user-function due to active statements'` at `SqliteRelationalConnection.InitializeDbConnection`.
- **How I fixed it:** I inspected the stack trace, replaced the shared `SqliteConnection` instance with a connection string (`options.UseSqlite(_connectionString)`) so each HTTP request scope receives its own `DbConnection` instance, and ensured the fallback test semaphore is acquired before touching `_db.Database` on non-Postgres providers while releasing it immediately when running on PostgreSQL (`SELECT ... FOR UPDATE`).

#### Mistake 2: Plaintext Fallback Database Credentials in Source Code
- **What AI did wrong:** The initial connection string helper included a hardcoded fallback string inside `Program.cs` and suggested adding connection credentials to `appsettings.Development.json`.
- **How I caught it:** During code review, I noticed that committing fallback passwords in `Program.cs` or tracked JSON configuration files violates clean secret management practices.
- **How I fixed it:** I removed all hardcoded connection strings from `Program.cs` and `appsettings*.json`, switched `AddDbContext` to lazy resolution via `(sp, options) => ...`, and injected `DATABASE_URL` strictly via runtime environment variables in `docker-compose.yml`.