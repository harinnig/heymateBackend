// backend/src/controllers/nearbyController.js - FIXED VERSION
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API || process.env.GOOGLE_API_KEY || '';

// Haversine distance calculation
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c; // Distance in km
  
  if (d < 1) {
    return `${Math.round(d * 1000)}m`;
  } else {
    return `${d.toFixed(1)}km`;
  }
};

// Category mapping for better search
const CATEGORY_MAP = {
  'Plumbing': 'plumber',
  'Electrical': 'electrician',
  'Cleaning': 'cleaning service',
  'Painting': 'painter',
  'Carpentry': 'carpenter',
  'AC Repair': 'ac repair air conditioner',
  'Car Wash': 'car wash',
  'Moving': 'packers movers',
  'Salon': 'salon beauty',
  'Pet Care': 'pet shop veterinary',
  'Tutoring': 'tutor coaching',
  'Food Delivery': 'restaurant',
};

exports.getNearbyShops = async (req, res) => {
  try {
    const { latitude, longitude, category, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude required',
      });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const searchRadius = parseInt(radius);

    console.log(`🔍 Searching ${category} near (${lat}, ${lon}) within ${searchRadius}m`);

    // Try Google Places API if key is available
    if (GOOGLE_API_KEY) {
      try {
        const keyword = CATEGORY_MAP[category] || category;
        const url = 'https://places.googleapis.com/v1/places:searchText';
        
        const response = await axios.post(url, {
          textQuery: `${keyword} in Chennai`,
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lon },
              radius: searchRadius,
            },
          },
          maxResultCount: 20,
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.photos,places.id,places.internationalPhoneNumber',
          },
          timeout: 10000,
        });

        if (response.data.places && response.data.places.length > 0) {
          const shops = response.data.places
            .map(place => {
              const shopLat = place.location?.latitude;
              const shopLon = place.location?.longitude;
              const dist = calculateDistance(lat, lon, shopLat, shopLon);
              
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
                distance: dist,
                source: 'google',
              };
            })
            .filter(shop => {
              // Filter by actual distance (within radius)
              const distKm = parseFloat(shop.distance);
              const maxKm = searchRadius / 1000;
              return distKm <= maxKm;
            })
            .sort((a, b) => {
              const aNum = parseFloat(a.distance);
              const bNum = parseFloat(b.distance);
              return aNum - bNum;
            });

          console.log(`✅ Google Places: Found ${shops.length} shops`);
          
          return res.json({
            success: true,
            count: shops.length,
            data: shops,
          });
        }
      } catch (googleError) {
        console.error('Google API error:', googleError.message);
      }
    }

    // Fallback: Return empty array (frontend will use its own Google API)
    console.log('⚠️  Backend fallback - returning empty (frontend will handle)');
    res.json({
      success: true,
      count: 0,
      data: [],
      message: 'Using frontend Google Places API',
    });

  } catch (error) {
    console.error('Nearby shops error:', error.message);
    res.json({
      success: true,
      count: 0,
      data: [],
    });
  }
};