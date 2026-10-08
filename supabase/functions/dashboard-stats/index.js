// supabase/functions/dashboard-stats/index.js
// Edge Function: Statistik dashboard (pinjaman aktif, total alat, chart harian)
//
// GET /dashboard-stats
//   ?days=7   → jumlah hari untuk chart (default 7, max 30)
//
// Response: {
//   success: true,
//   stats: {
//     total_alat: number,
//     alat_tersedia: number,
//     alat_dipinjam: number,
//     pinjaman_aktif: number,
//     transaksi_hari_ini: number,
//     kartu_aktif: number,
//     permintaan_menunggu: number,
//   },
//   chart: Array<{ tanggal: string, jumlah_pinjam: number, jumlah_kembali: number, total: number }>,
//   pinjaman_aktif: Array<...>,  // dari v_pinjaman_aktif
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  if (req.method !== "GET") {
    return json({ success: false, message: "Hanya GET yang diizinkan" }, 405);
  }

  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin } = auth;

  const url  = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 30);

  try {
    // Jalankan semua query secara paralel
    const [alatRes, kartuRes, pinjamanAktifRes, transaksiHariIniRes, permintaanMenungguRes, chartRes] = await Promise.all([
      // Total & status alat
      supabaseAdmin
        .from("v_list_barang")
        .select("id, status, tipe"),

      // Kartu aktif
      supabaseAdmin
        .from("kartu_rfid")
        .select("uid_kartu", { count: "exact", head: true })
        .eq("aktif", true),

      // Pinjaman aktif (detail untuk tabel)
      supabaseAdmin
        .from("v_pinjaman_aktif")
        .select("*")
        .order("waktu_pinjam", { ascending: false }),

      // Transaksi hari ini
      supabaseAdmin
        .from("transaksi")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),

      // Permintaan Menunggu
      supabaseAdmin
        .from("permintaan_habis_pakai")
        .select("id", { count: "exact", head: true })
        .eq("status", "menunggu"),

      // Chart: transaksi per hari (days hari terakhir)
      buildChartData(supabaseAdmin, days),
    ]);

    if (alatRes.error)          throw alatRes.error;
    if (pinjamanAktifRes.error) throw pinjamanAktifRes.error;

    const alatData = alatRes.data ?? [];
    const alatPinjamData = alatData.filter((a) => a.tipe !== "habis_pakai");

    const stats = {
      total_alat:          alatPinjamData.length,
      alat_tersedia:       alatPinjamData.filter((a) => a.status === "tersedia").length,
      alat_dipinjam:       alatPinjamData.filter((a) => a.status === "dipinjam").length,
      alat_habis:          alatPinjamData.filter((a) => a.status === "habis").length,
      pinjaman_aktif:      pinjamanAktifRes.data?.length ?? 0,
      transaksi_hari_ini:  transaksiHariIniRes.count ?? 0,
      kartu_aktif:         kartuRes.count ?? 0,
      permintaan_menunggu: permintaanMenungguRes.count ?? 0,
    };

    return json({
      success: true,
      stats,
      chart:          chartRes,
      pinjaman_aktif: pinjamanAktifRes.data ?? [],
    });

  } catch (err) {
    console.error("dashboard-stats error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});

/**
 * Bangun data chart harian.
 * Query transaksi_pinjam & kembali per tanggal selama `days` hari ke belakang.
 */
async function buildChartData(supabase, days) {
  const now      = new Date();
  const fromDate = new Date(now);
  fromDate.setDate(now.getDate() - (days - 1));
  fromDate.setHours(0, 0, 0, 0);

  const { data: transaksi } = await supabase
    .from("transaksi")
    .select("waktu_pinjam, waktu_kembali, status")
    .gte("waktu_pinjam", fromDate.toISOString())
    .order("waktu_pinjam", { ascending: true });

  const rows = transaksi ?? [];
  const chart = [];

  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);

    const jumlah_pinjam  = rows.filter((t) => t.waktu_pinjam?.startsWith(key)).length;
    const jumlah_kembali = rows.filter((t) => t.waktu_kembali?.startsWith(key)).length;

    chart.push({
      tanggal:       key,
      jumlah_pinjam,
      jumlah_kembali,
      total:         jumlah_pinjam + jumlah_kembali,
    });
  }

  return chart;
}
