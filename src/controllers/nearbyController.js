// backend/src/controllers/nearbyController.js
const axios = require('axios');

const CATEGORY_SEARCH = {
  'Plumbing':      'plumber',
  'Electrical':    'electrician',
  'Cleaning':      'cleaning service',
  'Painting':      'painter',
  'Carpentry':     'carpenter',
  'AC Repair':     'air conditioning repair',
  'Car Wash':      'car wash',
  'Moving':        'packers movers',
  'Salon':         'salon',
  'Pet Care':      'veterinary pet',
  'Tutoring':      'tuition centre',
  'Food Delivery': 'restaurant',
  'Other':         'home services',
};

// ── Calculate distance in km ─────────────────────────────────────────────────
const calcDist = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return dist < 1
    ? `${(dist * 1000).toFixed(0)}m`
    : `${dist.toFixed(1)}km`;
};

const distNum = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ── GET NEARBY SHOPS ──────────────────────────────────────────────────────────
exports.getNearbyShops = async (req, res) => {
  const { latitude, longitude, category, radius = 5000 } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ success: false, message: 'Location required' });
  }

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  const keyword = CATEGORY_SEARCH[category] || category || 'shop';

  try {
    // Method 1: Overpass API (OpenStreetMap)
    const query = `
      [out:json][timeout:20];
      (
        node["shop"~"${keyword}",i](around:${radius},${lat},${lon});
        node["amenity"~"${keyword}",i](around:${radius},${lat},${lon});
        node["craft"~"${keyword}",i](around:${radius},${lat},${lon});
        node["name"~"${keyword}",i](around:${radius},${lat},${lon});
        way["name"~"${keyword}",i](around:${radius},${lat},${lon});
        way["shop"~"${keyword}",i](around:${radius},${lat},${lon});
      );
      out center tags 30;
    `;

    const overpassRes = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { headers: { 'Content-Type': 'text/plain' }, timeout: 15000 }
    );

    const elements = overpassRes.data?.elements || [];

    let shops = elements
      .filter(el => el.tags?.name)
      .map(el => {
        const elLat = el.lat || el.center?.lat;
        const elLon = el.lon || el.center?.lon;
        if (!elLat || !elLon) return null;
        return {
          id:       String(el.id),
          name:     el.tags.name,
          address:  [
            el.tags['addr:housenumber'],
            el.tags['addr:street'],
            el.tags['addr:suburb'] || el.tags['addr:city'],
          ].filter(Boolean).join(', ') ||
            el.tags['addr:full'] || el.tags['addr:place'] || '',
          phone:    el.tags.phone || el.tags['contact:phone'] || el.tags['contact:mobile'] || null,
          website:  el.tags.website || el.tags['contact:website'] || null,
          opening:  el.tags.opening_hours || null,
          distance: calcDist(lat, lon, elLat, elLon),
          distKm:   distNum(lat, lon, elLat, elLon),
          lat:      elLat,
          lon:      elLon,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 20);

    // Method 2: If no results, try Nominatim
    if (shops.length === 0) {
      try {
        const nominatimUrl =
          `https://nominatim.openstreetmap.org/search` +
          `?q=${encodeURIComponent(keyword)}` +
          `&format=json&limit=15&addressdetails=1` +
          `&viewbox=${lon-0.1},${lat+0.1},${lon+0.1},${lat-0.1}` +
          `&bounded=1`;

        const nomRes = await axios.get(nominatimUrl, {
          headers: { 'User-Agent': 'HeyMate App/1.0 (heymate@example.com)' },
          timeout: 10000,
        });

        shops = (nomRes.data || [])
          .filter(p => p.display_name)
          .map(p => ({
            id:       p.place_id?.toString(),
            name:     p.display_name.split(',')[0],
            address:  p.display_name.split(',').slice(1, 3).join(',').trim(),
            phone:    null,
            website:  null,
            opening:  null,
            distance: calcDist(lat, lon, parseFloat(p.lat), parseFloat(p.lon)),
            distKm:   distNum(lat, lon, parseFloat(p.lat), parseFloat(p.lon)),
            lat:      parseFloat(p.lat),
            lon:      parseFloat(p.lon),
          }))
          .sort((a, b) => a.distKm - b.distKm)
          .slice(0, 15);
      } catch (e2) {
        console.log('Nominatim fallback failed:', e2.message);
      }
    }

    return res.json({
      success: true,
      count:   shops.length,
      data:    shops,
    });

  } catch (err) {
    console.error('Nearby shops error:', err.message);
    // Return empty but success so app handles gracefully
    return res.json({ success: true, count: 0, data: [] });
  }
};
