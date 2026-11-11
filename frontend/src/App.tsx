/*
 * Author: Ammar Bin Mahmud <@abmprottoy>
 * Project: Onnorokom School Admission Portal
 * Description: Main Bilingual Admission Portal UI implementing screens and UI rules.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  GraduationCap,
  PlusCircle,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Layers,
  FileCheck2,
  ShieldAlert,
  CreditCard,
  Trash2,
} from 'lucide-react';

export interface ClassItem {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}

export interface HoldItem {
  holdId: string;
  classId: string;
  className?: string;
  studentId?: string;
  status: 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8080'
).replace(/\/+$/, '');

const STUDENT_ID_STORAGE_KEY = 'onnorokom_admission_student_id';

function translateErrorToBilingual(code?: string, fallbackMsg?: string, httpStatus?: number): string {
  switch (code) {
    case 'NO_SEATS_AVAILABLE':
      return 'দুঃখিত, এই ক্লাসে বর্তমানে কোনো আসন খালি নেই। (No seats available in this class.)';
    case 'DUPLICATE_APPLICATION':
      return 'এই ক্লাসে আপনার ইতিমধ্যে একটি চলমান আবেদন বা নিশ্চিত ভর্তি রয়েছে। (You already have an active hold or confirmed seat in this class.)';
    case 'HOLD_EXPIRED':
      return 'আবেদনের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে নতুন করে আবেদন করুন। (Application hold has expired.)';
    case 'INVALID_STUDENT_ID':
      return 'শিক্ষার্থীর জন্ম নিবন্ধন নম্বর অবশ্যই ১৭ অঙ্কের সংখ্যা হতে হবে। (Student Birth Registration Number must be exactly 17 digits.)';
    case 'INVALID_INPUT':
    case 'INVALID_JSON':
      return `ভুল তথ্য প্রদান করা হয়েছে: ${fallbackMsg || 'অনুগ্রহ করে সঠিক তথ্য দিন।'}`;
    case 'FORBIDDEN':
      return 'শুধুমাত্র নিজের আবেদন নিশ্চিত বা বাতিল করা যাবে। (You can only manage your own applications.)';
    case 'CLASS_NOT_FOUND':
      return 'নির্ধারিত ক্লাসটি খুঁজে পাওয়া যায়নি। (Class not found.)';
    case 'HOLD_NOT_FOUND':
      return 'আবেদনটি খুঁজে পাওয়া যায়নি। (Application hold not found.)';
    default:
      if (httpStatus === 409) {
        return fallbackMsg || 'আসন খালি নেই অথবা আবেদনটি ইতিমধ্যে প্রক্রিয়াধীন। (Conflict: Seat unavailable or duplicate hold.)';
      }
      return fallbackMsg || 'একটি ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন। (An error occurred.)';
  }
}

export default function App() {
  const [studentId, setStudentId] = useState<string>(() => {
    return localStorage.getItem(STUDENT_ID_STORAGE_KEY) || '';
  });

  const [activeTab, setActiveTab] = useState<'classes' | 'active-hold' | 'my-holds' | 'admin'>('classes');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [myHolds, setMyHolds] = useState<HoldItem[]>([]);
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);

  // Admin form state
  const [newClassName, setNewClassName] = useState('');
  const [newClassSeats, setNewClassSeats] = useState('120');
  const [isCreatingClass, setIsCreatingClass] = useState(false);

  // Status & feedback banners
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [serverOffline, setServerOffline] = useState<boolean>(false);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  // 1-second ticker for live countdowns & instant client-side expiration (Rule 9)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Persist Student ID in localStorage (Rule 11)
  const handleStudentIdChange = (val: string) => {
    const digitsOnly = val.replace(/\D/g, '').slice(0, 17);
    setStudentId(digitsOnly);
    localStorage.setItem(STUDENT_ID_STORAGE_KEY, digitsOnly);
    if (errorBanner) setErrorBanner(null);
  };

  const isStudentIdValid = /^\d{17}$/.test(studentId.trim());

  // Fetch all classes
  const fetchClasses = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/classes`);
      if (!res.ok) throw new Error('Failed to load classes');
      const data: ClassItem[] = await res.json();
      setClasses(data);
      setServerOffline(false);
    } catch {
      setServerOffline(true);
    }
  }, []);

  // Fetch current student's holds
  const fetchMyHolds = useCallback(async () => {
    if (!/^\d{17}$/.test(studentId.trim())) {
      setMyHolds([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/me/holds`, {
        headers: { 'X-Student-Id': studentId.trim() },
      });
      if (!res.ok) return;
      const data: HoldItem[] = await res.json();
      setMyHolds(data);
    } catch {
      // Handled by serverOffline state
    }
  }, [studentId]);

  // Initial load + automatic polling every 2.5 seconds without page reload (Rule 10)
  useEffect(() => {
    fetchClasses();
    fetchMyHolds();

    const poll = setInterval(() => {
      fetchClasses();
      fetchMyHolds();
    }, 2500);

    return () => clearInterval(poll);
  }, [fetchClasses, fetchMyHolds]);

  // Compute effective status of a hold (instant EXPIRED transition when timer hits 0 - Rule 9)
  const getEffectiveStatus = (hold: HoldItem): HoldItem['status'] => {
    if (hold.status === 'HELD') {
      const expiryTime = new Date(hold.expiresAt).getTime();
      if (expiryTime <= nowMs) {
        return 'EXPIRED';
      }
    }
    return hold.status;
  };

  const formatRemainingTime = (expiresAtIso: string): string => {
    const diffSec = Math.max(0, Math.floor((new Date(expiresAtIso).getTime() - nowMs) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 1. Admin: Create Class (POST /classes)
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSuccessBanner(null);

    const trimmedName = newClassName.trim();
    const seatsNum = Number(newClassSeats);

    if (!trimmedName) {
      setErrorBanner('Class-এর নাম ফাঁকা রাখা যাবে না। (Class name is required.)');
      return;
    }
    if (!Number.isInteger(seatsNum) || seatsNum <= 0) {
      setErrorBanner('আসন সংখ্যা অবশ্যই ০-এর বেশি পূর্ণসংখ্যা হতে হবে। (Total seats must be a positive integer.)');
      return;
    }

    setIsCreatingClass(true);
    try {
      const res = await fetch(`${API_BASE_URL}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, totalSeats: seatsNum }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorBanner(translateErrorToBilingual(err.error, err.message, res.status));
        return;
      }

      const created = await res.json();
      setNewClassName('');
      setNewClassSeats('120');
      setSuccessBanner(`নতুন Class "${created.name}" (${created.totalSeats} আসন) সফলভাবে তৈরি হয়েছে!`);
      await fetchClasses();
      setActiveTab('classes');
    } catch {
      setServerOffline(true);
      setErrorBanner('সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না। ব্যাকএন্ড চালু আছে কি না যাচাই করুন। (Server unreachable.)');
    } finally {
      setIsCreatingClass(false);
    }
  };

  // 2. Apply / Hold Seat (POST /classes/{classId}/holds)
  const handleApplyHold = async (cls: ClassItem) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!isStudentIdValid) {
      setErrorBanner(
        'আবেদন করার পূর্বে উপরে ঘরটিতে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর সঠিকভাবে লিখুন। (Please enter a valid 17-digit Birth Registration Number at the top.)'
      );
      return;
    }

    setLoadingActionId(cls.id);
    try {
      const res = await fetch(`${API_BASE_URL}/classes/${cls.id}/holds`, {
        method: 'POST',
        headers: { 'X-Student-Id': studentId.trim() },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorBanner(translateErrorToBilingual(err.error, err.message, res.status));
        await fetchClasses();
        return;
      }

      const createdHold: HoldItem = await res.json();
      setSelectedHoldId(createdHold.holdId);
      setSuccessBanner(
        `"${cls.name}"-এ আপনার আসন সাময়িকভাবে সংরক্ষিত (HELD) হয়েছে! নির্ধারিত সময়ের মধ্যে ভর্তি ফি জমা দিয়ে ভর্তি নিশ্চিত করুন।`
      );
      await Promise.all([fetchClasses(), fetchMyHolds()]);
      setActiveTab('active-hold');
    } catch {
      setServerOffline(true);
      setErrorBanner('সার্ভারের সাথে সংযোগ বিচ্ছিন্ন। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন। (Server connection failed.)');
    } finally {
      setLoadingActionId(null);
    }
  };

  // 3. Confirm Hold / Pay Fee (POST /holds/{holdId}/confirm)
  const handleConfirmHold = async (holdId: string) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!isStudentIdValid) {
      setErrorBanner('শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর প্রদান করুন।');
      return;
    }

    setLoadingActionId(holdId);
    try {
      const res = await fetch(`${API_BASE_URL}/holds/${holdId}/confirm`, {
        method: 'POST',
        headers: { 'X-Student-Id': studentId.trim() },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorBanner(translateErrorToBilingual(err.error, err.message, res.status));
        await Promise.all([fetchClasses(), fetchMyHolds()]);
        return;
      }

      setSuccessBanner('ভর্তি ফি সফলভাবে জমা হয়েছে এবং আপনার ভর্তি নিশ্চিত (CONFIRMED) করা হয়েছে!');
      await Promise.all([fetchClasses(), fetchMyHolds()]);
    } catch {
      setServerOffline(true);
      setErrorBanner('সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না। (Server connection error.)');
    } finally {
      setLoadingActionId(null);
    }
  };

  // 4. Cancel Hold (DELETE /holds/{holdId})
  const handleCancelHold = async (holdId: string) => {
    setErrorBanner(null);
    setSuccessBanner(null);

    if (!isStudentIdValid) {
      setErrorBanner('শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর প্রদান করুন।');
      return;
    }

    setLoadingActionId(holdId);
    try {
      const res = await fetch(`${API_BASE_URL}/holds/${holdId}`, {
        method: 'DELETE',
        headers: { 'X-Student-Id': studentId.trim() },
      });

      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        setErrorBanner(translateErrorToBilingual(err.error, err.message, res.status));
        await Promise.all([fetchClasses(), fetchMyHolds()]);
        return;
      }

      setSuccessBanner('আবেদনটি সফলভাবে বাতিল (CANCELLED) করা হয়েছে এবং আসনটি উন্মুক্ত করা হয়েছে।');
      await Promise.all([fetchClasses(), fetchMyHolds()]);
    } catch {
      setServerOffline(true);
      setErrorBanner('সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না। (Server connection error.)');
    } finally {
      setLoadingActionId(null);
    }
  };

  // Determine the focused hold for the "আবেদন (Active Application)" screen
  const focusedHold =
    myHolds.find((h) => h.holdId === selectedHoldId) ||
    myHolds.find((h) => getEffectiveStatus(h) === 'HELD') ||
    myHolds[0] ||
    null;

  const renderStatusBadge = (status: HoldItem['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 className="h-3.5 w-3.5" />
            CONFIRMED (নিশ্চিত)
          </span>
        );
      case 'HELD':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
            <Clock className="h-3.5 w-3.5 animate-pulse" />
            HELD (সংরক্ষিত)
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
            <AlertTriangle className="h-3.5 w-3.5" />
            EXPIRED (মেয়াদোত্তীর্ণ)
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
            <XCircle className="h-3.5 w-3.5" />
            CANCELLED (বাতিল)
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-slate-900">
      {/* Left Brand Sidebar (shadcn/ui customized navigation) */}
      <aside className="w-full md:w-72 bg-[#0C4160] text-white flex flex-col justify-between shrink-0 shadow-xl">
        <div>
          {/* Brand Header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-white/10 ring-1 ring-white/20">
                <GraduationCap className="h-6 w-6 text-sky-300" />
              </div>
              <div>
                <h1 className="font-bold text-base tracking-tight leading-snug">
                  Onnorokom School
                </h1>
                <p className="text-xs text-sky-200/90 font-bn">
                  অনলাইন ভর্তি পোর্টাল · Admission Portal
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Menu (§1.3 4 Screens) */}
          <nav className="p-4 space-y-1.5">
            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300/70">
              Admission Modules
            </div>

            <button
              onClick={() => setActiveTab('classes')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'classes'
                  ? 'bg-[#1B6CA8] text-white shadow-sm ring-1 ring-white/15'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5 font-bn">
                <Layers className="h-4 w-4" />
                Class তালিকা (Classes)
              </span>
              <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">
                {classes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('active-hold')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'active-hold'
                  ? 'bg-[#1B6CA8] text-white shadow-sm ring-1 ring-white/15'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5 font-bn">
                <Clock className="h-4 w-4" />
                আবেদন (Active Hold)
              </span>
              {myHolds.filter((h) => getEffectiveStatus(h) === 'HELD').length > 0 && (
                <span className="text-xs bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-full">
                  {myHolds.filter((h) => getEffectiveStatus(h) === 'HELD').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('my-holds')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'my-holds'
                  ? 'bg-[#1B6CA8] text-white shadow-sm ring-1 ring-white/15'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5 font-bn">
                <FileCheck2 className="h-4 w-4" />
                আমার আবেদন (My Holds)
              </span>
              <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">
                {myHolds.length}
              </span>
            </button>

            <div className="pt-3 pb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sky-300/70">
              Administration
            </div>

            <button
              onClick={() => setActiveTab('admin')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all font-bn ${
                activeTab === 'admin'
                  ? 'bg-[#1B6CA8] text-white shadow-sm ring-1 ring-white/15'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              <PlusCircle className="h-4 w-4" />
              Class তৈরি (School Admin)
            </button>
          </nav>
        </div>

        {/* Subtle Fine-Print Evaluation Notice at Bottom of Sidepanel */}
        <div className="p-4 border-t border-white/10 text-[11px] leading-relaxed text-sky-200/60 select-none">
          <p className="font-medium text-sky-100/75">
            Evaluation Build · For Assessment Only
          </p>
          <p className="mt-0.5">© Ammar Bin Mahmud</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Student Identity Header (§1.3 & Rule 11) */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <UserCheck className="h-5 w-5 text-[#0C4160]" />
              <div>
                <label
                  htmlFor="student-id-input"
                  className="block text-sm font-semibold text-slate-800 font-bn"
                >
                  শিক্ষার্থীর জন্ম নিবন্ধন নম্বর (১৭ অঙ্ক) · Student Birth Registration ID
                </label>
                <p className="text-xs text-slate-500 font-bn">
                  আবেদন ও ভর্তি নিশ্চিত করতে ১৭ সংখ্যার জন্ম নিবন্ধন নম্বর দিন (যেমন: 20152691234567890)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  id="student-id-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={17}
                  value={studentId}
                  onChange={(e) => handleStudentIdChange(e.target.value)}
                  placeholder="১৭ অঙ্কের নম্বর (e.g. 20152691234567890)"
                  className={`w-80 sm:w-96 rounded-lg border pl-3.5 pr-14 py-2 text-sm font-mono tracking-normal shadow-sm focus:outline-none focus:ring-2 ${
                    studentId.length === 0
                      ? 'border-slate-300 focus:border-[#0C4160] focus:ring-[#0C4160]/20'
                      : isStudentIdValid
                      ? 'border-emerald-500 bg-emerald-50/30 text-emerald-950 focus:ring-emerald-500/20'
                      : 'border-amber-500 bg-amber-50/30 text-amber-950 focus:ring-amber-500/20'
                  }`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-slate-500">
                  {studentId.length}/17
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleStudentIdChange('20152691234567890')}
                className="text-xs px-2.5 py-2 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-medium transition"
                title="Fill sample 17-digit Birth Registration ID"
              >
                Sample ID
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* Server Offline Alert (Rule 12) */}
          {serverOffline && (
            <div
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 flex items-start gap-3 shadow-sm"
            >
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm font-bn">
                <p className="font-semibold">
                  সার্ভার বন্ধ বা সংযোগ বিচ্ছিন্ন! (Backend Server Offline)
                </p>
                <p className="text-red-700 mt-0.5">
                  ব্যাকএন্ড সার্ভারের (`{API_BASE_URL}`) সাথে যোগাযোগ করা যাচ্ছে না। অনুগ্রহ করে নিশ্চিত করুন সার্ভার চালু আছে।
                </p>
              </div>
            </div>
          )}

          {/* User-Friendly Error Banner (Rule 12) */}
          {errorBanner && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex items-center gap-3 text-sm font-bn">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <span>{errorBanner}</span>
              </div>
              <button
                onClick={() => setErrorBanner(null)}
                className="text-xs font-semibold text-red-700 hover:underline shrink-0"
              >
                বন্ধ করুন
              </button>
            </div>
          )}

          {/* Success Banner */}
          {successBanner && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3 text-sm font-bn">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>{successBanner}</span>
              </div>
              <button
                onClick={() => setSuccessBanner(null)}
                className="text-xs font-semibold text-emerald-700 hover:underline shrink-0"
              >
                ঠিক আছে
              </button>
            </div>
          )}

          {/* ================================================================
              SCREEN 1: CLASS TALIQA (Class List & Seat Status)
             ================================================================ */}
          {activeTab === 'classes' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 font-bn">
                    Class তালিকা ও আসনের বর্তমান অবস্থা (Class & Shift Inventory)
                  </h2>
                  <p className="text-sm text-slate-500 font-bn">
                    আগে আবেদন করলে আগে পাবেন ভিত্তিতে আসন বরাদ্দ হয়। আসন সংখ্যা স্বয়ংক্রিয়ভাবে হালনাগাদ হচ্ছে।
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      fetchClasses();
                      fetchMyHolds();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C4160] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#082D44] font-bn"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    নতুন Class যোগ করুন
                  </button>
                </div>
              </div>

              {classes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
                  <Layers className="h-10 w-10 text-slate-400 mx-auto" />
                  <h3 className="text-base font-semibold text-slate-800 font-bn">
                    এখনো কোনো Class তৈরি করা হয়নি (No Classes Created Yet)
                  </h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto font-bn">
                    ভর্তি কার্যক্রম শুরু করার জন্য School Admin অংশে গিয়ে নতুন Class ও আসন সংখ্যা যোগ করুন।
                  </p>
                  <button
                    onClick={() => setActiveTab('admin')}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0C4160] px-4 py-2 text-sm font-semibold text-white hover:bg-[#082D44] font-bn"
                  >
                    <PlusCircle className="h-4 w-4" />
                    নতুন Class তৈরি করুন
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {classes.map((cls) => {
                    const existingHold = myHolds.find(
                      (h) =>
                        h.classId === cls.id &&
                        (getEffectiveStatus(h) === 'HELD' || getEffectiveStatus(h) === 'CONFIRMED')
                    );
                    const isFull = cls.availableSeats <= 0;
                    const occupancyPercent =
                      cls.totalSeats > 0
                        ? Math.min(
                            100,
                            Math.round(((cls.heldSeats + cls.confirmedSeats) / cls.totalSeats) * 100)
                          )
                        : 0;

                    return (
                      <div
                        key={cls.id}
                        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900">{cls.name}</h3>
                              <p className="text-xs font-mono text-slate-400">ID: {cls.id}</p>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold font-bn ${
                                isFull
                                  ? 'bg-red-50 text-red-700 ring-1 ring-red-600/20'
                                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                              }`}
                            >
                              {isFull ? 'আসন পূর্ণ (Full)' : `${cls.availableSeats}টি আসন খালি`}
                            </span>
                          </div>

                          {/* 4 Seat Counters required by §1.3 */}
                          <div className="grid grid-cols-4 gap-2 pt-1">
                            <div className="rounded-lg bg-slate-50 p-2.5 text-center border border-slate-100">
                              <p className="text-[11px] text-slate-500 font-bn">মোট (Total)</p>
                              <p className="text-lg font-bold text-slate-900">{cls.totalSeats}</p>
                            </div>
                            <div className="rounded-lg bg-amber-50/60 p-2.5 text-center border border-amber-100">
                              <p className="text-[11px] text-amber-800 font-bn">Hold-এ থাকা</p>
                              <p className="text-lg font-bold text-amber-700">{cls.heldSeats}</p>
                            </div>
                            <div className="rounded-lg bg-blue-50/60 p-2.5 text-center border border-blue-100">
                              <p className="text-[11px] text-blue-800 font-bn">নিশ্চিত (Confirmed)</p>
                              <p className="text-lg font-bold text-blue-700">{cls.confirmedSeats}</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50/60 p-2.5 text-center border border-emerald-100">
                              <p className="text-[11px] text-emerald-800 font-bn">খালি (Available)</p>
                              <p className="text-lg font-bold text-emerald-700">
                                {cls.availableSeats}
                              </p>
                            </div>
                          </div>

                          {/* Occupancy Progress Bar */}
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-[#0C4160] h-full transition-all duration-300"
                              style={{ width: `${occupancyPercent}%` }}
                            />
                          </div>
                        </div>

                        <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
                          {existingHold ? (
                            <div className="flex items-center justify-between w-full">
                              {renderStatusBadge(getEffectiveStatus(existingHold))}
                              <button
                                onClick={() => {
                                  setSelectedHoldId(existingHold.holdId);
                                  setActiveTab('active-hold');
                                }}
                                className="text-xs font-semibold text-[#0C4160] hover:underline font-bn"
                              >
                                আবেদনের বিস্তারিত দেখুন →
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isFull || loadingActionId === cls.id}
                              onClick={() => handleApplyHold(cls)}
                              className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition font-bn ${
                                isFull
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#0C4160] text-white hover:bg-[#082D44] shadow-sm'
                              }`}
                            >
                              {loadingActionId === cls.id
                                ? 'আবেদন প্রক্রিয়াধীন...'
                                : isFull
                                ? 'আসন খালি নেই (No Seats)'
                                : 'আবেদন করুন'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              SCREEN 2: ACTIVE APPLICATION (আবেদন - Status, Countdown, Pay/Cancel)
             ================================================================ */}
          {activeTab === 'active-hold' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-bn">
                  আবেদন ও ভর্তি ফি প্রদান (Application Status & Confirmation)
                </h2>
                <p className="text-sm text-slate-500 font-bn">
                  নির্ধারিত সময়ের মধ্যে "ভর্তি ফি দিন" বাটনে চাপলে আপনার ভর্তি নিশ্চিত (CONFIRMED) হবে।
                </p>
              </div>

              {!isStudentIdValid ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center space-y-2 font-bn">
                  <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
                  <p className="font-semibold text-amber-900">
                    অনুগ্রহ করে পেজের উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।
                  </p>
                </div>
              ) : !focusedHold ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3 font-bn">
                  <Clock className="h-10 w-10 text-slate-400 mx-auto" />
                  <h3 className="text-base font-semibold text-slate-800">
                    কোনো চলমান আবেদন পাওয়া যায়নি
                  </h3>
                  <p className="text-sm text-slate-500">
                    Class তালিকা থেকে আপনার পছন্দের Class ও Shift-এ "আবেদন করুন" বাটনে ক্লিক করুন।
                  </p>
                  <button
                    onClick={() => setActiveTab('classes')}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0C4160] px-4 py-2 text-sm font-semibold text-white hover:bg-[#082D44]"
                  >
                    Class তালিকায় যান
                  </button>
                </div>
              ) : (
                (() => {
                  const effectiveStatus = getEffectiveStatus(focusedHold);
                  const isHeld = effectiveStatus === 'HELD';
                  const remainingFormatted = formatRemainingTime(focusedHold.expiresAt);

                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 max-w-2xl">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                        <div>
                          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                            Application Hold Details
                          </span>
                          <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                            {focusedHold.className ||
                              classes.find((c) => c.id === focusedHold.classId)?.name ||
                              focusedHold.classId}
                          </h3>
                          <p className="text-xs font-mono text-slate-500 mt-1">
                            Hold ID: {focusedHold.holdId} · Student ID: {studentId}
                          </p>
                        </div>
                        {renderStatusBadge(effectiveStatus)}
                      </div>

                      {/* Countdown Timer Box (§1.3 & Rule 9) */}
                      <div
                        className={`rounded-xl p-5 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                          isHeld
                            ? 'bg-amber-50/70 border-amber-200'
                            : effectiveStatus === 'CONFIRMED'
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-red-50/60 border-red-200'
                        }`}
                      >
                        <div className="space-y-1 font-bn">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                            মেয়াদ শেষ হতে বাকি সময় (Remaining Hold Time)
                          </p>
                          {isHeld ? (
                            <p className="text-sm text-amber-900">
                              সময় শেষ হওয়ার আগেই ভর্তি ফি জমা দিন, অন্যথায় আসনটি স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
                            </p>
                          ) : effectiveStatus === 'CONFIRMED' ? (
                            <p className="text-sm text-emerald-900 font-medium">
                              অভিনন্দন! আপনার ভর্তি চূড়ান্তভাবে নিশ্চিত (CONFIRMED) হয়েছে।
                            </p>
                          ) : effectiveStatus === 'EXPIRED' ? (
                            <p className="text-sm text-red-800 font-medium">
                              নির্ধারিত সময়ের মধ্যে ফি জমা না দেওয়ায় আবেদনটি EXPIRED হয়ে গেছে এবং আসনটি ছেড়ে দেওয়া হয়েছে।
                            </p>
                          ) : (
                            <p className="text-sm text-slate-700 font-medium">
                              এই আবেদনটি বাতিল (CANCELLED) করা হয়েছে।
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono text-3xl font-bold tracking-tight text-slate-900">
                            {isHeld ? remainingFormatted : '00:00'}
                          </span>
                          <p className="text-[11px] text-slate-500">min : sec</p>
                        </div>
                      </div>

                      {/* Action Buttons: "ভর্তি ফি দিন" and "বাতিল" (§1.3 & Rule 9) */}
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={!isHeld || loadingActionId === focusedHold.holdId}
                          onClick={() => handleConfirmHold(focusedHold.holdId)}
                          className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition font-bn ${
                            isHeld
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <CreditCard className="h-4 w-4" />
                          ভর্তি ফি দিন
                        </button>

                        {isHeld && (
                          <button
                            type="button"
                            disabled={loadingActionId === focusedHold.holdId}
                            onClick={() => handleCancelHold(focusedHold.holdId)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition font-bn"
                          >
                            <Trash2 className="h-4 w-4" />
                            বাতিল
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ================================================================
              SCREEN 3: MY APPLICATIONS (আমার আবেদন - All Holds for Student)
             ================================================================ */}
          {activeTab === 'my-holds' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-bn">
                  আমার আবেদনসমূহ (My Applications)
                </h2>
                <p className="text-sm text-slate-500 font-bn">
                  বর্তমান শিক্ষার্থীর ({studentId || 'N/A'}) সকল আবেদনের তালিকা ও সর্বশেষ অবস্থা।
                </p>
              </div>

              {!isStudentIdValid ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center font-bn text-amber-900">
                  আবেদনের তালিকা দেখতে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।
                </div>
              ) : myHolds.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2 font-bn">
                  <p className="font-semibold text-slate-700">
                    এই জন্ম নিবন্ধন নম্বরে এখনো কোনো আবেদন পাওয়া যায়নি।
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bn">
                          <th className="py-3 px-4 font-semibold">Class ও Shift</th>
                          <th className="py-3 px-4 font-semibold">Hold ID</th>
                          <th className="py-3 px-4 font-semibold">অবস্থা (Status)</th>
                          <th className="py-3 px-4 font-semibold">বাকি সময় (Timer)</th>
                          <th className="py-3 px-4 font-semibold text-right">পদক্ষেপ (Actions)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {myHolds.map((hold) => {
                          const effectiveStatus = getEffectiveStatus(hold);
                          const isHeld = effectiveStatus === 'HELD';

                          return (
                            <tr key={hold.holdId} className="hover:bg-slate-50/80">
                              <td className="py-3.5 px-4 font-medium text-slate-900">
                                {hold.className || hold.classId}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                                {hold.holdId}
                              </td>
                              <td className="py-3.5 px-4">{renderStatusBadge(effectiveStatus)}</td>
                              <td className="py-3.5 px-4 font-mono text-sm">
                                {isHeld ? formatRemainingTime(hold.expiresAt) : '—'}
                              </td>
                              <td className="py-3.5 px-4 text-right space-x-2">
                                <button
                                  type="button"
                                  disabled={!isHeld || loadingActionId === hold.holdId}
                                  onClick={() => handleConfirmHold(hold.holdId)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-semibold font-bn ${
                                    isHeld
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  }`}
                                >
                                  ভর্তি ফি দিন
                                </button>
                                {isHeld && (
                                  <button
                                    type="button"
                                    disabled={loadingActionId === hold.holdId}
                                    onClick={() => handleCancelHold(hold.holdId)}
                                    className="px-3 py-1.5 rounded-md text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-bn"
                                  >
                                    বাতিল
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              SCREEN 4: SCHOOL ADMIN - CREATE CLASS (Class তৈরি)
             ================================================================ */}
          {activeTab === 'admin' && (
            <div className="max-w-xl space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-bn">
                  নতুন Class ও Shift তৈরি (School Admin)
                </h2>
                <p className="text-sm text-slate-500 font-bn">
                  প্রতিটি Shift আলাদা Class হিসেবে তৈরি করুন (যেমন: "Class 6 – Morning Shift" বা "Class 6 – Day Shift")।
                </p>
              </div>

              <form
                onSubmit={handleCreateClass}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="class-name-input"
                    className="block text-sm font-semibold text-slate-800 font-bn"
                  >
                    Class ও Shift-এর নাম (Class Name)
                  </label>
                  <input
                    id="class-name-input"
                    type="text"
                    required
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="e.g. Class 6 - Morning Shift"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#0C4160] focus:outline-none focus:ring-2 focus:ring-[#0C4160]/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="class-seats-input"
                    className="block text-sm font-semibold text-slate-800 font-bn"
                  >
                    মোট আসন সংখ্যা (Total Seats)
                  </label>
                  <input
                    id="class-seats-input"
                    type="number"
                    min={1}
                    max={10000}
                    required
                    value={newClassSeats}
                    onChange={(e) => setNewClassSeats(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-[#0C4160] focus:outline-none focus:ring-2 focus:ring-[#0C4160]/20"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCreatingClass}
                    className="w-full rounded-lg bg-[#0C4160] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#082D44] transition shadow-sm font-bn"
                  >
                    {isCreatingClass ? 'তৈরি হচ্ছে...' : 'নতুন Class তৈরি করুন'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}