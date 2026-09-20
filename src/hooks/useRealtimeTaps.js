// src/hooks/useRealtimeTaps.js
// Hook untuk Realtime Card: subscribe tap_log, badge unread, toast notifikasi

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeTaps() {
  const [taps, setTaps]       = useState([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(true);

  // Muat data awal (50 tap terakhir + hitung unread)
  useEffect(() => {
    async function init() {
      setLoading(true);

      const [{ data: tapData }, { count }] = await Promise.all([
        supabase
          .from('tap_log')
          .select('*')
          .order('waktu_tap', { ascending: false })
          .limit(50),
        supabase
          .from('tap_log')
          .select('id', { count: 'exact', head: true })
          .eq('is_read', false),
      ]);

      setTaps(tapData ?? []);
      setUnread(count ?? 0);
      setLoading(false);
    }

    init();

    // Subscribe realtime INSERT ke tap_log
    const channel = supabase
      .channel('tap-log-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tap_log' },
        (payload) => {
          setTaps((prev) => [payload.new, ...prev].slice(0, 50));
          setUnread((n) => n + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Tandai semua tap sebagai sudah dibaca
  const markRead = useCallback(async () => {
    await supabase.rpc('mark_taps_read');
    setUnread(0);
    setTaps((prev) => prev.map((t) => ({ ...t, is_read: true })));
  }, []);

  return { taps, unread, loading, markRead };
}
