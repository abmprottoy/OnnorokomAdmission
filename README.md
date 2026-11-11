<!--
  Author: __AUTHOR_NAME__ <__AUTHOR_EMAIL__>
  Project: Onnorokom School Admission Portal
-->

# Onnorokom School Admission Portal

A high-concurrency, first-come-first-served online school admission and seat reservation system built with **.NET 8**, **PostgreSQL 16**, **React 18 (Vite + TypeScript)**, and **Docker**.

---

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/c789717e-41ab-488f-96a8-c14088e4fea0" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/e9236023-90bd-47bd-9e09-e329356c3353" />

## 1. Running the Application with Docker

Ensure **Docker** (and Docker Compose) is running on your machine. No other local dependencies are required.

From the repository root, run:

```bash
docker compose up --build
```

Once the containers start:
- **Frontend UI URL:** [http://localhost:5173](http://localhost:5173)
- **Backend API Base URL:** [http://localhost:8080](http://localhost:8080)
- **PostgreSQL Database:** `localhost:5432` (persisted via Docker volume `pgdata`)

To stop the containers while preserving database records:
```bash
docker compose down
```

---

## 2. Environment Variables Configuration

All runtime settings can be overridden via environment variables in `docker-compose.yml` or shell:

| Service | Variable Name | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Backend** | `DATABASE_URL` | `Host=db;Port=5432;Database=admission_db;Username=<user>;Password=<password>` | PostgreSQL connection string (supports both Npgsql key-value and `postgresql://` URI formats). Also supports `ConnectionStrings__DefaultConnection`. |
| **Backend** | `HOLD_DURATION_SECONDS` | `600` | Seat hold validity duration in seconds before automatic expiration. |
| **Frontend** | `VITE_API_BASE_URL` | `http://localhost:8080` | Target Backend API base URL called by the React UI. |

---

## 3. Running Automated Tests

### Backend Automated & Concurrency Tests (xUnit)
Includes 5 integration tests covering the **50-request simultaneous concurrency test**, hold expiration, idempotent confirmation, duplicate application prevention, and `4xx` input validation:

```bash
dotnet test backend/OnnorokomAdmission.sln
```

### Frontend Automated Tests (Vitest + React Testing Library — Bonus §1.6)
```bash
cd frontend
npm install
npm test
```

---

## 4. API Overview (§1.4)

| # | Method & Path | Header | Description |
| :--- | :--- | :--- | :--- |
| 1 | `POST /classes` | — | Create a new class/shift (`201 Created`) |
| 2 | `GET /classes` | — | List all classes with real-time seat counters (`200 OK`) |
| 3 | `GET /classes/{classId}` | — | Get seat status for a specific class (`200 OK`) |
| 4 | `POST /classes/{classId}/holds` | `X-Student-Id` | Place a temporary seat hold (`201 Created` / `409 Conflict`) |
| 5 | `GET /holds/{holdId}` | — | Get current status of a hold (`HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`) |
| 6 | `POST /holds/{holdId}/confirm` | `X-Student-Id` | Confirm fee payment & seat allocation (`200 OK`, idempotent) |
| 7 | `DELETE /holds/{holdId}` | `X-Student-Id` | Cancel an active hold (`204 No Content`) |
| 8 | `GET /me/holds` | `X-Student-Id` | List all holds belonging to the student (`200 OK`) |
