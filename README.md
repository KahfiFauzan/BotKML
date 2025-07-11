# 🤖 BotKML - Bot Telegram Pemetaan Infrastruktur

**BotKML** adalah bot Telegram yang dirancang untuk membantu teknisi atau petugas lapangan dalam melakukan **pemetaan aset infrastruktur**, seperti Tiang, ODC, ODP, Handhole, dan Jalur Kabel. Bot ini memungkinkan pengguna mengirim titik lokasi, memilih aset terkait, memilih jenis kabel, dan secara otomatis menghasilkan file KML serta peta visual.

---

## 📦 Fitur Utama

- 🔐 Registrasi pengguna berbasis NIK
- 📍 Input lokasi langsung dari Telegram
- 🏗️ Pilih aset infrastruktur (Tiang, ODP, ODC, Handhole, Kabel Galian)
- 📝 Input nama aset secara manual
- 🔌 Pilih jenis kabel: Udara, Galian Kuning, Galian Merah
- 🗺️ Visualisasi peta dari titik-titik
- 🗂️ Otomatis menghasilkan file KML untuk Google Earth/GIS

---

## 🚀 Cara Instalasi

### 1. Clone Project

```bash
git clone https://github.com/username/BotKML.git
cd BotKML

## **Instal Dependensi**
npm install


Buatkan File .env
cp .envexample .env

TELEGRAM_TOKEN=your_telegram_bot_token
GEOAPIFY_API_KEY=your_geoapify_api_key
ALLOWED_NIKS=123456,987654,456789

##**Jalankan Bot**##
bash
Copy
Edit
node index.js


🧑‍💻 Panduan Penggunaan Bot
1. Registrasi
bash
Copy
Edit
/register NIK_ANDA
Hanya NIK yang termasuk di ALLOWED_NIKS yang bisa mendaftar.

2. Mulai Pemetaan
bash
Copy
Edit
/new
Masukkan nama proyek dan nama pekerjaan sesuai instruksi.

3. Input Titik
Kirim lokasi melalui fitur "📍 Kirim Lokasi"

Pilih aset yang berada di titik tersebut

(Jika diminta) Masukkan nama aset manual

Pilih jenis kabel yang terhubung dari titik tersebut

4. Ulangi Input Titik
Lakukan proses di atas untuk semua titik yang ingin Anda petakan.

5. Selesai
bash
Copy
Edit
/done
Bot akan mengirim:

🗺️ Peta dalam format gambar PNG

📋 Detail titik dan jarak antar titik

🗂️ File KML untuk digunakan di Google Earth



📖 Perintah Penting
Perintah	Fungsi
/start / /help	Menampilkan panduan penggunaan
/register NIK	Mendaftarkan diri dengan NIK
/new	Memulai sesi pemetaan baru
/cancel	Membatalkan sesi pemetaan
/done	Menyelesaikan sesi dan mengirim hasil pemetaan


