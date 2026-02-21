// backend/src/controllers/nearbyController.js - MAX 10 MINUTES TRAVEL
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API || process.env.GOOGLE_API_KEY || '';

const CATEGORY_SEARCH = {
  'Plumbing':       'plumber',
  'Electrical':     'electrician',
  'Cleaning':       'cleaning service',
  'Painting':       'painter',
  'Carpentry':      'carpenter',
  'AC Repair':      'AC repair air conditioner',
  'Car Wash':       'car wash',
  'Moving':         'packers movers',
  'Salon':          'salon beauty parlour',
  'Pet Care':       'pet shop veterinary',
  'Tutoring':       'tuition coaching',
  'Food Delivery':  'restaurant food delivery',
};

// ── Calculate distance ────────────────────────────────────────────────────────
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;
  
  return distanceKm;
};

// ── Estimate travel time (10 min max) ────────────────────────────────────────
const estimateTravelTime = (distanceKm) => {
  // Walking: 5 km/h
  // City driving: 15-20 km/h average
  
  // For very short distances, assume walking
  if (distanceKm < 0.5) {
    const walkMinutes = Math.round((distanceKm / 5) * 60);
    return walkMinutes < 5 ? '5 min walk' : `${walkMinutes} min walk`;
  }
  
  // For longer, assume driving in city traffic (15 km/h avg)
  const avgSpeed = 15; // km/h (realistic for Indian city traffic)
  const timeHours = distanceKm / avgSpeed;
  const timeMinutes = Math.round(timeHours * 60);
  
  if (timeMinutes < 5) {
    return '5 min';
  } else {
    return `${timeMinutes} min`;
  }
};

// ── Format distance ───────────────────────────────────────────────────────────
const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else {
    return `${distanceKm.toFixed(1)}km`;
  }
};

// ── Google Places API ─────────────────────────────────────────────────────────
const fetchGooglePlaces = async (lat, lon, category, radius) => {
  try {
    if (!GOOGLE_API_KEY) {
      console.log('⚠️  GOOGLE_PLACE_API not set');
      return null;
    }

    const keyword = CATEGORY_SEARCH[category] || category;
    const url = 'https://places.googleapis.com/v1/places:searchText';

    console.log(`🔍 Google Places: "${keyword}" at (${lat}, ${lon}) within ${radius}m`);

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
      timeout: 10000
    });

    if (response.data.places && response.data.places.length > 0) {
      console.log(`✅ Google Places: Found ${response.data.places.length} results`);
      
      const shops = response.data.places.map(place => {
        const shopLat = place.location?.latitude;
        const shopLon = place.location?.longitude;
        const distKm = calculateDistance(lat, lon, shopLat, shopLon);
        const travelTime = estimateTravelTime(distKm);
        
        return {
          id: place.id,
          name: place.displayName?.text || 'Unknown',
          address: place.formattedAddress || '',
          lat: shopLat,
          lon: shopLon,
          rating: place.rating || 0,
          reviews: place.userRatingCount || 0,
          isOpen: place.currentOpeningHours?.openNow,
          phone: place.internationalPhoneNumber || null,
          distance: formatDistance(distKm),
          distanceKm: distKm,
          travelTime: travelTime,
          source: 'google',
          photoUrl: place.photos?.[0]?.name 
            ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=400&key=${GOOGLE_API_KEY}`
            : null,
        };
      });

      // ✅ FILTER: Max 10 minutes travel (about 2.5km at 15km/h)
      const filtered = shops.filter(shop => {
        const timeMinutes = parseInt(shop.travelTime);
        return timeMinutes <= 10; // Max 10 minutes
      });

      // Sort by distance (nearest first)
      filtered.sort((a, b) => a.distanceKm - b.distanceKm);

      console.log(`✅ After 10min filter: ${filtered.length} shops (from ${shops.length} total)`);
      return filtered;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Google Places error:', error.message);
    return null;
  }
};

// ── OpenStreetMap Fallback ───────────────────────────────────────────────────
const fetchOpenStreetMap = async (lat, lon, category, radius) => {
  try {
    console.log(`🔍 OpenStreetMap: Searching within ${radius}m`);
    
    const query = `[out:json][timeout:15];
      (
        node["shop"](around:${radius},${lat},${lon});
        node["amenity"](around:${radius},${lat},${lon});
        node["craft"](around:${radius},${lat},${lon});
      );
      out body 20;`;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { headers: { 'Content-Type': 'text/plain' }, timeout: 10000 }
    );

    if (response.data.elements && response.data.elements.length > 0) {
      console.log(`✅ OpenStreetMap: Found ${response.data.elements.length} results`);
      
      const shops = response.data.elements.map(el => {
        const distKm = calculateDistance(lat, lon, el.lat, el.lon);
        const travelTime = estimateTravelTime(distKm);
        
        return {
          id: el.id.toString(),
          name: el.tags?.name || 'Local Shop',
          address: el.tags?.['addr:full'] || el.tags?.['addr:street'] || '',
          lat: el.lat,
          lon: el.lon,
          rating: 0,
          reviews: 0,
          isOpen: undefined,
          phone: el.tags?.phone || null,
          distance: formatDistance(distKm),
          distanceKm: distKm,
          travelTime: travelTime,
          source: 'osm',
        };
      });

      const filtered = shops.filter(shop => {
        const timeMinutes = parseInt(shop.travelTime);
        return timeMinutes <= 10;
      });

      filtered.sort((a, b) => a.distanceKm - b.distanceKm);
      return filtered;
    }
    
    return null;
  } catch (error) {
    console.error('❌ OpenStreetMap error:', error.message);
    return null;
  }
};

// ── MAIN CONTROLLER ───────────────────────────────────────────────────────────
exports.getNearbyShops = async (req, res) => {
  try {
    const { latitude, longitude, category, radius = 3000 } = req.query; // Default 3km (10min max)

    if (!latitude || !longitude || !category) {
      return res.status(400).json({
        success: false,
        message: 'latitude, longitude, and category are required',
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const searchRadius = Math.min(parseInt(radius), 3000); // Cap at 3km for 10min

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 NEARBY SHOPS REQUEST (10 MIN MAX)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 User GPS: (${lat}, ${lon})`);
    console.log(`📂 Category: ${category}`);
    console.log(`📏 Search Radius: ${searchRadius}m (${(searchRadius/1000).toFixed(1)}km)`);
    console.log(`⏱️  Max Travel: 10 minutes`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let shops = null;

    // Try Google Places first
    shops = await fetchGooglePlaces(lat, lon, category, searchRadius);

    // Fallback to OpenStreetMap
    if (!shops || shops.length === 0) {
      console.log('⚠️  No Google results within 10min, trying OpenStreetMap...\n');
      shops = await fetchOpenStreetMap(lat, lon, category, searchRadius);
    }

    // If still no results, try wider search (5km) but still filter to 10min
    if (!shops || shops.length === 0) {
      console.log('⚠️  Expanding search to 5km (still max 10min)...\n');
      shops = await fetchGooglePlaces(lat, lon, category, 5000);
      
      if (!shops || shops.length === 0) {
        shops = await fetchOpenStreetMap(lat, lon, category, 5000);
      }
    }

    const finalShops = shops || [];
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SEARCH COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Results: ${finalShops.length} shops (all within 10 min)`);
    if (finalShops.length > 0) {
      console.log(`📍 Nearest: ${finalShops[0].name}`);
      console.log(`   Distance: ${finalShops[0].distance}`);
      console.log(`   Travel: ${finalShops[0].travelTime}`);
      console.log(`   Source: ${finalShops[0].source}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    res.json({
      success: true,
      count: finalShops.length,
      data: finalShops,
      userLocation: { latitude: lat, longitude: lon },
      searchRadius: searchRadius,
      category: category,
      maxTravelTime: '10 minutes'
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      data: []
    });
  }
};