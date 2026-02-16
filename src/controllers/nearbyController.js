// backend/src/controllers/nearbyController.js
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

const CATEGORY_SEARCH = {
  'Plumbing':      'plumber',
  'Electrical':    'electrician',
  'Cleaning':      'cleaning service',
  'Painting':      'painter',
  'Carpentry':     'carpenter',
  'AC Repair':     'AC repair',
  'Car Wash':      'car wash',
  'Moving':        'packers movers',
  'Salon':         'salon',
  'Pet Care':      'veterinary',
  'Tutoring':      'tuition',
  'Food Delivery': 'restaurant',
  'Other':         'home services',
};

const calcDist = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2)**2;
  const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return dist < 1 ? `${(dist*1000).toFixed(0)}m` : `${dist.toFixed(1)}km`;
};

const distNum = (lat1, lon1, lat2, lon2) => {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

exports.getNearbyShops = async (req, res) => {
  const { latitude, longitude, category, radius = 5000 } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ success: false, message: 'Location required' });
  }

  const lat     = parseFloat(latitude);
  const lon     = parseFloat(longitude);
  const keyword = CATEGORY_SEARCH[category] || category || 'shop';

  console.log(`🔍 Searching: ${keyword} near ${lat},${lon} radius:${radius}`);

  // ── Method 1: Google Places API (old - nearbysearch) ──────────────────────
  try {
    const googleUrl =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lon}` +
      `&radius=${radius}` +
      `&keyword=${encodeURIComponent(keyword)}` +
      `&key=${GOOGLE_API_KEY}`;

    console.log('📡 Calling Google Places...');
    const gRes   = await axios.get(googleUrl, { timeout: 15000 });
    const status = gRes.data?.status;
    const count  = gRes.data?.results?.length || 0;

    console.log(`Google status: ${status}, results: ${count}`);

    if (status === 'OK' && count > 0) {
      const shops = gRes.data.results
        .map(p => ({
          id:       p.place_id,
          name:     p.name,
          address:  p.vicinity || '',
          rating:   p.rating   || 0,
          reviews:  p.user_ratings_total || 0,
          isOpen:   p.opening_hours?.open_now,
          distance: calcDist(lat, lon, p.geometry.location.lat, p.geometry.location.lng),
          distKm:   distNum(lat, lon, p.geometry.location.lat, p.geometry.location.lng),
          lat:      p.geometry.location.lat,
          lon:      p.geometry.location.lng,
          placeId:  p.place_id,
          source:   'google',
        }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 20);

      console.log(`✅ Google returned ${shops.length} shops`);
      return res.json({ success: true, count: shops.length, source: 'google', data: shops });
    }

    // ZERO_RESULTS from Google — try wider radius
    if (status === 'OK' || status === 'ZERO_RESULTS') {
      console.log('Google: 0 results, trying wider radius...');
      const wideUrl =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
        `?location=${lat},${lon}` +
        `&radius=15000` +
        `&keyword=${encodeURIComponent(keyword)}` +
        `&key=${GOOGLE_API_KEY}`;

      const wRes    = await axios.get(wideUrl, { timeout: 15000 });
      const wStatus = wRes.data?.status;
      const wCount  = wRes.data?.results?.length || 0;
      console.log(`Wide search: ${wStatus}, results: ${wCount}`);

      if (wStatus === 'OK' && wCount > 0) {
        const shops = wRes.data.results
          .map(p => ({
            id:       p.place_id,
            name:     p.name,
            address:  p.vicinity || '',
            rating:   p.rating   || 0,
            reviews:  p.user_ratings_total || 0,
            isOpen:   p.opening_hours?.open_now,
            distance: calcDist(lat, lon, p.geometry.location.lat, p.geometry.location.lng),
            distKm:   distNum(lat, lon, p.geometry.location.lat, p.geometry.location.lng),
            lat:      p.geometry.location.lat,
            lon:      p.geometry.location.lng,
            placeId:  p.place_id,
            source:   'google',
          }))
          .sort((a, b) => a.distKm - b.distKm)
          .slice(0, 20);

        return res.json({ success: true, count: shops.length, source: 'google', data: shops });
      }
    }

    // API key issue or billing not enabled
    if (status === 'REQUEST_DENIED' || status === 'INVALID_REQUEST') {
      console.log(`⚠️ Google API issue: ${status} - ${gRes.data?.error_message}`);
      throw new Error(`Google: ${status} - ${gRes.data?.error_message}`);
    }

  } catch (gErr) {
    console.log('Google Places failed:', gErr.message);
  }

  // ── Method 2: OpenStreetMap Overpass (FREE fallback) ──────────────────────
  console.log('📡 Trying OpenStreetMap...');
  try {
    const osmQuery = `
      [out:json][timeout:25];
      (
        node["name"~"${keyword}",i](around:10000,${lat},${lon});
        node["shop"~"${keyword}",i](around:10000,${lat},${lon});
        node["amenity"~"${keyword}",i](around:10000,${lat},${lon});
        node["craft"~"${keyword}",i](around:10000,${lat},${lon});
        way["name"~"${keyword}",i](around:10000,${lat},${lon});
        way["shop"~"${keyword}",i](around:10000,${lat},${lon});
      );
      out center tags 25;
    `;

    const osmRes   = await axios.post(
      'https://overpass-api.de/api/interpreter',
      osmQuery.trim(),
      { headers: { 'Content-Type': 'text/plain' }, timeout: 20000 }
    );
    const elements = osmRes.data?.elements || [];
    console.log(`OSM returned ${elements.length} elements`);

    const shops = elements
      .filter(el => el.tags?.name)
      .map(el => {
        const eLat = el.lat || el.center?.lat;
        const eLon = el.lon || el.center?.lon;
        if (!eLat || !eLon) return null;
        return {
          id:       String(el.id),
          name:     el.tags.name,
          address:  [
            el.tags['addr:housenumber'],
            el.tags['addr:street'],
            el.tags['addr:suburb'] || el.tags['addr:city'],
          ].filter(Boolean).join(', ') || el.tags['addr:full'] || '',
          rating:   0,
          reviews:  0,
          isOpen:   undefined,
          phone:    el.tags.phone || el.tags['contact:phone'] || null,
          opening:  el.tags.opening_hours || null,
          distance: calcDist(lat, lon, eLat, eLon),
          distKm:   distNum(lat, lon, eLat, eLon),
          lat:      eLat,
          lon:      eLon,
          source:   'osm',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 20);

    console.log(`✅ OSM found ${shops.length} shops`);
    return res.json({ success: true, count: shops.length, source: 'osm', data: shops });

  } catch (osmErr) {
    console.log('OSM failed:', osmErr.message);
  }

  // ── Method 3: Nominatim (last resort) ─────────────────────────────────────
  console.log('📡 Trying Nominatim...');
  try {
    const nomUrl =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(keyword + ' Chennai')}` +
      `&format=json&limit=15&addressdetails=1`;

    const nomRes = await axios.get(nomUrl, {
      headers: { 'User-Agent': 'HeyMate/1.0' },
      timeout: 10000,
    });

    const shops = (nomRes.data || [])
      .filter(p => p.display_name)
      .map(p => ({
        id:       p.place_id?.toString(),
        name:     p.display_name.split(',')[0],
        address:  p.display_name.split(',').slice(1, 3).join(',').trim(),
        rating:   0,
        reviews:  0,
        distance: calcDist(lat, lon, parseFloat(p.lat), parseFloat(p.lon)),
        distKm:   distNum(lat, lon, parseFloat(p.lat), parseFloat(p.lon)),
        lat:      parseFloat(p.lat),
        lon:      parseFloat(p.lon),
        source:   'nominatim',
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 15);

    console.log(`✅ Nominatim found ${shops.length} results`);
    return res.json({ success: true, count: shops.length, source: 'nominatim', data: shops });

  } catch (nomErr) {
    console.log('Nominatim failed:', nomErr.message);
  }

  // All methods failed
  console.log('❌ All methods failed');
  return res.json({ success: true, count: 0, data: [] });
};

exports.getPlaceDetails = async (req, res) => {
  const { placeId } = req.params;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${placeId}` +
      `&fields=name,formatted_phone_number,website,opening_hours,formatted_address` +
      `&key=${GOOGLE_API_KEY}`;

    const response = await axios.get(url, { timeout: 10000 });
    const result   = response.data?.result;
    if (result) {
      return res.json({
        success: true,
        data: {
          phone:   result.formatted_phone_number || null,
          website: result.website || null,
          address: result.formatted_address || null,
          hours:   result.opening_hours?.weekday_text || null,
          isOpen:  result.opening_hours?.open_now,
        },
      });
    }
    res.json({ success: false });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};