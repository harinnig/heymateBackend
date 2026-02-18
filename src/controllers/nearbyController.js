// backend/src/controllers/nearbyController.js
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API || process.env.GOOGLE_API_KEY || '';

const CATEGORY_SEARCH = {
  'Plumbing':       'plumber',
  'Electrical':     'electrician',
  'Cleaning':       'cleaning service',
  'Painting':       'painter',
  'Carpentry':      'carpenter',
  'AC Repair':      'AC repair air conditioner service',
  'Car Wash':       'car wash',
  'Moving':         'packers movers',
  'Salon':          'salon beauty parlour',
  'Pet Care':       'pet shop veterinary',
  'Tutoring':       'tuition coaching',
  'Food Delivery':  'restaurant food',
  'Other':          'service',
};

// ── Helper: Calculate distance (Haversine) ───────────────────────────────────
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c;
  return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
};

// ── METHOD 1: Google Places API (New) ─────────────────────────────────────────
const fetchGooglePlaces = async (lat, lon, category, radius) => {
  try {
    if (!GOOGLE_API_KEY) {
      console.log('⚠️  GOOGLE_PLACE_API not set in Railway');
      return null;
    }

    const keyword = CATEGORY_SEARCH[category] || category;
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const response = await axios.post(url, {
      textQuery: `${keyword} near me`,
      locationBias: {
        circle: {
          center: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
          radius: parseInt(radius),
        },
      },
      maxResultCount: 20,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.photos,places.id,places.internationalPhoneNumber',
      },
    });

    if (response.data.places && response.data.places.length > 0) {
      console.log(`✅ Google Places: Found ${response.data.places.length} results`);
      return response.data.places.map(place => ({
        id:       place.id,
        name:     place.displayName?.text || 'Unknown',
        address:  place.formattedAddress || '',
        lat:      place.location?.latitude,
        lon:      place.location?.longitude,
        rating:   place.rating || 0,
        reviews:  place.userRatingCount || 0,
        isOpen:   place.currentOpeningHours?.openNow,
        phone:    place.internationalPhoneNumber || null,
        distance: calculateDistance(lat, lon, place.location?.latitude, place.location?.longitude),
        source:   'google',
      }));
    }
    return null;
  } catch (error) {
    console.error('Google Places error:', error.message);
    return null;
  }
};

// ── METHOD 2: OpenStreetMap (Fallback) ───────────────────────────────────────
const fetchOpenStreetMap = async (lat, lon, category, radius) => {
  try {
    const keyword = CATEGORY_SEARCH[category] || category;
    const query = `[out:json][timeout:25];
      (
        node["shop"](around:${radius},${lat},${lon});
        node["amenity"](around:${radius},${lat},${lon});
        node["craft"](around:${radius},${lat},${lon});
      );
      out body 20;`;

    const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 10000,
    });

    if (response.data.elements && response.data.elements.length > 0) {
      console.log(`✅ OSM: Found ${response.data.elements.length} results`);
      return response.data.elements.map(el => ({
        id:       el.id.toString(),
        name:     el.tags?.name || 'Local Shop',
        address:  el.tags?.['addr:full'] || el.tags?.['addr:street'] || '',
        lat:      el.lat,
        lon:      el.lon,
        rating:   0,
        reviews:  0,
        isOpen:   undefined,
        phone:    el.tags?.phone || null,
        distance: calculateDistance(lat, lon, el.lat, el.lon),
        source:   'osm',
      }));
    }
    return null;
  } catch (error) {
    console.error('OSM error:', error.message);
    return null;
  }
};

// ── METHOD 3: Nominatim (Last Resort) ────────────────────────────────────────
const fetchNominatim = async (lat, lon, category) => {
  try {
    const keyword = CATEGORY_SEARCH[category] || category;
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q:      keyword,
        lat,
        lon,
        format: 'json',
        limit:  10,
      },
      headers: { 'User-Agent': 'HeyMate-App' },
      timeout: 8000,
    });

    if (response.data && response.data.length > 0) {
      console.log(`✅ Nominatim: Found ${response.data.length} results`);
      return response.data.map(place => ({
        id:       place.place_id.toString(),
        name:     place.display_name.split(',')[0],
        address:  place.display_name,
        lat:      parseFloat(place.lat),
        lon:      parseFloat(place.lon),
        rating:   0,
        reviews:  0,
        isOpen:   undefined,
        phone:    null,
        distance: calculateDistance(lat, lon, parseFloat(place.lat), parseFloat(place.lon)),
        source:   'nominatim',
      }));
    }
    return null;
  } catch (error) {
    console.error('Nominatim error:', error.message);
    return null;
  }
};

// ── MAIN CONTROLLER ───────────────────────────────────────────────────────────
exports.getNearbyShops = async (req, res) => {
  try {
    const { latitude, longitude, category, radius = 5000 } = req.query;

    if (!latitude || !longitude || !category) {
      return res.status(400).json({
        success: false,
        message: 'latitude, longitude, and category are required',
      });
    }

    console.log(`🔍 Searching ${category} near (${latitude}, ${longitude}) within ${radius}m`);

    // Try Google Places first
    let shops = await fetchGooglePlaces(latitude, longitude, category, radius);

    // Fallback to OSM if Google fails
    if (!shops || shops.length === 0) {
      console.log('⚠️  No Google results, trying OSM...');
      shops = await fetchOpenStreetMap(latitude, longitude, category, radius);
    }

    // Last resort: Nominatim
    if (!shops || shops.length === 0) {
      console.log('⚠️  No OSM results, trying Nominatim...');
      shops = await fetchNominatim(latitude, longitude, category);
    }

    // Sort by distance
    if (shops && shops.length > 0) {
      shops.sort((a, b) => {
        const aNum = parseFloat(a.distance);
        const bNum = parseFloat(b.distance);
        return aNum - bNum;
      });
    }

    res.json({
      success: true,
      count:   shops ? shops.length : 0,
      data:    shops || [],
    });

  } catch (error) {
    console.error('getNearbyShops error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};