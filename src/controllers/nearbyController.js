// backend/src/controllers/nearbyController.js
const axios = require('axios');

const GOOGLE_API_KEY = 'AIzaSyBoBIhJU0kW210QtcHSPXfkn7xvjJ1I8gw';

const CATEGORY_SEARCH = {
  'Plumbing':      'plumber',
  'Electrical':    'electrician',
  'Cleaning':      'cleaning service',
  'Painting':      'painter',
  'Carpentry':     'carpenter',
  'AC Repair':     'AC repair air conditioner',
  'Car Wash':      'car wash',
  'Moving':        'packers movers',
  'Salon':         'salon beauty parlour',
  'Pet Care':      'veterinary pet shop',
  'Tutoring':      'tuition coaching centre',
  'Food Delivery': 'restaurant food delivery',
  'Other':         'home services',
};

// ── Calculate distance ────────────────────────────────────────────────────────
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

// ── GET NEARBY SHOPS via Google Places API ─────────────────────────────────────
exports.getNearbyShops = async (req, res) => {
  const { latitude, longitude, category, radius = 5000 } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ success: false, message: 'Location required' });
  }

  const lat     = parseFloat(latitude);
  const lon     = parseFloat(longitude);
  const keyword = CATEGORY_SEARCH[category] || category || 'shop';

  try {
    // Google Places Nearby Search API
    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lon}` +
      `&radius=${radius}` +
      `&keyword=${encodeURIComponent(keyword)}` +
      `&key=${GOOGLE_API_KEY}`;

    const response = await axios.get(url, { timeout: 15000 });
    const results  = response.data?.results || [];
    const status   = response.data?.status;

    console.log(`Google Places status: ${status}, found: ${results.length}`);

    if (status === 'OK' || status === 'ZERO_RESULTS') {
      const shops = results
        .map(place => ({
          id:       place.place_id,
          name:     place.name,
          address:  place.vicinity || '',
          rating:   place.rating || 0,
          reviews:  place.user_ratings_total || 0,
          isOpen:   place.opening_hours?.open_now,
          distance: calcDist(lat, lon, place.geometry.location.lat, place.geometry.location.lng),
          distKm:   distNum(lat, lon, place.geometry.location.lat, place.geometry.location.lng),
          lat:      place.geometry.location.lat,
          lon:      place.geometry.location.lng,
          placeId:  place.place_id,
          photo:    place.photos?.[0]?.photo_reference
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${GOOGLE_API_KEY}`
            : null,
          types:    place.types || [],
        }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 20);

      return res.json({ success: true, count: shops.length, source: 'google', data: shops });
    }

    // If Google fails, fallback to OpenStreetMap
    throw new Error(`Google Places: ${status}`);

  } catch (err) {
    console.log('Google Places failed, trying OpenStreetMap:', err.message);

    // ── Fallback: OpenStreetMap ───────────────────────────────────────────────
    try {
      const keyword2 = CATEGORY_SEARCH[category] || category || 'shop';
      const query    = `
        [out:json][timeout:20];
        (
          node["name"~"${keyword2}",i](around:${radius},${lat},${lon});
          node["shop"~"${keyword2}",i](around:${radius},${lat},${lon});
          node["amenity"~"${keyword2}",i](around:${radius},${lat},${lon});
          node["craft"~"${keyword2}",i](around:${radius},${lat},${lon});
          way["name"~"${keyword2}",i](around:${radius},${lat},${lon});
        );
        out center tags 20;
      `;

      const osmRes   = await axios.post(
        'https://overpass-api.de/api/interpreter',
        query,
        { headers: { 'Content-Type': 'text/plain' }, timeout: 15000 }
      );
      const elements = osmRes.data?.elements || [];
      const shops    = elements
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
            ].filter(Boolean).join(', ') || '',
            rating:   0,
            reviews:  0,
            isOpen:   undefined,
            phone:    el.tags.phone || el.tags['contact:phone'] || null,
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

      return res.json({ success: true, count: shops.length, source: 'osm', data: shops });

    } catch (err2) {
      console.error('Both APIs failed:', err2.message);
      return res.json({ success: true, count: 0, data: [] });
    }
  }
};

// ── GET PLACE DETAILS (phone, website, hours) ─────────────────────────────────
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
    res.json({ success: false, message: 'Place not found' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
};
