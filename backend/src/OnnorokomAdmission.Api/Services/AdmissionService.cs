/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Core concurrency-safe admission service implementing all 8 endpoints and business rules.
 */

using System.Data;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using OnnorokomAdmission.Api.Data;
using OnnorokomAdmission.Api.Models;

namespace OnnorokomAdmission.Api.Services;

public partial class AdmissionService
{
    private static readonly SemaphoreSlim FallbackLock = new(1, 1);
    private readonly AdmissionDbContext _db;
    private readonly AdmissionSettings _settings;

    public AdmissionService(AdmissionDbContext db, AdmissionSettings settings)
    {
        _db = db;
        _settings = settings;
    }

    [GeneratedRegex(@"^\d{17}$")]
    private static partial Regex StudentIdRegex();

    public static (bool IsValid, string CleanId, string ErrorMessage) ValidateStudentId(string? rawHeader)
    {
        if (string.IsNullOrWhiteSpace(rawHeader))
        {
            return (false, string.Empty, "X-Student-Id header is required.");
        }

        var trimmed = rawHeader.Trim();
        if (!StudentIdRegex().IsMatch(trimmed))
        {
            return (false, string.Empty, "Student Birth Registration Number must be exactly 17 digits.");
        }

        return (true, trimmed, string.Empty);
    }

    public static string FormatIsoUtc(DateTime dt)
    {
        var utc = dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ssZ");
    }

    public async Task ExpireOverdueHoldsInlineAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        if (_db.Database.IsRelational())
        {
            await _db.SeatHolds
                .Where(h => h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
                .ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, HoldStatuses.Expired), ct);
        }
        else
        {
            var overdue = await _db.SeatHolds
                .Where(h => h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
                .ToListAsync(ct);

            if (overdue.Count > 0)
            {
                foreach (var h in overdue) h.Status = HoldStatuses.Expired;
                await _db.SaveChangesAsync(ct);
            }
        }
    }

    // 1. POST /classes
    public async Task<(int StatusCode, object Body)> CreateClassAsync(CreateClassRequest? req, CancellationToken ct = default)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Name))
        {
            return (400, new ApiErrorResponse("INVALID_INPUT", "Class name is required."));
        }

        var cleanName = req.Name.Trim();
        if (cleanName.Length > 200)
        {
            return (400, new ApiErrorResponse("INVALID_INPUT", "Class name cannot exceed 200 characters."));
        }

        if (req.TotalSeats is null || req.TotalSeats <= 0 || req.TotalSeats > 100_000)
        {
            return (400, new ApiErrorResponse("INVALID_INPUT", "Total seats must be a positive integer."));
        }

        var schoolClass = new SchoolClass
        {
            Id = $"c_abm_{Guid.NewGuid():N}"[..14],
            Name = cleanName,
            TotalSeats = req.TotalSeats.Value,
            CreatedAt = DateTime.UtcNow
        };

        _db.Classes.Add(schoolClass);
        await _db.SaveChangesAsync(ct);

        return (201, new CreateClassResponse(schoolClass.Id, schoolClass.Name, schoolClass.TotalSeats));
    }

    // 2. GET /classes
    public async Task<List<ClassSeatStatusResponse>> GetAllClassesAsync(CancellationToken ct = default)
    {
        await ExpireOverdueHoldsInlineAsync(ct);
        var now = DateTime.UtcNow;

        var classes = await _db.Classes
            .AsNoTracking()
            .OrderBy(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.TotalSeats,
                HeldSeats = c.Holds.Count(h => h.Status == HoldStatuses.Held && h.ExpiresAt > now),
                ConfirmedSeats = c.Holds.Count(h => h.Status == HoldStatuses.Confirmed)
            })
            .ToListAsync(ct);

        return classes.Select(c =>
        {
            var available = Math.Max(0, c.TotalSeats - c.HeldSeats - c.ConfirmedSeats);
            return new ClassSeatStatusResponse(c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats, available);
        }).ToList();
    }

    // 3. GET /classes/{classId}
    public async Task<ClassSeatStatusResponse?> GetClassByIdAsync(string classId, CancellationToken ct = default)
    {
        await ExpireOverdueHoldsInlineAsync(ct);
        var now = DateTime.UtcNow;

        var c = await _db.Classes
            .AsNoTracking()
            .Where(x => x.Id == classId)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.TotalSeats,
                HeldSeats = x.Holds.Count(h => h.Status == HoldStatuses.Held && h.ExpiresAt > now),
                ConfirmedSeats = x.Holds.Count(h => h.Status == HoldStatuses.Confirmed)
            })
            .FirstOrDefaultAsync(ct);

        if (c is null) return null;

        var available = Math.Max(0, c.TotalSeats - c.HeldSeats - c.ConfirmedSeats);
        return new ClassSeatStatusResponse(c.Id, c.Name, c.TotalSeats, c.HeldSeats, c.ConfirmedSeats, available);
    }

    // 4. POST /classes/{classId}/holds
    public async Task<(int StatusCode, object Body)> CreateHoldAsync(string classId, string studentId, CancellationToken ct = default)
    {
        var isPostgres = _db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;

        if (!isPostgres)
        {
            await FallbackLock.WaitAsync(ct);
        }

        try
        {
            await using var transaction = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct)
                : null;

            SchoolClass? targetClass;
            if (isPostgres)
            {
                // PostgreSQL Pessimistic Row-Level Lock (SELECT ... FOR UPDATE)
                // Ensures strict serialization per class across multiple threads AND multiple backend processes
                targetClass = await _db.Classes
                    .FromSqlInterpolated($"SELECT * FROM classes WHERE id = {classId} FOR UPDATE")
                    .FirstOrDefaultAsync(ct);
            }
            else
            {
                targetClass = await _db.Classes.FirstOrDefaultAsync(c => c.Id == classId, ct);
            }

            if (targetClass is null)
            {
                return (404, new ApiErrorResponse("CLASS_NOT_FOUND", "Class not found."));
            }

            var now = DateTime.UtcNow;

            // Immediately expire any overdue holds for this class within the locked transaction
            if (_db.Database.IsRelational())
            {
                await _db.SeatHolds
                    .Where(h => h.ClassId == classId && h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
                    .ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, HoldStatuses.Expired), ct);
            }
            else
            {
                var overdue = await _db.SeatHolds
                    .Where(h => h.ClassId == classId && h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
                    .ToListAsync(ct);
                foreach (var h in overdue) h.Status = HoldStatuses.Expired;
                if (overdue.Count > 0) await _db.SaveChangesAsync(ct);
            }

            // Rule 3: A student cannot have more than one active HELD or CONFIRMED application in the same class
            var hasExistingActiveOrConfirmed = await _db.SeatHolds.AnyAsync(h =>
                h.ClassId == classId &&
                h.StudentId == studentId &&
                (h.Status == HoldStatuses.Confirmed || (h.Status == HoldStatuses.Held && h.ExpiresAt > now)), ct);

            if (hasExistingActiveOrConfirmed)
            {
                return (409, new ApiErrorResponse(
                    "DUPLICATE_APPLICATION",
                    "You already have an active hold or confirmed seat in this class."));
            }

            // Rule 1: held + confirmed must NEVER exceed totalSeats
            var occupiedSeats = await _db.SeatHolds.CountAsync(h =>
                h.ClassId == classId &&
                (h.Status == HoldStatuses.Confirmed || (h.Status == HoldStatuses.Held && h.ExpiresAt > now)), ct);

            if (occupiedSeats >= targetClass.TotalSeats)
            {
                return (409, new ApiErrorResponse(
                    "NO_SEATS_AVAILABLE",
                    "No seats available in this class."));
            }

            var hold = new SeatHold
            {
                Id = $"h_abm_{Guid.NewGuid():N}"[..14],
                ClassId = classId,
                StudentId = studentId,
                Status = HoldStatuses.Held,
                CreatedAt = now,
                ExpiresAt = now.AddSeconds(_settings.HoldDurationSeconds)
            };

            _db.SeatHolds.Add(hold);
            await _db.SaveChangesAsync(ct);

            if (transaction is not null)
            {
                await transaction.CommitAsync(ct);
            }

            return (201, new CreateHoldResponse(
                hold.Id,
                hold.ClassId,
                hold.StudentId,
                hold.Status,
                FormatIsoUtc(hold.ExpiresAt)));
        }
        finally
        {
            if (!isPostgres)
            {
                FallbackLock.Release();
            }
        }
    }

    // 5. GET /holds/{holdId}
    public async Task<GetHoldResponse?> GetHoldByIdAsync(string holdId, CancellationToken ct = default)
    {
        var hold = await _db.SeatHolds.FirstOrDefaultAsync(h => h.Id == holdId, ct);
        if (hold is null) return null;

        var now = DateTime.UtcNow;
        if (hold.Status == HoldStatuses.Held && hold.ExpiresAt <= now)
        {
            hold.Status = HoldStatuses.Expired;
            await _db.SaveChangesAsync(ct);
        }

        return new GetHoldResponse(
            hold.Id,
            hold.ClassId,
            hold.Status,
            FormatIsoUtc(hold.ExpiresAt));
    }

    // 6. POST /holds/{holdId}/confirm
    public async Task<(int StatusCode, object Body)> ConfirmHoldAsync(string holdId, string studentId, CancellationToken ct = default)
    {
        var isPostgres = _db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;
        if (!isPostgres)
        {
            await FallbackLock.WaitAsync(ct);
        }

        try
        {
            await using var transaction = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct)
                : null;

            SeatHold? hold;
            if (isPostgres)
            {
                hold = await _db.SeatHolds
                    .FromSqlInterpolated($"SELECT * FROM seat_holds WHERE id = {holdId} FOR UPDATE")
                    .FirstOrDefaultAsync(ct);
            }
            else
            {
                hold = await _db.SeatHolds.FirstOrDefaultAsync(h => h.Id == holdId, ct);
            }

            if (hold is null)
            {
                return (404, new ApiErrorResponse("HOLD_NOT_FOUND", "Hold application not found."));
            }

            // Rule 4: Only the student who owns the hold can confirm it
            if (!string.Equals(hold.StudentId, studentId, StringComparison.Ordinal))
            {
                return (403, new ApiErrorResponse("FORBIDDEN", "You can only confirm your own application."));
            }

            // Rule 5: Idempotency - if already CONFIRMED, return 200 OK without incrementing confirmedSeats again
            if (hold.Status == HoldStatuses.Confirmed)
            {
                return (200, new ConfirmHoldResponse(hold.Id, HoldStatuses.Confirmed));
            }

            var now = DateTime.UtcNow;
            if (hold.Status == HoldStatuses.Held && hold.ExpiresAt <= now)
            {
                hold.Status = HoldStatuses.Expired;
                await _db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);

                return (409, new ApiErrorResponse("HOLD_EXPIRED", "Hold has expired."));
            }

            if (hold.Status != HoldStatuses.Held)
            {
                return (409, new ApiErrorResponse(
                    "INVALID_HOLD_STATE",
                    $"Cannot confirm a hold in {hold.Status} status."));
            }

            hold.Status = HoldStatuses.Confirmed;
            await _db.SaveChangesAsync(ct);

            if (transaction is not null)
            {
                await transaction.CommitAsync(ct);
            }

            return (200, new ConfirmHoldResponse(hold.Id, HoldStatuses.Confirmed));
        }
        finally
        {
            if (!isPostgres)
            {
                FallbackLock.Release();
            }
        }
    }

    // 7. DELETE /holds/{holdId}
    public async Task<(int StatusCode, object? Body)> CancelHoldAsync(string holdId, string studentId, CancellationToken ct = default)
    {
        var isPostgres = _db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;
        if (!isPostgres)
        {
            await FallbackLock.WaitAsync(ct);
        }

        try
        {
            await using var transaction = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct)
                : null;

            SeatHold? hold;
            if (isPostgres)
            {
                hold = await _db.SeatHolds
                    .FromSqlInterpolated($"SELECT * FROM seat_holds WHERE id = {holdId} FOR UPDATE")
                    .FirstOrDefaultAsync(ct);
            }
            else
            {
                hold = await _db.SeatHolds.FirstOrDefaultAsync(h => h.Id == holdId, ct);
            }

            if (hold is null)
            {
                return (404, new ApiErrorResponse("HOLD_NOT_FOUND", "Hold application not found."));
            }

            if (!string.Equals(hold.StudentId, studentId, StringComparison.Ordinal))
            {
                return (403, new ApiErrorResponse("FORBIDDEN", "You can only cancel your own application."));
            }

            if (hold.Status == HoldStatuses.Cancelled)
            {
                return (204, null);
            }

            var now = DateTime.UtcNow;
            if (hold.Status == HoldStatuses.Held && hold.ExpiresAt <= now)
            {
                hold.Status = HoldStatuses.Expired;
                await _db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);

                return (409, new ApiErrorResponse("HOLD_EXPIRED", "Hold has already expired."));
            }

            if (hold.Status != HoldStatuses.Held)
            {
                return (409, new ApiErrorResponse(
                    "INVALID_HOLD_STATE",
                    $"Cannot cancel a hold with status {hold.Status}."));
            }

            hold.Status = HoldStatuses.Cancelled;
            await _db.SaveChangesAsync(ct);

            if (transaction is not null)
            {
                await transaction.CommitAsync(ct);
            }

            return (204, null);
        }
        finally
        {
            if (!isPostgres)
            {
                FallbackLock.Release();
            }
        }
    }

    // 8. GET /me/holds
    public async Task<List<MyHoldItemResponse>> GetStudentHoldsAsync(string studentId, CancellationToken ct = default)
    {
        await ExpireOverdueHoldsInlineAsync(ct);

        var holds = await _db.SeatHolds
            .AsNoTracking()
            .Include(h => h.SchoolClass)
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync(ct);

        return holds.Select(h => new MyHoldItemResponse(
            h.Id,
            h.ClassId,
            h.SchoolClass?.Name ?? string.Empty,
            h.Status,
            FormatIsoUtc(h.ExpiresAt)
        )).ToList();
    }
}