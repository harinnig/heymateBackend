// frontend/src/components/NearbyShopsTab.js - 100KM MAX
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  Image, Linking, StyleSheet, Alert,
} from 'react-native';
import { fetchNearbyShops } from '../utils/googlePlaces';

const NearbyShopsTab = ({ category, userLocation, theme }) => {
  const [shops, setShops]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [radius, setRadius]     = useState(5); // Start with 5km

  useEffect(() => {
    if (userLocation?.latitude && userLocation?.longitude) {
      loadShops();
    } else {
      setLoading(false);
      setError('Location not available');
    }
  }, [category, userLocation, radius]);

  const loadShops = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try with current radius first
      let result = await fetchNearbyShops(
        userLocation.latitude,
        userLocation.longitude,
        category,
        radius * 1000
      );
      
      // If no results and radius < 100km, try expanding
      if ((!result.shops || result.shops.length === 0) && radius < 100) {
        console.log(`No shops at ${radius}km, trying wider search...`);
        
        // Try 10km
        if (radius < 10) {
          result = await fetchNearbyShops(
            userLocation.latitude,
            userLocation.longitude,
            category,
            10000
          );
          if (result.shops && result.shops.length > 0) {
            setRadius(10);
          }
        }
        
        // Still nothing? Try 20km
        if ((!result.shops || result.shops.length === 0) && radius < 20) {
          result = await fetchNearbyShops(
            userLocation.latitude,
            userLocation.longitude,
            category,
            20000
          );
          if (result.shops && result.shops.length > 0) {
            setRadius(20);
          }
        }
        
        // Still nothing? Try 50km
        if ((!result.shops || result.shops.length === 0) && radius < 50) {
          result = await fetchNearbyShops(
            userLocation.latitude,
            userLocation.longitude,
            category,
            50000
          );
          if (result.shops && result.shops.length > 0) {
            setRadius(50);
          }
        }
        
        // Last resort: 100km
        if ((!result.shops || result.shops.length === 0) && radius < 100) {
          result = await fetchNearbyShops(
            userLocation.latitude,
            userLocation.longitude,
            category,
            100000
          );
          if (result.shops && result.shops.length > 0) {
            setRadius(100);
          }
        }
      }
      
      if (result.success) {
        // Filter to max 100km
        const filtered = (result.shops || []).filter(shop => {
          const distKm = parseFloat(shop.distance);
          return distKm <= 100;
        });
        setShops(filtered);
      } else {
        setError(result.error || 'Failed to fetch shops');
      }
    } catch (e) {
      setError('Failed to load shops');
    } finally {
      setLoading(false);
    }
  };

  const openInMaps = (shop) => {
    const url = shop.directionsUrl || shop.mapsUrl;
    if (url) {
      Linking.openURL(url).catch(() =>
        Alert.alert('Error', 'Could not open Google Maps')
      );
    }
  };

  const renderStars = (rating) => {
    if (!rating) return null;
    const stars = Math.round(rating);
    return '⭐'.repeat(Math.min(stars, 5));
  };

  const renderShop = ({ item }) => (
    <TouchableOpacity
      style={[styles.shopCard, { backgroundColor: theme?.cardBackground || '#fff' }]}
      onPress={() => openInMaps(item)}
      activeOpacity={0.85}
    >
      {/* Photo */}
      <View style={styles.shopImageWrap}>
        {item.photoUrl ? (
          <Image
            source={{ uri: item.photoUrl }}
            style={styles.shopImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.shopImagePlaceholder, { backgroundColor: '#dbeafe' }]}>
            <Text style={{ fontSize: 32 }}>🏪</Text>
          </View>
        )}
        {/* Open/Closed badge */}
        {item.isOpen !== undefined && (
          <View style={[styles.openBadge, { backgroundColor: item.isOpen ? '#dcfce7' : '#fee2e2' }]}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: item.isOpen ? '#16a34a' : '#dc2626' }}>
              {item.isOpen ? '● OPEN' : '● CLOSED'}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.shopInfo}>
        <Text style={[styles.shopName, { color: theme?.textPrimary || '#1f2937' }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.shopAddr, { color: theme?.textSecondary || '#6b7280' }]} numberOfLines={2}>
          📍 {item.address}
        </Text>

        {/* Rating + Distance */}
        <View style={styles.shopMeta}>
          {item.rating && (
            <View style={styles.ratingWrap}>
              <Text style={styles.ratingStars}>{renderStars(item.rating)}</Text>
              <Text style={styles.ratingText}>{item.rating} ({item.totalRatings})</Text>
            </View>
          )}
          {item.distance && (
            <View style={styles.distWrap}>
              <Text style={styles.distText}>📏 {item.distance}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.shopActions}>
          <TouchableOpacity
            style={styles.dirBtn}
            onPress={() => openInMaps(item)}
          >
            <Text style={styles.dirBtnTxt}>🗺️ Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: '#eff6ff' }]}
            onPress={() => Linking.openURL(`https://www.google.com/maps/place/?q=place_id:${item.placeId}`)}
          >
            <Text style={[styles.callBtnTxt, { color: '#2563eb' }]}>View on Maps</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── Radius Selector (MAX 100KM) ──
  const RadiusSelector = () => (
    <View style={styles.radiusRow}>
      <Text style={[styles.radiusLabel, { color: theme?.textSecondary || '#6b7280' }]}>Search radius:</Text>
      {[5, 10, 20, 50, 100].map(r => (
        <TouchableOpacity
          key={r}
          style={[styles.radiusBtn, { backgroundColor: radius === r ? '#2563eb' : (theme?.cardBackground || '#f1f5f9') }]}
          onPress={() => setRadius(r)}
        >
          <Text style={[styles.radiusBtnTxt, { color: radius === r ? '#fff' : (theme?.textPrimary || '#374151') }]}>
            {r}km
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ color: theme?.textSecondary || '#6b7280', marginTop: 12 }}>
          Searching nearby {category} shops...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 50 }}>⚠️</Text>
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme?.textPrimary || '#1f2937', marginTop: 12 }}>
          {error}
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadShops}>
          <Text style={styles.retryBtnTxt}>🔄 Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (shops.length === 0) {
    return (
      <View>
        <RadiusSelector />
        <View style={styles.center}>
          <Text style={{ fontSize: 60 }}>🔍</Text>
          <Text style={[styles.emptyTitle, { color: theme?.textPrimary || '#1f2937' }]}>
            No shops found nearby
          </Text>
          <Text style={[styles.emptySub, { color: theme?.textSecondary || '#6b7280' }]}>
            No {category} shops found within {radius}km
          </Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
            Try increasing the search radius (max 100km)
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <RadiusSelector />
      <Text style={[styles.resultCount, { color: theme?.textSecondary || '#6b7280' }]}>
        {shops.length} {category} shops found within {radius}km (max 100km)
      </Text>
      <FlatList
        data={shops}
        keyExtractor={item => item.id}
        renderItem={renderShop}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default NearbyShopsTab;

const styles = StyleSheet.create({
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  radiusRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 6, flexWrap: 'wrap' },
  radiusLabel:        { fontSize: 13, fontWeight: '600', marginRight: 4 },
  radiusBtn:          { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  radiusBtnTxt:       { fontSize: 12, fontWeight: '700' },
  resultCount:        { fontSize: 12, paddingHorizontal: 16, marginBottom: 8 },
  shopCard:           { borderRadius: 16, marginHorizontal: 16, marginBottom: 14, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, overflow: 'hidden' },
  shopImageWrap:      { position: 'relative' },
  shopImage:          { width: '100%', height: 160 },
  shopImagePlaceholder:{ width: '100%', height: 120, justifyContent: 'center', alignItems: 'center' },
  openBadge:          { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  shopInfo:           { padding: 14 },
  shopName:           { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  shopAddr:           { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  shopMeta:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  ratingWrap:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingStars:        { fontSize: 12 },
  ratingText:         { fontSize: 12, color: '#6b7280' },
  distWrap:           { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  distText:           { fontSize: 12, color: '#374151', fontWeight: '600' },
  shopActions:        { flexDirection: 'row', gap: 10 },
  dirBtn:             { flex: 1, backgroundColor: '#2563eb', borderRadius: 10, padding: 10, alignItems: 'center' },
  dirBtnTxt:          { color: '#fff', fontWeight: '700', fontSize: 13 },
  callBtn:            { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  callBtnTxt:         { fontWeight: '700', fontSize: 13 },
  emptyTitle:         { fontSize: 18, fontWeight: 'bold', marginTop: 12 },
  emptySub:           { fontSize: 14, textAlign: 'center', marginTop: 6, color: '#6b7280' },
  retryBtn:           { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16 },
  retryBtnTxt:        { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});