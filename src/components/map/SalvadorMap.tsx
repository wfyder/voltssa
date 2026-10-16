import * as turf from '@turf/turf';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CHARGING_DESERTS, INITIAL_VIEW } from '../../data/cityZones';
import { STATION_BY_ID, VEHICLE_BY_ID } from '../../data/salvadorStations';
import { maxPowerKw } from '../../lib/compatibility';
import { autonomyCircle, autonomyKm, stationsToFeatureCollection } from '../../lib/geo';
import { useStationViews } from '../../hooks/useStationViews';
import { useNavProgress } from '../../hooks/useNavProgress';
import { useAppStore } from '../../store/useAppStore';
import { applyNightTheme, MAP_STYLE_URL, mapHandle, removeNightTheme, setupTerrainAndBuildings } from './mapSetup';
import { StationMarker } from './StationMarker';
import { CameraControls } from './CameraControls';
import { buildCarModel, carLengthForZoom } from '../../lib/car3d';
import { viewPadding } from './viewPadding';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { salvadorProximity } from '../../lib/geolocation';

const ACCENT = '#facc15';

export function SalvadorMap() {
  const mapRef = useRef<MapRef | null>(null);
  // Quantised zoom: the 3D car is rebuilt so it keeps a constant on-screen size.
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
  const { all, visible } = useStationViews();

  const viewMode = useAppStore((s) => s.viewMode);
  const selectedStationId = useAppStore((s) => s.selectedStationId);
  const selectStation = useAppStore((s) => s.selectStation);
  const pickingLocation = useAppStore((s) => s.pickingLocation);
  const stationForm = useAppStore((s) => s.stationForm);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const userLocation = useAppStore((s) => s.userLocation);
  const vehicleId = useAppStore((s) => s.vehicleId);
  const batteryPct = useAppStore((s) => s.batteryPct);
  const routeState = useAppStore((s) => s.routeState);
  const nightMap = useAppStore((s) => s.nightMap);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const navigation = useAppStore((s) => s.navigation);
  const locationSource = useAppStore((s) => s.locationSource);
  const locationAccuracyM = useAppStore((s) => s.locationAccuracyM);
  const carMode = useAppStore((s) => s.carMode);
  const isMobile = useIsMobile();
  const navProgress = useNavProgress();
  const navigating = navigation !== null;
  const smartCity = viewMode === 'smartcity';

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    mapHandle.current = mapRef.current;
    setupTerrainAndBuildings(map);
    const state = useAppStore.getState();
    if (state.nightMap) applyNightTheme(map);
    // The map remounts when switching layouts (e.g. car mode): start on the driver, not the city view.
    if (state.userLocation && !state.navigation && salvadorProximity(state.userLocation).proximity !== 'far') {
      map.jumpTo({ center: [state.userLocation.lng, state.userLocation.lat], zoom: 14.5, padding: viewPadding('follow') });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    if (nightMap) applyNightTheme(map);
    else removeNightTheme(map);
    try {
      map.setSky(
        nightMap
          ? { 'sky-color': '#1a1a1a', 'horizon-color': '#2a2a2a', 'fog-color': '#1a1a1a' }
          : { 'sky-color': '#dfe7ee', 'horizon-color': '#f4f4f2', 'fog-color': '#f4f4f2' },
      );
    } catch {
      /* sky is cosmetic */
    }
  }, [nightMap]);

  useEffect(() => {
    if (!selectedStationId) return;
    const station = STATION_BY_ID[selectedStationId];
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [station.coords.lng, station.coords.lat],
      zoom: Math.max(map.getZoom(), 14.6),
      duration: 1200,
      padding: viewPadding('station'),
      essential: true,
    });
  }, [selectedStationId, sidebarOpen]);

  useEffect(() => {
    // While navigating the camera follows the car; reroutes must not re-frame the map.
    if (routeState.status !== 'ready' || useAppStore.getState().navigation) return;
    const [minX, minY, maxX, maxY] = turf.bbox(routeState.route.geometry);
    mapRef.current?.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: viewPadding('route'), duration: 1400, pitch: 55 },
    );
  }, [routeState, sidebarOpen]);

  // A fresh GPS fix: fly to the driver (unless they are far from Salvador or already driving).
  useEffect(() => {
    if (!userLocation || locationSource !== 'gps' || useAppStore.getState().navigation) return;
    if (salvadorProximity(userLocation).proximity === 'far') return;
    mapRef.current?.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 14.5,
      duration: 1400,
      padding: viewPadding('follow'),
      essential: true,
    });
  }, [userLocation, locationSource]);

  const onMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const state = useAppStore.getState();
      if (state.stationForm.picking) {
        state.setStationFormCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        return;
      }
      if (!state.pickingLocation) return;
      setUserLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    },
    [setUserLocation],
  );

  const rangeKm = autonomyKm(VEHICLE_BY_ID[vehicleId], batteryPct);
  const autonomy = useMemo(() => (userLocation ? autonomyCircle(userLocation, rangeKm) : null), [userLocation, rangeKm]);
  const accuracy = useMemo(
    () =>
      userLocation && locationSource === 'gps' && locationAccuracyM
        ? autonomyCircle(userLocation, Math.max(locationAccuracyM, 8) / 1000)
        : null,
    [userLocation, locationSource, locationAccuracyM],
  );

  const heatmapData = useMemo(
    () => stationsToFeatureCollection(all.map((v) => v.station), (s) => Math.min(1, maxPowerKw(s) / 77) + 0.35),
    [all],
  );

  const deserts = useMemo(
    () =>
      turf.featureCollection(
        CHARGING_DESERTS.map((d) =>
          turf.circle([d.coords.lng, d.coords.lat], d.radiusKm, { steps: 64, units: 'kilometers', properties: { id: d.id } }),
        ),
      ),
    [],
  );

  const routeFeature = routeState.status === 'ready' ? routeState.route.geometry : null;
  const alongKm = navProgress?.alongKm ?? 0;
  // During navigation: driven part in grey, remaining part in the accent colour.
  const routeSplit = useMemo(() => {
    if (!routeFeature || !navigating) return null;
    const total = turf.length(routeFeature, { units: 'kilometers' });
    const at = Math.min(Math.max(alongKm, 0), total);
    return {
      driven: at > 0.001 ? turf.lineSliceAlong(routeFeature, 0, at, { units: 'kilometers' }) : null,
      remaining: at < total - 0.001 ? turf.lineSliceAlong(routeFeature, at, total, { units: 'kilometers' }) : null,
    };
  }, [routeFeature, navigating, alongKm]);
  // Alternatives the planner did not pick, drawn faintly under the chosen route.
  const alternatives = useMemo(() => {
    if (routeState.status !== 'ready' || navigating) return null;
    const { options, chosenIndex } = routeState.route;
    const others = options.filter((_, i) => i !== chosenIndex).map((o) => o.geometry);
    return others.length ? turf.featureCollection(others) : null;
  }, [routeState, navigating]);
  const visibleIds = useMemo(() => new Set(visible.map((v) => v.station.id)), [visible]);

  // 3D car: the moving vehicle while navigating, otherwise the driver's current position.
  const carPosition = navigation?.position ?? userLocation;
  const carHeading = navigation?.heading ?? 0;
  const car3d = useMemo(
    () => (carPosition ? buildCarModel(carPosition, carHeading, carLengthForZoom(zoom, carPosition.lat)) : null),
    [carPosition, carHeading, zoom],
  );

  return (
    <div className="absolute inset-0" data-testid="map-container" data-view-mode={viewMode}>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLE_URL}
        maxPitch={78}
        onLoad={onLoad}
        onClick={onMapClick}
        onZoom={(e) => setZoom(Math.round(e.viewState.zoom * 4) / 4)}
        cursor={pickingLocation || stationForm.picking ? 'crosshair' : 'grab'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
      >
        {/* Phones and car mode zoom with gestures; the extra controls would cover touch targets. */}
        {!isMobile && !carMode && <NavigationControl position="bottom-right" visualizePitch />}
        {!isMobile && !carMode && <ScaleControl position="bottom-right" unit="metric" />}

        {autonomy && !navigating && (
          <Source id="ev-autonomy" type="geojson" data={autonomy}>
            <Layer id="ev-autonomy-fill" type="fill" paint={{ 'fill-color': ACCENT, 'fill-opacity': 0.06 }} />
            <Layer
              id="ev-autonomy-line"
              type="line"
              paint={{ 'line-color': ACCENT, 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }}
            />
          </Source>
        )}

        {accuracy && !navigating && (
          <Source id="ev-gps-accuracy" type="geojson" data={accuracy}>
            <Layer id="ev-gps-accuracy-fill" type="fill" paint={{ 'fill-color': ACCENT, 'fill-opacity': 0.12 }} />
          </Source>
        )}

        {alternatives && (
          <Source id="ev-route-alternatives" type="geojson" data={alternatives}>
            <Layer
              id="ev-route-alternatives-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#8a8a8a', 'line-width': 4, 'line-opacity': 0.55, 'line-dasharray': [1.5, 1.5] }}
            />
          </Source>
        )}

        {routeSplit?.driven && (
          <Source id="ev-route-driven" type="geojson" data={routeSplit.driven}>
            <Layer
              id="ev-route-driven-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#6b6b6b', 'line-width': 5, 'line-opacity': 0.8 }}
            />
          </Source>
        )}

        {routeFeature && (!routeSplit || routeSplit.remaining) && (
          <Source id="ev-route" type="geojson" data={routeSplit?.remaining ?? routeFeature}>
            <Layer
              id="ev-route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#0e0e0e', 'line-width': 7 }}
            />
            <Layer
              id="ev-route-core"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': ACCENT, 'line-width': 4 }}
            />
          </Source>
        )}

        {smartCity && (
          <>
            <Source id="ev-heat" type="geojson" data={heatmapData}>
              <Layer
                id="ev-heatmap"
                type="heatmap"
                paint={{
                  'heatmap-weight': ['get', 'weight'],
                  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 2],
                  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 26, 13, 50, 16, 80],
                  'heatmap-opacity': 0.7,
                  'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0,
                    'rgba(250,204,21,0)',
                    0.2,
                    'rgba(250,204,21,0.18)',
                    0.5,
                    'rgba(250,204,21,0.4)',
                    0.8,
                    'rgba(250,204,21,0.65)',
                    1,
                    'rgba(254,240,138,0.85)',
                  ],
                }}
              />
            </Source>
            <Source id="ev-deserts" type="geojson" data={deserts}>
              <Layer id="ev-deserts-fill" type="fill" paint={{ 'fill-color': '#ef4444', 'fill-opacity': 0.12 }} />
              <Layer id="ev-deserts-line" type="line" paint={{ 'line-color': '#ef4444', 'line-width': 1.5, 'line-dasharray': [3, 2] }} />
            </Source>
            {CHARGING_DESERTS.map((d) => (
              <Marker key={d.id} longitude={d.coords.lng} latitude={d.coords.lat} anchor="center">
                <div
                  data-testid={`desert-zone-${d.id}`}
                  className="pointer-events-none rounded border border-red-500/40 bg-surface px-2 py-1 text-center text-xs shadow-sm"
                >
                  <div className="font-medium text-fg">{d.name}</div>
                  <div className="text-[11px] text-red-400">sem recarga pública</div>
                </div>
              </Marker>
            ))}
          </>
        )}

        {all
          .filter((v) => visibleIds.has(v.station.id) || v.station.id === selectedStationId)
          .map((v) => (
            <StationMarker
              key={v.station.id}
              view={v}
              selected={v.station.id === selectedStationId}
              compact={smartCity}
              onSelect={selectStation}
            />
          ))}

        {stationForm.open && stationForm.coords && (
          <Marker longitude={stationForm.coords.lng} latitude={stationForm.coords.lat} anchor="bottom">
            <svg width="26" height="32" viewBox="0 0 24 30" data-testid="station-draft-marker">
              <path
                d="M12 29s-9.5-9.2-9.5-16.5a9.5 9.5 0 0 1 19 0C21.5 19.8 12 29 12 29Z"
                fill="#141414"
                stroke="#facc15"
                strokeWidth="2"
                strokeDasharray="3 2"
              />
              <path d="M12 8v9M7.5 12.5h9" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Marker>
        )}

        {car3d && (
          <Source id="ev-car-3d" type="geojson" data={car3d}>
            <Layer
              id="ev-car-3d"
              type="fill-extrusion"
              paint={{
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-base': ['get', 'base'],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-opacity': 1,
                'fill-extrusion-vertical-gradient': true,
              }}
            />
          </Source>
        )}

        {/* Invisible anchors so E2E tests can locate the car (the 3D model has no DOM node). */}
        {navigation && (
          <Marker longitude={navigation.position.lng} latitude={navigation.position.lat} anchor="center">
            <span data-testid="nav-vehicle-marker" data-heading={Math.round(navigation.heading)} className="block h-px w-px" />
          </Marker>
        )}
        {userLocation && !navigating && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
            <span data-testid="user-location-marker" className="block h-px w-px" />
          </Marker>
        )}
      </Map>

      {stationForm.picking && (
        <div
          data-testid="picking-station-hint"
          className="absolute top-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg shadow"
        >
          Clique no mapa onde fica o eletroposto
          <button
            type="button"
            data-testid="btn-cancel-station-pick"
            onClick={() => useAppStore.getState().setStationFormPicking(false)}
            className="underline"
          >
            voltar
          </button>
        </div>
      )}

      {pickingLocation && (
        <div
          data-testid="picking-location-hint"
          className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-fg shadow"
        >
          Clique no mapa para definir sua localização
        </div>
      )}

      {!navigating && !carMode && <CameraControls />}
    </div>
  );
}
