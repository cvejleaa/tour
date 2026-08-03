// ---------------------------------------------------------------------------
// LiveMapCard – kompakt live-kort på forsiden under etapen: ruten som linje
// (racecenterets checkpoints) og grupperne på vejen (udbrud/hovedfelt) som
// prikker, samme kortgrundlag som letours eget racecenter (Esri World Topo).
// Bevidst lavt (220 px) så det ikke stjæler forsiden. Skjuler sig selv helt
// hvis data mangler — spillet virker uændret.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLiveMap } from './useLiveMap';
import { groupSummary, ridersForBibs } from './liveMapUtils';

const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Kort: Esri · Data: letour.fr';

// Udbruddet (forreste gruppe) rød som på TV-grafikken; resten mørkeblå.
const GROUP_COLORS = ['#c8102e', '#1d4ed8', '#7c3aed', '#0f766e'];

export default function LiveMapCard({ stage, enabled }) {
  const { data, failed } = useLiveMap(stage?.number ?? null, enabled);
  const containerRef = useRef(null);
  const mapRef = useRef(null); // {map, routeLayer, groupLayer}

  const route = useMemo(() => data?.route || [], [data]);
  const groups = useMemo(() => data?.groups || [], [data]);
  const show = !failed && route.length >= 2 && groups.length > 0;

  // Kort-instansen oprettes én gang og genbruges på tværs af polls.
  useEffect(() => {
    if (!show || !containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false, // siden skal kunne scrolles hen over kortet
      attributionControl: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 15 }).addTo(map);
    mapRef.current = { map, routeLayer: null, groupLayer: null };
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [show]);

  // Rute (statisk pr. etape) — tegnes/gen-tegnes når den ændrer sig.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || route.length < 2) return;
    if (m.routeLayer) m.routeLayer.remove();
    const line = L.polyline(route, { color: '#333', weight: 3, opacity: 0.8 });
    const start = L.circleMarker(route[0], { radius: 5, color: '#0b6e4f', fillColor: '#0b6e4f', fillOpacity: 1 })
      .bindTooltip('Start');
    const finish = L.circleMarker(route[route.length - 1], { radius: 5, color: '#111', fillColor: '#fff', fillOpacity: 1, weight: 2 })
      .bindTooltip('Mål');
    m.routeLayer = L.layerGroup([line, start, finish]).addTo(m.map);
    m.map.fitBounds(line.getBounds(), { padding: [12, 12] });
  }, [show, route]);

  // Grupperne — gen-tegnes ved hver poll.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (m.groupLayer) m.groupLayer.remove();
    const markers = groups.map((g, i) => {
      const color = GROUP_COLORS[i % GROUP_COLORS.length];
      return L.circleMarker([g.lat, g.lon], {
        radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
      }).bindTooltip(groupSummary(g));
    });
    m.groupLayer = L.layerGroup(markers).addTo(m.map);
  }, [show, groups]);

  // Chips under kortet: gruppe-resumé + udbruddets ryttere (danskere med flag).
  const chips = useMemo(() => groups.map((g, i) => {
    const riders = g.bibs.length > 0 && g.bibs.length <= 8 ? ridersForBibs(g.bibs) : [];
    return {
      key: g.id ?? i,
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      text: groupSummary(g),
      riders,
      kmLeft: i === 0 ? g.kmLeft : null,
    };
  }), [groups]);

  if (!show) return null;

  const kmLeft = chips[0]?.kmLeft;

  return (
    <div className="card" data-testid="live-map" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>🗺️ Live-kort — etape {data.stage}</strong>
        {kmLeft != null && (
          <span className="badge badge--blue" style={{ fontSize: '0.72rem' }}>
            {Math.round(kmLeft)} km til mål
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        data-testid="live-map-canvas"
        style={{ height: 220, borderRadius: 10, overflow: 'hidden', zIndex: 0 }}
      />

      <div style={{ display: 'flex', gap: '0.4rem 0.8rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        {chips.map((c) => (
          <span key={c.key} data-testid="live-map-group" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: c.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{c.text}</span>
            {c.riders.length > 0 && (
              <span style={{ color: 'var(--c-muted)' }}>
                — {c.riders.map((r) => r.name + (r.danish ? ' 🇩🇰' : '')).join(', ')}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
