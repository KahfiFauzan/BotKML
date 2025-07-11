const winston = require('winston');

// Konfigurasi format log
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
);

// Membuat logger untuk mencatat aktivitas
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        // Menampilkan log di konsol dengan warna
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // Menyimpan semua log aktivitas ke dalam file
        new winston.transports.File({ filename: 'bot-activity.log' })
    ]
});

module.exports = logger;