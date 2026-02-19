// backend/src/controllers/nearbyController.js - MINIMAL WORKING VERSION
const axios = require('axios');

// Simple working version - just OpenStreetMap
exports.getNearbyShops = async (req, res) => {
  try {
    const { latitude, longitude, category, radius = 5000 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'latitude and longitude required',
      });
    }

    console.log(`🔍 Searching ${category} near (${latitude}, ${longitude})`);

    // Simple OSM query
    const query = `[out:json][timeout:15];
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
        timeout: 10000 
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
      source: 'osm',
    }));

    res.json({
      success: true,
      count: shops.length,
      data: shops,
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