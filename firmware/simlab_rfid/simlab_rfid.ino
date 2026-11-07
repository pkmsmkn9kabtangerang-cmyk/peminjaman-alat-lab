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
 *    - WiFiManager        by tzapu
 *  WiFi, HTTPClient, WiFiClientSecure sudah bawaan board ESP32.
 * ================================================================
 */

#include <WiFi.h>
#include <WiFiManager.h>       // Library: WiFiManager by tzapu
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
// WiFi sekolah TIDAK lagi ditulis di firmware. WiFiManager akan
// menyimpan SSID/password ke memori ESP32 (NVS) setelah setup pertama.
//
// Hotspot ini hanya untuk halaman konfigurasi WiFi, BUKAN WiFi sekolah.
// Ganti password AP dengan milik sendiri (minimal 8 karakter).
const char* CONFIG_AP_NAME     = "di isi sendiri";
const char* CONFIG_AP_PASSWORD = "di isi sendiri";

// Supabase
const char* SUPABASE_URL      = "";
const char* SUPABASE_ANON_KEY = "";

// Identitas alat (dikirim di header x-device-id / x-device-key).
// Value harus sama dengan value secret rfid_device_id / rfid_device_key.
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
const unsigned long SESSION_MS            = 20000; // fallback; nilai utama dari session.expires_in_seconds
const unsigned long SAME_TAG_COOLDOWN_MS  = 2500;  // abaikan tap kartu yg sama berulang
const unsigned long MESSAGE_MS            = 3000;  // lama pesan tampil di LCD
const unsigned long WIFI_RETRY_MS             = 10000; // percobaan koneksi ulang tiap 10 detik
const unsigned long WIFI_PORTAL_RETRY_MS      = 120000; // portal dicoba setelah offline terus 2 menit
const unsigned long WIFI_CONNECT_TIMEOUT_SEC = 20;    // waktu mencoba WiFi tersimpan
const unsigned long WIFI_PORTAL_TIMEOUT_SEC  = 300;   // portal setup aktif maksimal 5 menit per percobaan
const uint16_t      HTTP_TIMEOUT_MS           = 10000;

// ================================================================
//  OBJEK & STATE
// ================================================================
MFRC522           rfid(PIN_RFID_SS, PIN_RFID_RST);
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);
WiFiManager       wifiManager;

String        lastUid;
unsigned long lastUidAt     = 0;

bool          sessionActive = false;
String        sessionUid;              // UID kartu pemilik sesi
String        sessionNama;             // nama perwakilan / kelas
String        sessionKelas;            // kelas/angkatan
unsigned long sessionUntil  = 0;

unsigned long messageUntil  = 0;       // selama pesan tampil, layar idle tidak digambar
unsigned long idleDrawAt       = 0;
unsigned long wifiRetryAt      = 0;
unsigned long wifiDisconnectedAt = 0;
unsigned long wifiPortalRetryAt  = 0;
bool          wifiWasConnected   = false;

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
//  WIFI MANAGER
// ================================================================
// Perilaku: 
// - Boot pertama / belum ada WiFi tersimpan: buka SIMLAB-SETUP.
// - WiFi tersimpan dan tersedia: langsung konek, tanpa membuka hotspot.
// - WiFi terputus: coba reconnect setiap 10 detik.
// - Offline terus 2 menit: buka portal setup agar admin dapat mengganti WiFi.
// - Portal aktif maksimal 5 menit per percobaan; setelah timeout, firmware
//   tetap hidup dan mencoba konek ulang, bukan restart dalam loop.

void showWiFiConnected() {
  wifiWasConnected = true;
  wifiDisconnectedAt = 0;
  wifiPortalRetryAt = 0;
  wifiRetryAt = millis() + WIFI_RETRY_MS;

  Serial.printf("[WiFi] Terhubung ke %s, IP: %s\n",
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  showMessage("WiFi terhubung", WiFi.localIP().toString(), 2000);
  beepOk();
}

void showWiFiConfigMode(WiFiManager *manager) {
  Serial.println("[WiFi] Mode konfigurasi aktif.");
  Serial.printf("[WiFi] Hubungkan HP ke %s\n", manager->getConfigPortalSSID().c_str());
  Serial.println("[WiFi] Buka http://192.168.4.1");
  lcdPrint(0, "WIFI SETUP AKTIF");
  lcdPrint(1, "192.168.4.1");
}

bool connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  wifiManager.setDebugOutput(true);
  wifiManager.setConnectTimeout(WIFI_CONNECT_TIMEOUT_SEC);
  wifiManager.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_SEC);
  wifiManager.setWiFiAutoReconnect(true);
  wifiManager.setAPCallback(showWiFiConfigMode);
  wifiManager.setTitle("SIMLAB WiFi Setup");

  lcdPrint(0, "Cek WiFi...      ");
  lcdPrint(1, "Menghubungkan...");
  Serial.println("[WiFi] Mencoba WiFi yang tersimpan.");

  // autoConnect akan memakai kredensial yang tersimpan di NVS.
  // Hotspot SIMLAB-SETUP hanya dibuka jika koneksi tidak berhasil.
  bool connected = wifiManager.autoConnect(CONFIG_AP_NAME, CONFIG_AP_PASSWORD);

  if (connected && WiFi.status() == WL_CONNECTED) {
    showWiFiConnected();
    return true;
  }

  Serial.println("[WiFi] Belum terhubung. Firmware tetap berjalan dan akan mencoba lagi.");
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  wifiWasConnected = false;
  wifiDisconnectedAt = millis();
  wifiRetryAt = millis() + WIFI_RETRY_MS;
  // Jangan buka portal lagi langsung setelah portal pertama timeout.
  wifiPortalRetryAt = millis() + WIFI_PORTAL_RETRY_MS;
  showMessage("WiFi belum siap", "Akan coba ulang", 3000);
  return false;
}

void openWiFiConfigPortal() {
  Serial.println("[WiFi] Membuka portal konfigurasi ulang.");
  lcdPrint(0, "WIFI SETUP AKTIF");
  lcdPrint(1, "Buka 192.168.4.1");

  wifiManager.setConnectTimeout(WIFI_CONNECT_TIMEOUT_SEC);
  wifiManager.setConfigPortalTimeout(WIFI_PORTAL_TIMEOUT_SEC);
  wifiManager.setWiFiAutoReconnect(true);
  wifiManager.setAPCallback(showWiFiConfigMode);

  // Gunakan autoConnect juga untuk percobaan ulang: library akan mencoba
  // WiFi tersimpan dahulu, lalu membuka portal hanya jika koneksi gagal.
  // Gunakan satu pola autoConnect agar alur koneksi dan portal konsisten.
  bool connected = wifiManager.autoConnect(CONFIG_AP_NAME, CONFIG_AP_PASSWORD);

  if (connected && WiFi.status() == WL_CONNECTED) {
    showWiFiConnected();
    return;
  }

  Serial.println("[WiFi] Portal ditutup/time out; koneksi akan dicoba lagi.");
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  wifiWasConnected = false;
  if (wifiDisconnectedAt == 0) wifiDisconnectedAt = millis();
  wifiRetryAt = millis() + WIFI_RETRY_MS;
  wifiPortalRetryAt = millis() + WIFI_PORTAL_RETRY_MS;
  showMessage("WiFi belum siap", "Coba setup lagi", 3000);
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiWasConnected) {
      showWiFiConnected();
    }
    return;
  }

  if (wifiWasConnected) {
    wifiWasConnected = false;
    wifiDisconnectedAt = millis();
    wifiPortalRetryAt = wifiDisconnectedAt + WIFI_PORTAL_RETRY_MS;
    Serial.println("[WiFi] Koneksi terputus. Mencoba reconnect.");
  }

  if (wifiDisconnectedAt == 0) wifiDisconnectedAt = millis();

  if (timeReached(wifiRetryAt)) {
    wifiRetryAt = millis() + WIFI_RETRY_MS;
    Serial.println("[WiFi] Reconnect menggunakan kredensial tersimpan...");
    WiFi.reconnect();
  }

  // Jangan langsung memunculkan portal karena gangguan singkat.
  // Portal baru dibuka jika ESP32 offline terus selama 2 menit.
  if (millis() - wifiDisconnectedAt >= WIFI_PORTAL_RETRY_MS &&
      timeReached(wifiPortalRetryAt)) {
    openWiFiConfigPortal();
  }
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
//  SINKRONISASI SESI DARI RESPONS BACKEND
// ================================================================
// Timer LCD hanya untuk tampilan. Nilai awal/akhir setiap periode
// selalu diambil dari `session.expires_in_seconds` yang dihitung
// database pada saat respons dibuat.
void applySessionFromResponse(JsonVariantConst session) {
  if (session.isNull()) return;

  String uidSesi = String(session["uid_kartu"] | "");
  if (uidSesi.length() == 0) return;

  sessionActive = true;
  sessionUid    = uidSesi;

  String kelasSesi = String(session["kelas"] | "");
  if (kelasSesi.length() > 0) sessionKelas = kelasSesi;

  String namaSesi = String(session["nama_pemegang"] | "");
  if (namaSesi.length() > 0) {
    sessionNama = namaSesi;
  } else if (sessionKelas.length() > 0) {
    sessionNama = sessionKelas;
  }

  int remaining = session["expires_in_seconds"] | -1;
  if (remaining < 0 || remaining > 300) {
    // Kompatibilitas mundur saja; backend terbaru selalu mengirim field ini.
    remaining = (int)(SESSION_MS / 1100UL);
  }
  // Field dari database dalam satuan detik, millis() dalam milidetik.
  sessionUntil = millis() + (unsigned long)remaining * 1100UL;
}

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

  // Setiap respons yang membawa sesi menyinkronkan LCD dengan sisa waktu
  // dari database. Ini juga berlaku untuk sesi_kartu_lain_aktif dan
  // penolakan lain yang masih memiliki sesi aktif.
  JsonVariantConst sessionObj = r["session"];
  applySessionFromResponse(sessionObj);

  // ---------- BERHASIL (dikonfirmasi backend) ----------
  if (success) {
    if (result == "sesi_dimulai") {
      if (sessionKelas.length() == 0) sessionKelas = kelas;
      if (sessionNama.length() == 0) sessionNama = sessionKelas;
      showMessage(sessionKelas.length() ? sessionKelas : sessionNama, "Sesi aktif", 2000);
      beepSession();
      return;
    }

    if (result == "sesi_selesai") {
      sessionActive = false;
      sessionUid    = "";
      sessionUntil  = 0;
      showMessage("SESI SELESAI", kelas.length() ? kelas : sessionNama);
      beepSession();
      return;
    }

    if (result == "dipinjam" || result == "dikembalikan" || result == "menunggu_persetujuan") {
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
    sessionUntil  = 0;
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
      sessionUntil  = 0;
    }
    showMessage("KARTU NONAKTIF", "Hubungi petugas");
  } else if (result == "stok_habis") {
    showMessage("STOK HABIS", "Tidak tersedia");
  } else if (result == "sesi_kartu_lain_aktif") {
    // applySessionFromResponse() sudah menyinkronkan kelas, nama, UID,
    // dan sisa waktu sesi milik kartu lain dari database.
    String aktif = sessionKelas.length() ? sessionKelas : sessionNama;
    if (aktif.length() == 0) aktif = String(r["session"]["kelas"] | "");
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

  connectWiFi();
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