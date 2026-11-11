/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Automated Frontend UI tests (§1.6 Bonus) verifying rendering, localStorage persistence, and validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

describe('Onnorokom School Admission Portal UI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'c_abm_101',
          name: 'Class 6 - Morning Shift',
          totalSeats: 120,
          heldSeats: 15,
          confirmedSeats: 80,
          availableSeats: 25,
        },
      ],
    } as unknown as Response);
  });

  it('renders the portal header, evaluation notice, and persists 17-digit Student ID in localStorage', async () => {
    render(<App />);

    expect(screen.getByText(/Onnorokom School/i)).toBeInTheDocument();
    expect(screen.getByText(/Evaluation Build · For Assessment Only/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/20152691234567890/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '20152691234567890' } });

    expect(input.value).toBe('20152691234567890');
    expect(localStorage.getItem('onnorokom_admission_student_id')).toBe('20152691234567890');
  });

  it('shows user-friendly Bengali error if student tries to apply without a valid 17-digit Birth Registration ID', async () => {
    render(<App />);

    const applyButton = await screen.findByText('আবেদন করুন');
    fireEvent.click(applyButton);

    expect(
      await screen.findByText(/আবেদন করার পূর্বে উপরে ঘরটিতে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সঠিকভাবে লিখুন/i)
    ).toBeInTheDocument();
  });
});