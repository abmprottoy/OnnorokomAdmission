/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Entity Framework Core DbContext with indexes for high-concurrency seat reservation.
 */

using Microsoft.EntityFrameworkCore;
using OnnorokomAdmission.Api.Models;

namespace OnnorokomAdmission.Api.Data;

public class AdmissionDbContext : DbContext
{
    public AdmissionDbContext(DbContextOptions<AdmissionDbContext> options) : base(options)
    {
    }

    public DbSet<SchoolClass> Classes => Set<SchoolClass>();
    public DbSet<SeatHold> SeatHolds => Set<SeatHold>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<SchoolClass>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Name).IsRequired().HasMaxLength(200);
            entity.Property(c => c.TotalSeats).IsRequired();
            entity.HasIndex(c => c.CreatedAt);
        });

        modelBuilder.Entity<SeatHold>(entity =>
        {
            entity.HasKey(h => h.Id);
            entity.HasOne(h => h.SchoolClass)
                  .WithMany(c => c.Holds)
                  .HasForeignKey(h => h.ClassId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(h => new { h.ClassId, h.Status, h.ExpiresAt });
            entity.HasIndex(h => new { h.ClassId, h.StudentId, h.Status });
            entity.HasIndex(h => new { h.StudentId, h.CreatedAt });
        });
    }
}