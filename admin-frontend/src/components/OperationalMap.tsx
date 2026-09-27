import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

interface MapNeedItem {
  need_id: number
  report_id: number
  latitude: number
  longitude: number
  location: string
  category: string
  people_affected: number
  verified_quantity: number
  unit: string
  allocated_quantity: number
  delivered_quantity: number
  uncovered_quantity: number
  coverage_percent: number
}

interface MapNeedsResponse {
  active_verified_needs_count: number
  active_people_affected: number
  items: MapNeedItem[]
}

interface ResourceMapInfo {
  id: number
  name: string
  latitude?: number
  longitude?: number
}
interface AllocationMapInfo {
  need_id: number
  resource_id: number
}

interface OperationalMapProps {
  apiBaseUrl: string
  refreshTrigger?: number
  resources?: ResourceMapInfo[]
  allocations?: AllocationMapInfo[]
}

// Marker icon helpers
const createCustomMarkerIcon = (uncovered: number, allocated: number) => {
  let color = '#ef4444' // active / uncovered (red)
  if (uncovered <= 0) {
    color = '#10b981' // fully covered (green)
  } else if (allocated > 0) {
    color = '#3b82f6' // response underway / allocated (blue)
  }

  return L.divIcon({
    className: 'custom-map-marker-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 10px ${color}80, 0 2px 5px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      ">
        <div style="background-color: #ffffff; width: 6px; height: 6px; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

// Auto-center map helper
function AutoCenterMap({ items }: { items: MapNeedItem[] }) {
  const map = useMap()
  useEffect(() => {
    if (items.length > 0) {
      const bounds = L.latLngBounds(items.map((it) => [it.latitude, it.longitude]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }
  }, [items, map])
  return null
}

// Map resizer helper
function MapResizer() {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 100)
    return () => clearTimeout(timer)
  }, [map])
  return null
}

function AutoFitRoute({ routeGeometry }: { routeGeometry: any }) {
  const map = useMap()
  useEffect(() => {
    if (routeGeometry && routeGeometry.coordinates) {
      const latLngs = routeGeometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number])
      const bounds = L.latLngBounds(latLngs)
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [routeGeometry, map])
  return null
}

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const dPhi = (lat2-lat1) * Math.PI/180;
  const dLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLambda/2) * Math.sin(dLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

const landmarkMarkerIcon = L.divIcon({
  className: 'landmark-map-marker-icon',
  html: `
    <div style="
      background-color: #8b5cf6;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 0 10px #8b5cf680, 0 2px 5px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="background-color: #ffffff; width: 6px; height: 6px; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
})

const resourceMarkerIcon = L.divIcon({
  className: 'resource-map-marker-icon',
  html: `
    <div style="
      background-color: #3b82f6;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 0 10px #3b82f680, 0 2px 5px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="background-color: #ffffff; width: 6px; height: 6px;"></div>
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
})

export function OperationalMap({ apiBaseUrl, refreshTrigger, resources, allocations }: OperationalMapProps) {
  const [mapState, setMapState] = useState<'loading' | 'connected' | 'failed'>('loading')
  const [mapData, setMapData] = useState<MapNeedsResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const [routeState, setRouteState] = useState<{
    activeRoute: any,
    routeInfo: {distance: number, duration: number, resourceName: string, isLandmark?: boolean} | null,
    routeError: string,
    resourceLocation: [number, number] | null,
    triggerKey: number | undefined,
    landmarkData: { name: string, type: string, lat: number, lon: number, distance: number } | null,
    landmarkError: string
  }>({
    activeRoute: null,
    routeInfo: null,
    routeError: '',
    resourceLocation: null,
    triggerKey: refreshTrigger,
    landmarkData: null,
    landmarkError: ''
  })

  // Derive route validity: if refreshTrigger changes, the stored route is instantly considered invalid
  const isRouteValid = routeState.triggerKey === refreshTrigger
  const activeRoute = isRouteValid ? routeState.activeRoute : null
  const routeInfo = isRouteValid ? routeState.routeInfo : null
  const routeError = isRouteValid ? routeState.routeError : ''
  const resourceLocation = isRouteValid ? routeState.resourceLocation : null
  const landmarkData = isRouteValid ? routeState.landmarkData : null
  const landmarkError = isRouteValid ? routeState.landmarkError : ''

  const [fetchingRoute, setFetchingRoute] = useState(false)
  const [fetchingLandmark, setFetchingLandmark] = useState(false)

  useEffect(() => {
    let ignore = false

    async function fetchMapNeeds() {
      setMapState('loading')
      setErrorMsg('')
      try {
        const res = await fetch(`${apiBaseUrl}/map/needs?t=${refreshTrigger}`)
        if (!res.ok) {
          throw new Error(`Map API returned status ${res.status}`)
        }
        const data: MapNeedsResponse = await res.json()
        if (!ignore) {
          setMapData(data)
          setMapState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setMapState('failed')
          setErrorMsg(err instanceof Error ? err.message : 'Failed to load map data')
        }
      }
    }

    fetchMapNeeds()

    return () => {
      ignore = true
    }
  }, [apiBaseUrl, refreshTrigger])

  const defaultCenter: [number, number] = [12.9716, 77.5946] // Bangalore default coordinates

  // Filter out any items with invalid coordinates to prevent crashes and only show active needs
  const validItems = mapData?.items.filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.uncovered_quantity > 0) || []

  const handleShowRoute = async (item: MapNeedItem) => {
    setRouteState(prev => ({
      ...prev,
      activeRoute: null,
      routeInfo: null,
      resourceLocation: null,
      routeError: '',
      triggerKey: refreshTrigger
    }))

    if (!allocations || !resources) {
      setRouteState(prev => ({ ...prev, routeError: 'Route unavailable: resource data missing' }))
      return
    }

    const allocation = allocations.find(a => a.need_id === item.need_id)
    if (!allocation) {
      setRouteState(prev => ({ ...prev, routeError: 'Route unavailable: no allocation exists' }))
      return
    }

    const resource = resources.find(r => r.id === allocation.resource_id)
    if (!resource || typeof resource.latitude !== 'number' || typeof resource.longitude !== 'number') {
      setRouteState(prev => ({ ...prev, routeError: 'Route unavailable: resource coordinates missing' }))
      return
    }

    setFetchingRoute(true)
    try {
      const resLat = resource.latitude
      const resLng = resource.longitude
      const needLat = item.latitude
      const needLng = item.longitude

      const url = `https://router.project-osrm.org/route/v1/driving/${resLng},${resLat};${needLng},${needLat}?overview=full&geometries=geojson`

      const response = await fetch(url)
      if (!response.ok) throw new Error('OSRM API returned ' + response.status)

      const data = await response.json()
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No route found')
      }

      const route = data.routes[0]
      setRouteState({
        activeRoute: route.geometry,
        routeInfo: {
          distance: route.distance,
          duration: route.duration,
          resourceName: resource.name
        },
        routeError: '',
        resourceLocation: [resLat, resLng],
        triggerKey: refreshTrigger,
        landmarkData: null,
        landmarkError: ''
      })

    } catch (err) {
      setRouteState(prev => ({ ...prev, routeError: 'Route unavailable: ' + (err instanceof Error ? err.message : String(err)) }))
    } finally {
      setFetchingRoute(false)
    }
  }

  const handleFindLandmark = async (item: MapNeedItem) => {
    setRouteState(prev => ({
      ...prev,
      activeRoute: null,
      routeInfo: null,
      resourceLocation: null,
      routeError: '',
      landmarkData: null,
      landmarkError: '',
      triggerKey: refreshTrigger
    }))

    setFetchingLandmark(true)
    try {
      const needLat = item.latitude
      const needLng = item.longitude

      const query = `
        [out:json];
        (
          nwr["amenity"~"hospital|police|fire_station|community_centre|school|college"](around:3000,${needLat},${needLng});
          nwr["office"="government"](around:3000,${needLat},${needLng});
        );
        out center;
      `

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      })

      if (!response.ok) throw new Error('Overpass API returned ' + response.status)
      const data = await response.json()

      if (!data.elements || data.elements.length === 0) {
        setRouteState(prev => ({ ...prev, landmarkError: 'No nearby reference landmark found.', triggerKey: refreshTrigger }))
        return
      }

      let nearestDist = Infinity
      let nearestElem: any = null
      let nearestLat = 0
      let nearestLng = 0

      data.elements.forEach((el: any) => {
        const lat = el.lat || el.center?.lat
        const lon = el.lon || el.center?.lon
        if (lat && lon) {
          const dist = calculateHaversineDistance(needLat, needLng, lat, lon)
          if (dist < nearestDist) {
            nearestDist = dist
            nearestElem = el
            nearestLat = lat
            nearestLng = lon
          }
        }
      })

      if (!nearestElem) {
        setRouteState(prev => ({ ...prev, landmarkError: 'No nearby reference landmark found.', triggerKey: refreshTrigger }))
        return
      }

      const type = nearestElem.tags?.amenity || nearestElem.tags?.office || 'Landmark'
      const name = nearestElem.tags?.name || 'Unnamed ' + type

      let routeGeo = null
      let routeDistance = 0
      let routeDuration = 0
      let routeErrStr = ''

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${nearestLng},${nearestLat};${needLng},${needLat}?overview=full&geometries=geojson`
        const osrmRes = await fetch(url)
        if (osrmRes.ok) {
          const osrmData = await osrmRes.json()
          if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
            const route = osrmData.routes[0]
            routeGeo = route.geometry
            routeDistance = route.distance
            routeDuration = route.duration
          } else {
             routeErrStr = 'Reference route unavailable.'
          }
        } else {
           routeErrStr = 'Reference route unavailable.'
        }
      } catch {
        routeErrStr = 'Reference route unavailable.'
      }

      setRouteState({
        activeRoute: routeGeo,
        routeInfo: routeGeo ? {
          distance: routeDistance,
          duration: routeDuration,
          resourceName: name,
          isLandmark: true
        } : null,
        routeError: routeErrStr,
        resourceLocation: null,
        landmarkData: { name, type, lat: nearestLat, lon: nearestLng, distance: nearestDist },
        landmarkError: '',
        triggerKey: refreshTrigger
      })

    } catch {
      setRouteState(prev => ({ ...prev, landmarkError: 'Nearby landmark service unavailable.', triggerKey: refreshTrigger }))
    } finally {
      setFetchingLandmark(false)
    }
  }

  return (
    <div style={{
      backgroundColor: 'var(--panel-bg)',
      border: '1px solid var(--panel-border)',
      borderRadius: '0.75rem',
      boxShadow: 'var(--shadow-md)',
      marginTop: '2rem',
      marginBottom: '2rem',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--panel-border)',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-main)' }}>Operational Map</span>
          <span className="status-badge connected">
            <span className="status-dot"></span>
            Active Verified Needs Only
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', marginLeft: '0.5rem' }}>
            Completed needs are hidden from the active operational map.
          </span>
        </div>
        {mapState === 'connected' && mapData && (
          <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.875rem' }}>
            <div>
              <span className="info-label" style={{ marginRight: '0.375rem' }}>Active Verified Needs:</span>
              <strong style={{ color: '#f59e0b', fontSize: '1.125rem' }}>{mapData.active_verified_needs_count}</strong>
            </div>
            <div>
              <span className="info-label" style={{ marginRight: '0.375rem' }}>People Affected:</span>
              <strong style={{ color: '#3b82f6', fontSize: '1.125rem' }}>{mapData.active_people_affected}</strong>
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        {mapState === 'loading' && (
          <div className="loading-state" style={{ padding: '3rem' }}>Loading map data...</div>
        )}

        {mapState === 'failed' && (
          <div className="error-box" style={{ margin: '1.5rem' }}>
            <strong>Map Data Unavailable:</strong> {errorMsg}
          </div>
        )}

        {mapState === 'connected' && validItems.length === 0 && (
          <div className="empty-state" style={{ margin: '1.5rem', border: '1px dashed var(--panel-border)' }}>
            No verified needs with map coordinates yet.
          </div>
        )}

        {mapState === 'connected' && validItems.length > 0 && (
          <div className="operational-map-leaflet">
            <MapContainer
              center={validItems.length > 0 ? [validItems[0].latitude, validItems[0].longitude] : defaultCenter}
              zoom={11}
              className="operational-map-leaflet"
              style={{ backgroundColor: '#0b1220' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapResizer />
              {validItems.length > 0 && !activeRoute && <AutoCenterMap items={validItems} />}
              {activeRoute && <AutoFitRoute routeGeometry={activeRoute} />}

              {activeRoute && (
                <GeoJSON
                  key={JSON.stringify(activeRoute)}
                  data={activeRoute}
                  style={{ color: '#3b82f6', weight: 4, opacity: 0.8 }}
                />
              )}

              {resourceLocation && (
                <Marker position={resourceLocation} icon={resourceMarkerIcon}>
                  <Popup>
                    <strong>Resource Origin</strong>
                    {routeInfo && <div>{routeInfo.resourceName}</div>}
                  </Popup>
                </Marker>
              )}

              {landmarkData && (
                <Marker position={[landmarkData.lat, landmarkData.lon]} icon={landmarkMarkerIcon}>
                  <Popup>
                    <strong>Potential Staging Point</strong>
                    <div>{landmarkData.name}</div>
                    <div style={{ textTransform: 'capitalize', color: '#64748b' }}>{landmarkData.type.replace('_', ' ')}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#f59e0b' }}>Map reference only — verify local safety conditions.</div>
                  </Popup>
                </Marker>
              )}

              {validItems.map((item) => {
                const markerIcon = createCustomMarkerIcon(item.uncovered_quantity, item.allocated_quantity)
                return (
                  <Marker
                    key={item.need_id}
                    position={[Number(item.latitude), Number(item.longitude)]}
                    icon={markerIcon}
                  >
                    <Popup className="custom-map-popup">
                      <div style={{ color: '#0f172a', fontFamily: 'inherit', padding: '0.25rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.25rem' }}>
                          Verified Need #{item.need_id}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                          Source Report #{item.report_id} &bull; {item.category.toUpperCase()}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', fontSize: '0.825rem' }}>
                          <span style={{ color: '#64748b' }}>Location:</span>
                          <strong>{item.location}</strong>

                          <span style={{ color: '#64748b' }}>People Affected:</span>
                          <strong>{item.people_affected}</strong>

                          <span style={{ color: '#64748b' }}>Verified Qty:</span>
                          <strong>{item.verified_quantity} {item.unit}</strong>

                          <span style={{ color: '#64748b' }}>Delivered Qty:</span>
                          <strong>{item.delivered_quantity} {item.unit}</strong>

                          <span style={{ color: '#64748b' }}>Uncovered Qty:</span>
                          <strong style={{ color: item.uncovered_quantity > 0 ? '#dc2626' : '#16a34a' }}>
                            {item.uncovered_quantity} {item.unit}
                          </strong>

                          <span style={{ color: '#64748b' }}>Coverage %:</span>
                          <strong>{item.coverage_percent}%</strong>
                        </div>

                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                          {item.allocated_quantity > 0 ? (
                            <>
                              <button
                                className="btn-action confirm"
                                style={{ width: '100%', fontSize: '0.8rem', padding: '0.25rem', height: 'auto' }}
                                onClick={() => handleShowRoute(item)}
                                disabled={fetchingRoute}
                              >
                                {fetchingRoute ? 'Calculating...' : 'Show Suggested Route'}
                              </button>
                              {routeError && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{routeError}</div>}
                              {routeInfo && activeRoute && !routeInfo.isLandmark && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', backgroundColor: '#f1f5f9', padding: '0.5rem', borderRadius: '4px' }}>
                                  <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: '0.25rem' }}>Suggested Route</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.5rem' }}>
                                    <span style={{ color: '#64748b' }}>Resource:</span>
                                    <strong>{routeInfo.resourceName}</strong>
                                    <span style={{ color: '#64748b' }}>Destination:</span>
                                    <strong>Verified Need #{item.need_id}</strong>
                                    <span style={{ color: '#64748b' }}>Est. Distance:</span>
                                    <strong>{(routeInfo.distance / 1000).toFixed(1)} km</strong>
                                    <span style={{ color: '#64748b' }}>Est. Duration:</span>
                                    <strong>{Math.ceil(routeInfo.duration / 60)} min</strong>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                className="btn-action"
                                style={{ width: '100%', fontSize: '0.8rem', padding: '0.25rem', height: 'auto', backgroundColor: '#8b5cf6', color: 'white', border: 'none' }}
                                onClick={() => handleFindLandmark(item)}
                                disabled={fetchingLandmark}
                              >
                                {fetchingLandmark ? 'Searching...' : 'Find Nearby Landmark'}
                              </button>
                              {landmarkError && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{landmarkError}</div>}
                              {routeError && <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>{routeError}</div>}
                              {landmarkData && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', padding: '0.5rem', borderRadius: '4px' }}>
                                  <div style={{ fontWeight: 600, color: '#7e22ce', marginBottom: '0.25rem' }}>Nearest Reference Landmark</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.5rem' }}>
                                    <span style={{ color: '#64748b' }}>Name:</span>
                                    <strong>{landmarkData.name}</strong>
                                    <span style={{ color: '#64748b' }}>Type:</span>
                                    <strong style={{ textTransform: 'capitalize' }}>{landmarkData.type.replace('_', ' ')}</strong>
                                    <span style={{ color: '#64748b' }}>Approx. Dist:</span>
                                    <strong>{(landmarkData.distance / 1000).toFixed(1)} km</strong>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#b45309', fontWeight: 500, lineHeight: '1.2' }}>
                                    Status: Reference point only — verify local safety conditions.
                                  </div>

                                  {routeInfo && activeRoute && routeInfo.isLandmark && (
                                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #e9d5ff', paddingTop: '0.5rem' }}>
                                      <div style={{ fontWeight: 600, color: '#7e22ce', marginBottom: '0.25rem' }}>Reference Route from Nearby Landmark</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.5rem' }}>
                                        <span style={{ color: '#64748b' }}>Estimated Distance:</span>
                                        <strong>{(routeInfo.distance / 1000).toFixed(1)} km</strong>
                                        <span style={{ color: '#64748b' }}>Estimated Duration:</span>
                                        <strong>{Math.ceil(routeInfo.duration / 60)} min</strong>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  )
}
