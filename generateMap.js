require('dotenv').config();
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const fs = require('fs');

async function generateCustomMap(points, lineColor, outputFile) {
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const centerLat = points.reduce((acc, p) => acc + p.latitude, 0) / points.length;
  const centerLon = points.reduce((acc, p) => acc + p.longitude, 0) / points.length;

  const mapUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=${width}&height=${height}&center=lonlat:${centerLon},${centerLat}&zoom=15&apiKey=${process.env.GEOAPIFY_API_KEY}`;

  console.log(`[INFO] Mengunduh background peta dari Geoapify: ${mapUrl}`);
  const response = await axios.get(mapUrl, { responseType: 'arraybuffer' });
  const bgImage = await loadImage(Buffer.from(response.data));

  ctx.drawImage(bgImage, 0, 0, width, height);

  points.forEach((p, i) => {
    ctx.fillStyle = 'red';
    const x = width / 2 + (p.longitude - centerLon) * 10000;
    const y = height / 2 - (p.latitude - centerLat) * 10000;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Sans';
    ctx.fillText(String.fromCharCode(65 + i), x - 5, y + 5);
  });

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputFile, buffer);
  console.log(`[SUCCESS] Peta berhasil disimpan: ${outputFile}`);
}

if (require.main === module) {
  const points = [
    { latitude: -6.30294, longitude: 106.654368 },
    { latitude: -6.320136, longitude: 106.643317 },
    { latitude: -6.227699, longitude: 106.656001 },
  ];
  generateCustomMap(points, '#ffc107', 'peta_custom.png').catch(console.error);
}
