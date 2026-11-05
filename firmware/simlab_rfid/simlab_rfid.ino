/*
 * ================================================================
 *  SIMLAB SMK — Firmware Reader RFID Peminjaman Alat Lab
 * ================================================================
 *  Board   : ESP32 DevKit (ESP32 Dev Module)
 *  Modul   : MFRC522 RFID Reader, LCD 1602 I2C, Buzzer 5V
 *
 *  Alur:
 *    1. Tap KARTU KELAS  -> sesi kelas dimulai (tanpa mode PINJAM/KEMBALI)
 *    2. Tap TAG ALAT     -> backend menentukan pinjam / kembali / tolak
 *    3. Tap KARTU KELAS lagi -> sesi selesai
 *    Sesi otomatis habis 20 detik setelah tap terakhir.
 *    Setiap tap alat yang berhasil memperpanjang sesi 20 detik.
 *    Tap alat yang sama pada sesi aktif ditolak sebagai TAP DUPLIKAT.
 *
 *  Firmware TIDAK menentukan sendiri tindakan pinjam atau kembali.
 *  Seluruh keputusan dilakukan RPC process_rfid_tap di backend.
 *
 *  Setiap tap dikirim ke:
 *    POST {SUPABASE_URL}/functions/v1/rfid-tap   body: {"uid":"A1B2C3D4"}
 *  Respons backend memiliki field `success`, `code`, `action`, `message`,
 *  `alat`, `kelas`, dan `session`. LCD hanya menampilkan hasil dari respons
 *  tersebut; HTTP 200 belum tentu berarti transaksi berhasil.
 *
 *  WIRING (lihat juga firmware/README.md)
 *  ---------------------------------------------------------------
 *  MFRC522  -> ESP32        LCD I2C -> ESP32       Buzzer -> ESP32
 *  SDA(SS)  -> GPIO 5       SDA     -> GPIO 4      +  (I/O) -> GPIO 22
 *  SCK      -> GPIO 18      SCL     -> GPIO 21     -  (GND) -> GND
 *  MOSI     -> GPIO 23      VCC     -> VIN (5V)
 *  MISO     -> GPIO 19      GND     -> GND
 *  RST      -> GPIO 27
 *  3.3V     -> 3V3   (JANGAN ke 5V!)
 *  GND      -> GND
 *
 *  LIBRARY (Arduino IDE > Library Manager):
 *    - MFRC522            by GithubCommunity (miguelbalboa)
 *    - LiquidCrystal I2C  by Frank de Brabander
 *    - ArduinoJson        by Benoit Blanchon (versi 7.x)
 *  WiFi, HTTPClient, WiFiClientSecure sudah bawaan board ESP32.
 * ================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ================================================================
//  KONFIGURASI — WAJIB DIISI SEBELUM UPLOAD
// ================================================================
const char* WIFI_SSID         = "";
const char* WIFI_PASSWORD     = "";

// Sama dengan VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY di web
const char* SUPABASE_URL      = "";
const char* SUPABASE_ANON_KEY = "";

// Identitas alat (dikirim di header x-device-id / x-device-key)
const char* DEVICE_ID         = "";
const char* DEVICE_KEY        = "";

// ================================================================
//  PIN & PERANGKAT
// ================================================================
#define PIN_RFID_SS     5
#define PIN_RFID_RST    27
#define PIN_I2C_SDA     4
#define PIN_I2C_SCL     21
#define PIN_BUZZER      22

#define LCD_ADDRESS     0x27   // Jika LCD kosong, coba 0x3F
#define LCD_COLS        16
#define LCD_ROWS        2

// Buzzer aktif (bunyi sendiri saat diberi tegangan) = false
// Buzzer pasif (perlu frekuensi)                    = true
#define BUZZER_PASSIVE  false
// Sebagian modul buzzer aktif-LOW. Jika buzzer bunyi terus, ganti ke LOW.
#define BUZZER_ON_LEVEL LOW

// ================================================================
//  WAKTU
// ================================================================
const unsigned long SESSION_MS            = 20000; // = durasi sesi di RPC process_rfid_tap
const unsigned long SAME_TAG_COOLDOWN_MS  = 2500;  // abaikan tap kartu yg sama berulang
const unsigned long MESSAGE_MS            = 3000;  // lama pesan tampil di LCD
const unsigned long WIFI_RETRY_MS         = 10000;
const uint16_t      HTTP_TIMEOUT_MS       = 10000;

// ================================================================
//  OBJEK & STATE
// ================================================================
MFRC522           rfid(PIN_RFID_SS, PIN_RFID_RST);
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);

String        lastUid;
unsigned long lastUidAt     = 0;

bool          sessionActive = false;
String        sessionUid;              // UID kartu pemilik sesi
String        sessionNama;             // nama perwakilan / kelas
String        sessionKelas;            // kelas/angkatan
unsigned long sessionUntil  = 0;

unsigned long messageUntil  = 0;       // selama pesan tampil, layar idle tidak digambar
unsigned long idleDrawAt    = 0;
unsigned long wifiRetryAt   = 0;

String        scrollText;              // teks baris 2 yang terlalu panjang
unsigned int  scrollPos     = 0;
unsigned long scrollAt      = 0;

// ================================================================
//  PROTOTYPE
// ================================================================
void showMessage(const String& line1, const String& line2, unsigned long durationMs = MESSAGE_MS);
void beepOk();
void beepError();

// ================================================================
//  UTIL WAKTU (aman terhadap overflow millis)
// ================================================================
bool timeReached(unsigned long target) {
  return (long)(millis() - target) >= 0;
}

// ================================================================
//  LCD
// ================================================================
void lcdPrint(uint8_t row, const String& text) {
  String t = text;
  if (t.length() > LCD_COLS) t = t.substring(0, LCD_COLS);
  while (t.length() < LCD_COLS) t += ' ';
  lcd.setCursor(0, row);
  lcd.print(t);
}

void showMessage(const String& line1, const String& line2, unsigned long durationMs) {
  lcdPrint(0, line1);
  lcdPrint(1, line2);

  if (line2.length() > LCD_COLS) {
    scrollText = line2 + "   ";
    scrollPos  = 0;
    scrollAt   = millis() + 1000;  // jeda sebelum mulai bergeser
    unsigned long needed = 1000 + scrollText.length() * 350UL;
    if (needed > durationMs) durationMs = needed;
  } else {
    scrollText = "";
  }
  messageUntil = millis() + durationMs;
}

void updateScroll() {
  if (scrollText.length() == 0 || timeReached(messageUntil) || !timeReached(scrollAt)) return;
  scrollAt  = millis() + 350;
  scrollPos = (scrollPos + 1) % scrollText.length();
  String doubled = scrollText + scrollText;
  lcdPrint(1, doubled.substring(scrollPos, scrollPos + LCD_COLS));
}

void drawIdle() {
  if (WiFi.status() != WL_CONNECTED) {
    lcdPrint(0, "WiFi terputus");
    lcdPrint(1, "Menghubungkan..");
    return;
  }

  if (sessionActive) {
    long remaining = (long)(sessionUntil - millis());
    if (remaining <= 0) {
      sessionActive = false;
      sessionUid    = "";
      showMessage("Sesi berakhir", sessionKelas.length() ? sessionKelas : sessionNama, 2000);
      beepOk();
      return;
    }
    char line2[LCD_COLS + 1];
    snprintf(line2, sizeof(line2), "Sesi aktif %3lds",
             (remaining + 999) / 1000);
    lcdPrint(0, sessionKelas.length() ? sessionKelas : sessionNama);
    lcdPrint(1, line2);
  } else {
    lcdPrint(0, "SISPAS LAB");
    lcdPrint(1, "Tap kartu kelas");
  }
}

// ================================================================
//  BUZZER
// ================================================================
void buzz(unsigned int ms) {
#if BUZZER_PASSIVE
  tone(PIN_BUZZER, 2700);
  delay(ms);
  noTone(PIN_BUZZER);
#else
  digitalWrite(PIN_BUZZER, BUZZER_ON_LEVEL);
  delay(ms);
  digitalWrite(PIN_BUZZER, !BUZZER_ON_LEVEL);
#endif
}

void beepPattern(uint8_t count, unsigned int onMs, unsigned int offMs) {
  for (uint8_t i = 0; i < count; i++) {
    buzz(onMs);
    if (i < count - 1) delay(offMs);
  }
}

void beepClick()   { buzz(30); }                 // tag terbaca
void beepOk()      { beepPattern(1, 150, 0); }   // alat berhasil
void beepSession() { beepPattern(2, 90, 80); }   // sesi mulai / selesai
void beepError()   { beepPattern(3, 200, 100); } // ditolak / error

// ================================================================
//  WIFI
// ================================================================
void connectWiFi(unsigned long waitMs) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lcdPrint(0, "Konek WiFi...");
  lcdPrint(1, WIFI_SSID);
  Serial.printf("[WiFi] Menghubungkan ke %s", WIFI_SSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < waitMs) {
    delay(300);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Terhubung, IP: %s\n", WiFi.localIP().toString().c_str());
    showMessage("WiFi terhubung", WiFi.localIP().toString(), 2000);
    beepOk();
  } else {
    Serial.println("[WiFi] Gagal, akan dicoba ulang");
    showMessage("WiFi gagal", "Mencoba ulang..", 2000);
    beepError();
  }
  wifiRetryAt = millis() + WIFI_RETRY_MS;
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED || !timeReached(wifiRetryAt)) return;
  wifiRetryAt = millis() + WIFI_RETRY_MS;
  Serial.println("[WiFi] Reconnect...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ================================================================
//  RFID
// ================================================================
String readUid() {
  String uid;
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += '0';
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;  // contoh: "A1B2C3D4" (kartu) / "04A1B2C3D4E5F6" (stiker NTAG)
}

// ================================================================
//  HTTP -> Supabase Edge Function rfid-tap
// ================================================================
int sendTap(const String& uid, JsonDocument& response, bool& parsed) {
  parsed = false;
  response.clear();

  WiFiClientSecure client;
  client.setInsecure();  // tanpa verifikasi sertifikat (cukup untuk lab sekolah)

  HTTPClient http;
  String baseUrl = String(SUPABASE_URL);
  if (baseUrl.endsWith("/")) baseUrl.remove(baseUrl.length() - 1);
  String url = baseUrl + "/functions/v1/rfid-tap";
  if (!http.begin(client, url)) {
    Serial.println("[HTTP] Gagal memulai koneksi");
    return -1;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("x-device-id",   DEVICE_ID);
  http.addHeader("x-device-key",  DEVICE_KEY);

  JsonDocument body;
  body["uid"] = uid;
  String payload;
  serializeJson(body, payload);

  int code = http.POST(payload);
  String resp = code > 0 ? http.getString() : "";
  http.end();

  Serial.printf("[HTTP] %d %s\n", code, resp.c_str());

  if (code > 0 && resp.length() > 0) {
    DeserializationError err = deserializeJson(response, resp);
    if (err) {
      Serial.printf("[JSON] Gagal parse: %s\n", err.c_str());
      response.clear();
    } else {
      parsed = true;
    }
  }
  return code;
}

// ================================================================
//  TAMPILKAN HASIL KE LCD + BUZZER
// ================================================================
void handleResponse(int code, JsonDocument& r, bool parsed, const String& uid) {
  // ---------- GAGAL KONEKSI / RESPONS TIDAK VALID ----------
  if (code <= 0) {
    showMessage("KONEKSI GAGAL", "Coba kembali");
    beepError();
    return;
  }
  if (!parsed || !r.is<JsonObject>()) {
    showMessage("RESPON INVALID", "Coba kembali");
    beepError();
    return;
  }

  bool   success = r["success"] | false;
  String result  = r["code"]    | "";
  String message = r["message"] | "";
  String kelas   = r["kelas"]   | "";
  String alat    = r["alat"]["nama"] | "";

  Serial.printf("[TAP] success=%d code=%s\n", success ? 1 : 0, result.c_str());

  // ---------- BERHASIL (dikonfirmasi backend) ----------
  if (success) {
    if (result == "sesi_dimulai") {
      sessionActive = true;
      sessionUid    = uid;
      sessionKelas  = kelas;
      sessionNama   = String(r["session"]["nama_pemegang"] | "");
      if (sessionNama.length() == 0) sessionNama = kelas;
      sessionUntil  = millis() + SESSION_MS;
      showMessage(sessionKelas.length() ? sessionKelas : sessionNama, "Sesi aktif", 2000);
      beepSession();
      return;
    }

    if (result == "sesi_selesai") {
      sessionActive = false;
      sessionUid    = "";
      showMessage("SESI SELESAI", kelas.length() ? kelas : sessionNama);
      beepSession();
      return;
    }

    if (result == "dipinjam" || result == "dikembalikan" || result == "menunggu_persetujuan") {
      // Backend memperpanjang sesi 20 detik pada transaksi yang berhasil.
      sessionActive = true;
      sessionUntil  = millis() + SESSION_MS;

      // Sinkronkan identitas sesi dari respons backend (mis. setelah reboot).
      String sessUid = String(r["session"]["uid_kartu"] | "");
      if (sessUid.length() > 0) sessionUid = sessUid;
      String sessKelas = String(r["session"]["kelas"] | "");
      if (sessKelas.length() > 0) sessionKelas = sessKelas;

      if (result == "dipinjam") {
        showMessage("DIPINJAM", alat);
      } else if (result == "dikembalikan") {
        showMessage("DIKEMBALIKAN", alat);
      } else {
        showMessage("MENUNGGU ACC", alat);
      }
      beepOk();
      return;
    }

    // Kode sukses baru yang belum dikenal firmware: tetap tampilkan pesan
    // backend, jangan mengarang status pinjam/kembali.
    showMessage("BERHASIL", message.length() ? message : alat);
    beepOk();
    return;
  }

  // ---------- DITOLAK / ERROR BISNIS ----------
  if (result == "sesi_tidak_aktif") {
    sessionActive = false;
    sessionUid    = "";
    showMessage("SESI TIDAK AKTIF", "Tap kartu kelas");
  } else if (result == "tap_duplikat") {
    showMessage("TAP DUPLIKAT", "Sudah diproses");
  } else if (result == "sedang_dipinjam") {
    showMessage("SEDANG DIPINJAM", "Tidak dapat diproses");
  } else if (result == "tag_tidak_dikenal") {
    showMessage("TAG TIDAK DIKENAL", uid, 5000);
  } else if (result == "kartu_nonaktif") {
    // Kartu nonaktif hanya mengakhiri sesi jika kartu itu pemilik sesi
    // (tap kartu) atau jika penolakan berasal dari tap alat (backend
    // sudah menghapus sesi pemiliknya).
    if (alat.length() > 0 || uid == sessionUid) {
      sessionActive = false;
      sessionUid    = "";
    }
    showMessage("KARTU NONAKTIF", "Hubungi petugas");
  } else if (result == "stok_habis") {
    showMessage("STOK HABIS", "Tidak tersedia");
  } else if (result == "sesi_kartu_lain_aktif") {
    String aktif = String(r["session"]["kelas"] | "");
    if (aktif.length() == 0) aktif = String(r["session"]["nama_pemegang"] | "");
    if (aktif.length() == 0) aktif = "Kelas lain";
    showMessage("SESI LAIN AKTIF", aktif, 4000);
  } else if (result == "permintaan_sudah_ada") {
    showMessage("SEDANG MENUNGGU", "ACC Petugas", 4000);
  } else if (result == "payload_tidak_lengkap") {
    showMessage("DATA TIDAK LENGKAP", "UID kosong");
  } else if (result == "device_tidak_diizinkan") {
    showMessage("DEVICE DITOLAK", "Cek device key");
  } else if (result == "migration_belum_diterapkan") {
    showMessage("SERVER BELUM SIAP", "Migration 012");
  } else if (result == "server_error" || result == "koneksi_gagal") {
    showMessage("KONEKSI GAGAL", "Coba kembali");
  } else {
    showMessage("DITOLAK", message.length() ? message : "Coba kembali", 4000);
  }

  beepError();
}

// ================================================================
//  SETUP
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== SISPAS ===");

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, !BUZZER_ON_LEVEL);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  lcd.init();
  lcd.backlight();
  lcdPrint(0, "SISPAS");
  lcdPrint(1, "Memulai...");

  SPI.begin();          // SCK 18, MISO 19, MOSI 23, SS 5
  rfid.PCD_Init();
  delay(50);

  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  if (version == 0x00 || version == 0xFF) {
    Serial.println("[RFID] MFRC522 tidak terdeteksi! Cek wiring.");
    lcdPrint(0, "RFID error!");
    lcdPrint(1, "Cek kabel RC522");
    beepError();
    delay(3000);
  } else {
    Serial.printf("[RFID] MFRC522 OK (versi 0x%02X)\n", version);
  }

  connectWiFi(15000);
}

// ================================================================
//  LOOP
// ================================================================
void loop() {
  ensureWiFi();
  updateScroll();

  if (timeReached(messageUntil) && timeReached(idleDrawAt)) {
    drawIdle();
    idleDrawAt = millis() + 250;
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = readUid();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  // Cegah tap ganda karena kartu masih menempel di reader
  if (uid == lastUid && !timeReached(lastUidAt + SAME_TAG_COOLDOWN_MS)) return;
  lastUid   = uid;
  lastUidAt = millis();

  Serial.printf("[RFID] UID terbaca: %s\n", uid.c_str());
  beepClick();

  if (WiFi.status() != WL_CONNECTED) {
    showMessage("Tidak ada WiFi", uid);
    beepError();
    return;
  }

  lcdPrint(0, "Memproses...");
  lcdPrint(1, uid);

  JsonDocument response;
  bool parsed = false;
  int code = sendTap(uid, response, parsed);
  handleResponse(code, response, parsed, uid);
}