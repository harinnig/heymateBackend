// backend/src/controllers/nearbyController.js - SAFE MINIMAL VERSION
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_PLACE_API || process.env.GOOGLE_API_KEY || '';

// Simple distance calculation
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

// Main controller
exports.getNearbyShops = async (req, res) => {
  try {
    const { latitude, longitude, category, radius = 3000 } = req.query;

    if (!latitude || !longitude || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }

    console.log(`Searching ${category} near (${latitude}, ${longitude})`);

    // Simple OpenStreetMap fallback (works without Google API)
    const query = `[out:json][timeout:10];
      (
        node["shop"](around:${radius},${latitude},${longitude});
        node["amenity"](around:${radius},${latitude},${longitude});
      );
      out body 15;`;

    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { 
        headers: { 'Content-Type': 'text/plain' },
        timeout: 8000 
      }
    );

    const shops = (response.data.elements || []).map(el => ({
      id: el.id.toString(),
      name: el.tags?.name || 'Local Shop',
      address: el.tags?.['addr:street'] || '',
      lat: el.lat,
      lon: el.lon,
      rating: 0,
      reviews: 0,
      phone: el.tags?.phone || null,
      distance: calculateDistance(latitude, longitude, el.lat, el.lon),
      source: 'osm'
    }));

    console.log(`Found ${shops.length} shops`);

    res.json({
      success: true,
      count: shops.length,
      data: shops
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      data: []
    });
  }
};