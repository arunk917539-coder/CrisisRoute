import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
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

interface OperationalMapProps {
  apiBaseUrl: string
  refreshTrigger?: number
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

export function OperationalMap({ apiBaseUrl, refreshTrigger }: OperationalMapProps) {
  const [mapState, setMapState] = useState<'loading' | 'connected' | 'failed'>('loading')
  const [mapData, setMapData] = useState<MapNeedsResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    let ignore = false

    async function fetchMapNeeds() {
      setMapState('loading')
      setErrorMsg('')
      try {
        const res = await fetch(`${apiBaseUrl}/map/needs`)
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

  return (
    <div className="status-card" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="card-title">Operational Map</span>
          <span className="status-badge connected">
            <span className="status-dot"></span>
            Verified Needs Only
          </span>
        </div>
        {mapState === 'connected' && mapData && (
          <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.875rem' }}>
            <div>
              <span className="info-label" style={{ marginRight: '0.375rem' }}>Active Verified Needs:</span>
              <strong style={{ color: '#f59e0b', fontSize: '1rem' }}>{mapData.active_verified_needs_count}</strong>
            </div>
            <div>
              <span className="info-label" style={{ marginRight: '0.375rem' }}>People Affected:</span>
              <strong style={{ color: '#3b82f6', fontSize: '1rem' }}>{mapData.active_people_affected}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="card-body" style={{ padding: '0', position: 'relative' }}>
        {mapState === 'loading' && (
          <div className="loading-state" style={{ padding: '2rem' }}>Loading map data...</div>
        )}

        {mapState === 'failed' && (
          <div className="error-box" style={{ margin: '1rem' }}>
            <strong>Map Data Unavailable:</strong> {errorMsg}
          </div>
        )}

        {mapState === 'connected' && mapData && mapData.items.length === 0 && (
          <div className="empty-state" style={{ margin: '1rem', border: '1px dashed var(--panel-border, #263247)' }}>
            No verified needs with map coordinates yet.
          </div>
        )}

        {mapState === 'connected' && mapData && (
          <div style={{ height: '450px', width: '100%', borderRadius: '0 0 10px 10px', overflow: 'hidden', position: 'relative' }}>
            <MapContainer
              center={mapData.items.length > 0 ? [mapData.items[0].latitude, mapData.items[0].longitude] : defaultCenter}
              zoom={11}
              style={{ height: '100%', width: '100%', backgroundColor: '#0b1220' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {mapData.items.length > 0 && <AutoCenterMap items={mapData.items} />}

              {mapData.items.map((item) => {
                const markerIcon = createCustomMarkerIcon(item.uncovered_quantity, item.allocated_quantity)
                return (
                  <Marker
                    key={item.need_id}
                    position={[item.latitude, item.longitude]}
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
