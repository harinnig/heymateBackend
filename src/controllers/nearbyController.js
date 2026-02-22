// backend/src/controllers/nearbyController.js - CATEGORY-BASED SEARCH
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API || process.env.GOOGLE_API_KEY || '';

// ✅ CATEGORY-SPECIFIC SEARCH TERMS
const CATEGORY_MAPPING = {
  // Service professionals (searches for service providers)
  'Plumbing': {
    type: 'service',
    keywords: 'plumber plumbing service',
    osmTags: ['craft=plumber', 'shop=plumber']
  },
  'Electrical': {
    type: 'service',
    keywords: 'electrician electrical service',
    osmTags: ['craft=electrician']
  },
  'Cleaning': {
    type: 'service',
    keywords: 'cleaning service housekeeping',
    osmTags: ['shop=cleaning']
  },
  'Painting': {
    type: 'service',
    keywords: 'painter painting service',
    osmTags: ['craft=painter']
  },
  'Carpentry': {
    type: 'service',
    keywords: 'carpenter carpentry furniture',
    osmTags: ['craft=carpenter']
  },
  'AC Repair': {
    type: 'service',
    keywords: 'AC repair air conditioner service',
    osmTags: ['shop=electronics', 'craft=hvac']
  },
  
  // Physical shops (searches for actual stores)
  'Car Wash': {
    type: 'shop',
    keywords: 'car wash auto detailing',
    osmTags: ['amenity=car_wash']
  },
  'Moving': {
    type: 'service',
    keywords: 'packers movers relocation',
    osmTags: ['office=moving_company']
  },
  'Salon': {
    type: 'shop',
    keywords: 'salon beauty parlour hair',
    osmTags: ['shop=beauty', 'shop=hairdresser']
  },
  
  // Pet Care (shows pet shops, vets, groomers)
  'Pet Care': {
    type: 'shop',
    keywords: 'pet shop veterinary clinic dog grooming',
    osmTags: ['shop=pet', 'amenity=veterinary']
  },
  
  // Tutoring (educational centers)
  'Tutoring': {
    type: 'service',
    keywords: 'tuition coaching classes',
    osmTags: ['amenity=school', 'office=educational_institution']
  },
  
  // Food Delivery (shows restaurants, food shops, groceries)
  'Food Delivery': {
    type: 'shop',
    keywords: 'restaurant food grocery supermarket',
    osmTags: ['amenity=restaurant', 'shop=convenience', 'shop=supermarket']
  }
};

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

// Estimate travel time
const estimateTravelTime = (distKm) => {
  if (distKm < 0.5) {
    const walkMinutes = Math.round((distKm / 5) * 60);
    return walkMinutes < 5 ? '5 min walk' : `${walkMinutes} min walk`;
  }
  const avgSpeed = 15; // km/h (city traffic)
  const timeMinutes = Math.round((distKm / avgSpeed) * 60);
  return timeMinutes < 5 ? '5 min' : `${timeMinutes} min`;
};

// Format distance
const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  } else {
    return `${distanceKm.toFixed(1)}km`;
  }
};

// Get raw distance in km
const getRawDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Try Google Places API
const tryGooglePlaces = async (lat, lon, category, radius) => {
  if (!GOOGLE_API_KEY) {
    console.log('⚠️  No Google API key');
    return null;
  }

  try {
    const categoryInfo = CATEGORY_MAPPING[category] || { keywords: category, type: 'service' };
    const url = 'https://places.googleapis.com/v1/places:searchText';

    console.log(`🔍 Google: "${categoryInfo.keywords}" (${categoryInfo.type})`);

    const response = await axios.post(url, {
      textQuery: `${categoryInfo.keywords} near me`,
      locationBias: {
        circle: {
          center: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
          radius: parseInt(radius)
        }
      },
      maxResultCount: 20
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.photos,places.id,places.internationalPhoneNumber,places.types'
      },
      timeout: 5000
    });

    if (response.data.places && response.data.places.length > 0) {
      console.log(`✅ Google: ${response.data.places.length} results`);
      
      const shops = response.data.places.map(p => {
        const shopLat = p.location?.latitude;
        const shopLon = p.location?.longitude;
        const distKm = getRawDistance(lat, lon, shopLat, shopLon);
        
        return {
          id: p.id || Math.random().toString(),
          name: p.displayName?.text || 'Shop',
          address: p.formattedAddress || '',
          lat: shopLat,
          lon: shopLon,
          rating: p.rating || 0,
          reviews: p.userRatingCount || 0,
          isOpen: p.currentOpeningHours?.openNow,
          phone: p.internationalPhoneNumber,
          distance: formatDistance(distKm),
          distanceKm: distKm,
          travelTime: estimateTravelTime(distKm),
          types: p.types || [],
          source: 'google',
          photoUrl: p.photos?.[0]?.name 
            ? `https://places.googleapis.com/v1/${p.photos[0].name}/media?maxWidthPx=400&key=${GOOGLE_API_KEY}`
            : null
        };
      });

      // Filter by 10 min travel time
      const filtered = shops.filter(shop => {
        const timeMinutes = parseInt(shop.travelTime);
        return timeMinutes <= 10;
      });

      filtered.sort((a, b) => a.distanceKm - b.distanceKm);
      
      console.log(`✅ After 10min filter: ${filtered.length} shops`);
      return filtered;
    }
    
    return null;
  } catch (error) {
    console.log(`⚠️  Google timeout: ${error.message}`);
    return null;
  }
};

// Try OpenStreetMap
const tryOpenStreetMap = async (lat, lon, category, radius) => {
  try {
    const categoryInfo = CATEGORY_MAPPING[category] || { osmTags: ['shop'], type: 'service' };
    
    // Build OSM query based on category tags
    const tagQueries = categoryInfo.osmTags.map(tag => {
      const [key, value] = tag.split('=');
      return `node["${key}"="${value}"](around:${radius},${lat},${lon})`;
    }).join(';');
    
    const query = `[out:json][timeout:5];(${tagQueries};);out body 15;`;
    
    console.log(`🔍 OSM: ${category} with tags: ${categoryInfo.osmTags.join(', ')}`);

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { 
        headers: { 'Content-Type': 'text/plain' },
        timeout: 5000
      }
    );

    if (response.data.elements && response.data.elements.length > 0) {
      console.log(`✅ OSM: ${response.data.elements.length} results`);
      
      const shops = response.data.elements.map(el => {
        const distKm = getRawDistance(lat, lon, el.lat, el.lon);
        
        return {
          id: el.id.toString(),
          name: el.tags?.name || `Local ${category}`,
          address: el.tags?.['addr:street'] || el.tags?.['addr:full'] || '',
          lat: el.lat,
          lon: el.lon,
          rating: 0,
          reviews: 0,
          phone: el.tags?.phone,
          distance: formatDistance(distKm),
          distanceKm: distKm,
          travelTime: estimateTravelTime(distKm),
          source: 'osm'
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
    const searchRadius = Math.min(parseInt(radius), 5000); // Max 5km

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔍 NEARBY ${category.toUpperCase()} SEARCH`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 GPS: (${lat}, ${lon})`);
    console.log(`📏 Radius: ${searchRadius}m`);
    console.log(`⏱️  Max: 10 minutes`);
    
    const categoryInfo = CATEGORY_MAPPING[category];
    if (categoryInfo) {
      console.log(`📂 Type: ${categoryInfo.type}`);
      console.log(`🔑 Keywords: ${categoryInfo.keywords}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let shops = null;

    // Try Google first
    shops = await tryGooglePlaces(lat, lon, category, searchRadius);

    // Fallback to OSM
    if (!shops || shops.length === 0) {
      console.log('Trying OSM fallback...\n');
      shops = await tryOpenStreetMap(lat, lon, category, searchRadius);
    }

    // If still no results, try wider search (5km)
    if (!shops || shops.length === 0) {
      console.log('Expanding to 5km...\n');
      shops = await tryGooglePlaces(lat, lon, category, 5000);
      
      if (!shops || shops.length === 0) {
        shops = await tryOpenStreetMap(lat, lon, category, 5000);
      }
    }

    const finalShops = shops || [];
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SEARCH COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Results: ${finalShops.length} ${category.toLowerCase()}`);
    if (finalShops.length > 0) {
      console.log(`📍 Nearest: ${finalShops[0].name}`);
      console.log(`   Distance: ${finalShops[0].distance}`);
      console.log(`   Travel: ${finalShops[0].travelTime}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    res.json({
      success: true,
      count: finalShops.length,
      data: finalShops,
      category: category,
      categoryType: categoryInfo?.type || 'service'
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.json({ 
      success: true, 
      count: 0,
      data: [],
      message: 'Search timed out'
    });
  }
};