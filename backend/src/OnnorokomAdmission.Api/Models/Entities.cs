/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Core database entities for Classes (Shifts) and Seat Holds.
 */

using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace OnnorokomAdmission.Api.Models;

public static class HoldStatuses
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

[Table("classes")]
public class SchoolClass
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [Column("name")]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [Column("total_seats")]
    public int TotalSeats { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<SeatHold> Holds { get; set; } = new List<SeatHold>();
}

[Table("seat_holds")]
public class SeatHold
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = string.Empty;

    [Required]
    [Column("class_id")]
    [MaxLength(64)]
    public string ClassId { get; set; } = string.Empty;

    [ForeignKey(nameof(ClassId))]
    public SchoolClass? SchoolClass { get; set; }

    [Required]
    [Column("student_id")]
    [MaxLength(32)]
    public string StudentId { get; set; } = string.Empty;

    [Required]
    [Column("status")]
    [MaxLength(20)]
    public string Status { get; set; } = HoldStatuses.Held;

    [Required]
    [Column("expires_at")]
    public DateTime ExpiresAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}