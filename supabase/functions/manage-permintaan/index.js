// supabase/functions/manage-permintaan/index.js
// Edge Function: Manajemen permintaan alat habis pakai
//
// GET    /manage-permintaan?status=menunggu           → list permintaan (admin/petugas)
// PUT    /manage-permintaan?id=:id                    → setujui/tolak/batalkan
//
// Body PUT setujui : { aksi: 'setujui', jumlah: number, catatan?: string }
// Body PUT tolak   : { aksi: 'tolak', alasan: string }
// Body PUT batalkan: { aksi: 'batalkan', catatan?: string } p

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url = new URL(req.url);
  const method = req.method;
  const id = url.searchParams.get("id");

  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin, profile } = auth;

  // Hanya admin & petugas
  if (!["admin", "petugas"].includes(profile.role)) {
    return json({ success: false, message: "Akses ditolak" }, 403);
  }

  const petugasName = profile.nama_lengkap ?? profile.username ?? null;

  try {
    // ── GET: list permintaan ──
    if (method === "GET") {
      const status = url.searchParams.get("status");

      let query = supabaseAdmin
        .from("permintaan_habis_pakai")
        .select("*, kartu_rfid(nama_pemegang)")
        .order("waktu_tap", { ascending: status === "menunggu" }); // menunggu -> terlama dulu

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return json({ success: true, data });
    }

    // ── PUT: Setujui, Tolak, atau Batalkan ──
    if (method === "PUT") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      const body = await req.json();
      const { aksi, jumlah, catatan, alasan } = body;

      if (aksi === "setujui") {
        const qty = Number(jumlah);
        if (!qty || qty <= 0 || !Number.isInteger(qty)) {
          return json({ success: false, error: "jumlah_tidak_valid", message: "Jumlah harus berupa angka bulat lebih dari 0" }, 400);
        }

        const { data, error } = await supabaseAdmin.rpc("setujui_permintaan_habis_pakai", {
          p_id: id,
          p_jumlah: qty,
          p_petugas: petugasName,
          p_catatan: catatan ?? null
        });

        if (error) throw error;
        if (!data.success) {
          return json({ success: false, error: data.error, message: `Gagal menyetujui: ${data.error}` }, 422);
        }

        return json({ success: true, message: "Permintaan berhasil disetujui" });
      }

      if (aksi === "tolak") {
        if (!alasan?.trim()) {
          return json({ success: false, message: "Alasan penolakan wajib diisi" }, 400);
        }

        const { data: existing, error: errExist } = await supabaseAdmin
          .from("permintaan_habis_pakai")
          .select("status")
          .eq("id", id)
          .maybeSingle();

        if (errExist || !existing) return json({ success: false, message: "Permintaan tidak ditemukan" }, 404);
        if (existing.status !== "menunggu") return json({ success: false, message: "Permintaan sudah diproses" }, 422);

        const { error: updateErr } = await supabaseAdmin
          .from("permintaan_habis_pakai")
          .update({
            status: "ditolak",
            alasan_tolak: alasan.trim(),
            petugas: petugasName,
            waktu_proses: new Date().toISOString()
          })
          .eq("id", id);

        if (updateErr) throw updateErr;
        return json({ success: true, message: "Permintaan ditolak" });
      }

      if (aksi === "batalkan") {
        if (profile.role !== "admin") {
          return json({ success: false, message: "Hanya admin yang dapat membatalkan persetujuan" }, 403);
        }

        const { data, error } = await supabaseAdmin.rpc("batalkan_permintaan_habis_pakai", {
          p_id: id,
          p_petugas: petugasName,
          p_catatan: catatan ?? null
        });

        if (error) throw error;
        if (!data.success) {
          return json({ success: false, error: data.error, message: `Gagal membatalkan: ${data.error}` }, 422);
        }

        return json({ success: true, message: "Permintaan berhasil dibatalkan dan stok dikembalikan" });
      }

      return json({ success: false, message: "Aksi tidak valid (gunakan setujui/tolak/batalkan)" }, 400);
    }

    return json({ success: false, message: "Method tidak diizinkan" }, 405);

  } catch (err) {
    console.error("manage-permintaan error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
