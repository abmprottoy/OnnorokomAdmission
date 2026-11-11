/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Background HostedService that automatically expires overdue HELD seats every second.
 */

using Microsoft.EntityFrameworkCore;
using OnnorokomAdmission.Api.Data;
using OnnorokomAdmission.Api.Models;

namespace OnnorokomAdmission.Api.Services;

public class HoldExpirationWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HoldExpirationWorker> _logger;

    public HoldExpirationWorker(IServiceScopeFactory scopeFactory, ILogger<HoldExpirationWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AdmissionDbContext>();
                var now = DateTime.UtcNow;

                var expiredCount = await db.SeatHolds
                    .Where(h => h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
                    .ExecuteUpdateAsync(
                        setters => setters.SetProperty(h => h.Status, HoldStatuses.Expired),
                        stoppingToken);

                if (expiredCount > 0)
                {
                    _logger.LogInformation("Automatically expired {Count} overdue seat holds at {Now}.", expiredCount, now);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error while running background seat hold expiration check.");
            }
        }
    }
}