import { useState } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import { IconCpu, IconSend, IconCode } from '@tabler/icons-react';

export default function SimulasiIotPage() {
  const [kartuList] = useState(() => {
    const kData = dbService.getKartu();
    if (Array.isArray(kData)) return kData;
    return Object.entries(kData).map(([uid_kartu, val]) => ({ uid_kartu, ...val }));
  });
  const [alatList] = useState(() => dbService.getAlat());
  const [selectedKartu, setSelectedKartu] = useState('');
  const [selectedAlat, setSelectedAlat] = useState('');
  const [resultMsg, setResultMsg] = useState(null);
  const [scannerMode, setScannerMode] = useState('1_SCANNER');

  const handleSimulateTap = (e) => {
    e.preventDefault();
    if (!selectedKartu || !selectedAlat) {
      alert('Pilih kartu kelas dan sticker alat terlebih dahulu.');
      return;
    }

    const res = dbService.simulateEsp32Tap(selectedKartu, selectedAlat);
    setResultMsg(res);
  };

  const codeConfigA = `// Konfigurasi A - 1 Scanner (Gantian Tap)
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define SS_PIN 5
#define RST_PIN 22
MFRC522 rfid(SS_PIN, RST_PIN);

String pendingKartuUID = "";
unsigned long pendingStartTime = 0;
const unsigned long WINDOW_TIMEOUT = 30000; // 30 detik

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  WiFi.begin("SSID", "PASSWORD");
}

void loop() {
  if (pendingKartuUID != "" && millis() - pendingStartTime > WINDOW_TIMEOUT) {
    pendingKartuUID = "";
    Serial.println("Timeout: Tap dibatalkan, ulangi dari kartu.");
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  if (pendingKartuUID == "") {
    pendingKartuUID = uid;
    pendingStartTime = millis();
    Serial.println("Kartu terbaca: " + uid + " (Menunggu tap alat...)");
    return;
  }

  // Tap kedua = Alat
  String uid_alat = uid;
  String uid_kartu = pendingKartuUID;
  pendingKartuUID = "";

  HTTPClient http;
  http.begin("https://api-simlab.web.app/api/tap");
  http.addHeader("Content-Type", "application/json");
  String payload = "{\\"uid_kartu\\":\\"" + uid_kartu + "\\",\\"uid_alat\\":\\"" + uid_alat + "\\"}";
  int httpResponseCode = http.POST(payload);
  if (httpResponseCode > 0) {
    Serial.println("Tap berhasil dikirim ke Cloud!");
  }
  http.end();
}`;

  const codeConfigB = `// Konfigurasi B - 2 Scanner Terpisah
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define SS_1 5   // Scanner Kartu
#define SS_2 4   // Scanner Alat
#define RST 22

MFRC522 rfid1(SS_1, RST);
MFRC522 rfid2(SS_2, RST);

void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid1.PCD_Init();
  rfid2.PCD_Init();
  WiFi.begin("SSID", "PASSWORD");
}

void loop() {
  String uidKartu = "";
  String uidAlat = "";

  if (rfid1.PICC_IsNewCardPresent() && rfid1.PICC_ReadCardSerial()) {
    for (byte i = 0; i < rfid1.uid.size; i++) uidKartu += String(rfid1.uid.uidByte[i], HEX);
    uidKartu.toUpperCase();
  }

  if (rfid2.PICC_IsNewCardPresent() && rfid2.PICC_ReadCardSerial()) {
    for (byte i = 0; i < rfid2.uid.size; i++) uidAlat += String(rfid2.uid.uidByte[i], HEX);
    uidAlat.toUpperCase();
  }

  if (uidKartu != "" && uidAlat != "") {
    HTTPClient http;
    http.begin("https://api-simlab.web.app/api/tap");
    http.addHeader("Content-Type", "application/json");
    String payload = "{\\"uid_kartu\\":\\"" + uidKartu + "\\",\\"uid_alat\\":\\"" + uidAlat + "\\"}";
    http.POST(payload);
    http.end();
  }
}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-main">Simulasi IoT ESP32 & Scanner RFID</h2>
        <p className="text-xs text-muted">Uji kirim payload kombinasi UID Kartu Kelas + UID Sticker Alat langsung ke sistem.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-main p-6 space-y-4 shadow-xs">
          <h3 className="font-semibold text-main text-sm flex items-center gap-2">
            <IconCpu size={18} className="text-blue-600" />
            Panel Trigger Tap RFID
          </h3>

          {resultMsg && (
            <div className={`p-4 rounded-lg text-xs ${resultMsg.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              <p className="font-bold">{resultMsg.success ? '✓ Tap Berhasil Dikirim ke tap_log' : '✗ Gagal: ' + resultMsg.error}</p>
              <p className="mt-1">{resultMsg.message || (resultMsg.data ? `Jenis Terdeteksi: ${resultMsg.data.jenis_terdeteksi} (${resultMsg.data.kelas} - ${resultMsg.data.nama_alat})` : '')}</p>
            </div>
          )}

          <form onSubmit={handleSimulateTap} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Pilih Kartu Perwakilan Kelas</label>
              <select
                value={selectedKartu}
                onChange={(e) => setSelectedKartu(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white font-mono"
              >
                <option value="">-- Pilih Kartu Kelas --</option>
                {kartuList.map(k => (
                  <option key={k.uid_kartu} value={k.uid_kartu}>{k.kelas} ({k.uid_kartu}) - {k.status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">Pilih Sticker RFID Alat</label>
              <select
                value={selectedAlat}
                onChange={(e) => setSelectedAlat(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white font-mono"
              >
                <option value="">-- Pilih Alat & Sticker --</option>
                {alatList.map(a => (
                  <option key={a.id_alat} value={a.uid_rfid}>{a.nama} (Sticker: {a.uid_rfid}) - {a.status}</option>
                ))}
              </select>
            </div>

            <Button type="submit" icon={IconSend} className="w-full justify-center">
              Kirim Sinyal Tap ESP32
            </Button>
          </form>
        </div>

        <div className="bg-surface rounded-xl border border-main p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-main text-sm flex items-center gap-2">
              <IconCode size={18} className="text-blue-600" />
              Referensi Kode Firmware ESP32
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScannerMode('1_SCANNER')}
                className={`text-xs px-2.5 py-1 rounded font-medium ${scannerMode === '1_SCANNER' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                1 Scanner
              </button>
              <button
                type="button"
                onClick={() => setScannerMode('2_SCANNER')}
                className={`text-xs px-2.5 py-1 rounded font-medium ${scannerMode === '2_SCANNER' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                2 Scanner
              </button>
            </div>
          </div>

          <pre className="p-4 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-lg overflow-x-auto max-h-[350px]">
            {scannerMode === '1_SCANNER' ? codeConfigA : codeConfigB}
          </pre>
        </div>
      </div>
    </div>
  );
}
