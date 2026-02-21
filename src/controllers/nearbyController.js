// backend/src/controllers/nearbyController.js - FIXED WITH TIMEOUT
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API || process.env.GOOGLE_API_KEY || '';

// Calculate distance
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
};

// Try Google Places with SHORT timeout
const tryGooglePlaces = async (lat, lon, category, radius) => {
  if (!GOOGLE_API_KEY) {
    console.log('⚠️  No Google API key');
    return null;
  }

  try {
    const url = 'https://places.googleapis.com/v1/places:searchText';
    
    const response = await axios.post(url, {
      textQuery: `${category} near me`,
      locationBias: {
        circle: {
          center: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
          radius: parseInt(radius)
        }
      },
      maxResultCount: 10
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.internationalPhoneNumber'
      },
      timeout: 5000 // ✅ ONLY 5 SECONDS MAX
    });

    if (response.data.places && response.data.places.length > 0) {
      console.log(`✅ Google: ${response.data.places.length} results`);
      return response.data.places.map(p => ({
        id: p.id || Math.random().toString(),
        name: p.displayName?.text || 'Shop',
        address: p.formattedAddress || '',
        lat: p.location?.latitude,
        lon: p.location?.longitude,
        rating: p.rating || 0,
        reviews: p.userRatingCount || 0,
        isOpen: p.currentOpeningHours?.openNow,
        phone: p.internationalPhoneNumber,
        distance: calculateDistance(lat, lon, p.location?.latitude, p.location?.longitude),
        source: 'google'
      }));
    }
    return null;
  } catch (error) {
    console.log(`⚠️  Google timeout: ${error.message}`);
    return null;
  }
};

// Try OpenStreetMap with SHORT timeout
const tryOpenStreetMap = async (lat, lon, radius) => {
  try {
    const query = `[out:json][timeout:5];(node["shop"](around:${radius},${lat},${lon});node["amenity"](around:${radius},${lat},${lon}););out body 10;`;
    
    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { 
        headers: { 'Content-Type': 'text/plain' },
        timeout: 5000 // ✅ ONLY 5 SECONDS MAX
      }
    );

    if (response.data.elements && response.data.elements.length > 0) {
      console.log(`✅ OSM: ${response.data.elements.length} results`);
      return response.data.elements.map(el => ({
        id: el.id.toString(),
        name: el.tags?.name || 'Local Shop',
        address: el.tags?.['addr:street'] || '',
        lat: el.lat,
        lon: el.lon,
        rating: 0,
        reviews: 0,
        phone: el.tags?.phone,
        distance: calculateDistance(lat, lon, el.lat, el.lon),
        source: 'osm'
      }));
    }
    return null;
  } catch (error) {
    console.log(`⚠️  OSM timeout: ${error.message}`);
    return null;
  }
};

// MAIN CONTROLLER
exports.getNearbyShops = async (req, res) => {
  try {
    const { latitude, longitude, category, radius = 3000 } = req.query;

    if (!latitude || !longitude || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    console.log(`\n🔍 Searching ${category} near (${lat}, ${lon})`);

    let shops = null;

    // Try Google first (5 sec timeout)
    shops = await tryGooglePlaces(lat, lon, category, radius);

    // If Google fails/timeout, try OpenStreetMap (5 sec timeout)
    if (!shops || shops.length === 0) {
      console.log('Trying OSM fallback...');
      shops = await tryOpenStreetMap(lat, lon, radius);
    }

    // If both fail, return dummy data so app doesn't crash
    if (!shops || shops.length === 0) {
      console.log('⚠️  No results from any source, returning placeholder');
      shops = [
        {
          id: 'placeholder1',
          name: `${category} Service`,
          address: 'Search wider area or try later',
          lat: lat + 0.01,
          lon: lon + 0.01,
          rating: 0,
          reviews: 0,
          distance: '~1km',
          source: 'placeholder'
        }
      ];
    }

    console.log(`✅ Returning ${shops.length} shops\n`);

    res.json({
      success: true,
      count: shops.length,
      data: shops
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Return empty array instead of crashing
    res.json({ 
      success: true, 
      count: 0,
      data: [],
      message: 'Search timed out, please try again'
    });
  }
};