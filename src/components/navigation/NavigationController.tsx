import { useEffect, useRef } from 'react';
import { useNavProgress } from '../../hooks/useNavProgress';
import { OFF_ROUTE_M, spokenDistance } from '../../lib/navigation';
import { useAppStore } from '../../store/useAppStore';
import { mapHandle } from '../map/mapSetup';

const TICK_MS = 250;
const PRE_ANNOUNCE_M = 200;
const REROUTE_COOLDOWN_MS = 8000;

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/**
 * Headless driver for turn-by-turn navigation: moves the car (GPS or simulation),
 * keeps the camera on it, reroutes when the car leaves the route and speaks instructions.
 */
export function NavigationController() {
  const mode = useAppStore((s) => s.navigation?.mode);
  const active = useAppStore((s) => s.navigation !== null);
  const navigation = useAppStore((s) => s.navigation);
  const progress = useNavProgress();
  const lastReroute = useRef(0);
  const lastSpokenStep = useRef<string | null>(null);
  const preAnnounced = useRef<string | null>(null);

  // Simulated driving loop.
  useEffect(() => {
    if (!active || mode !== 'simulated') return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      useAppStore.getState().advanceSimulation((now - last) / 1000);
      last = now;
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active, mode]);

  // Real GPS.
  useEffect(() => {
    if (!active || mode !== 'gps') return;
    if (!('geolocation' in navigator)) {
      useAppStore.getState().setGpsError('Este navegador não oferece geolocalização.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        useAppStore
          .getState()
          .updateGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.coords.heading ?? null),
      (err) => useAppStore.getState().setGpsError(err.message || 'Não foi possível obter sua posição.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, mode]);

  // Stop following when the user pans the map by hand.
  useEffect(() => {
    if (!active) return;
    const map = mapHandle.current?.getMap();
    if (!map) return;
    const onDrag = () => useAppStore.getState().setNavFollow(false);
    map.on('dragstart', onDrag);
    return () => {
      map.off('dragstart', onDrag);
    };
  }, [active]);

  // Camera follows the car, heading-up.
  useEffect(() => {
    if (!navigation?.follow || navigation.arrived) return;
    mapHandle.current?.easeTo({
      center: [navigation.position.lng, navigation.position.lat],
      bearing: navigation.heading,
      pitch: 62,
      zoom: 17,
      duration: TICK_MS + 50,
      easing: (t) => t,
      padding: { top: 160, bottom: 140, left: 0, right: 0 },
    });
  }, [navigation?.position, navigation?.heading, navigation?.follow, navigation?.arrived]);

  // Arrival + off-route detection.
  useEffect(() => {
    if (!navigation || !progress || navigation.arrived || navigation.rerouting) return;
    const store = useAppStore.getState();
    if (progress.arrived) {
      store.markArrived();
      return;
    }
    if (progress.offRouteM > OFF_ROUTE_M && Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS) {
      lastReroute.current = Date.now();
      if (navigation.voice) speak('Recalculando a rota.');
      void store.reroute();
    }
  }, [navigation, progress]);

  // Voice guidance: announce each maneuver ~200 m ahead and again when it is close.
  useEffect(() => {
    if (!navigation?.voice || !progress) return;
    if (navigation.arrived) {
      if (lastSpokenStep.current !== 'arrived') {
        lastSpokenStep.current = 'arrived';
        speak('Você chegou ao seu destino.');
      }
      return;
    }
    const next = progress.next;
    if (!next) return;
    const key = `${next.startKm.toFixed(4)}-${next.instruction}`;
    if (progress.distanceToNextM <= 40 && lastSpokenStep.current !== key) {
      lastSpokenStep.current = key;
      speak(next.instruction);
    } else if (progress.distanceToNextM <= PRE_ANNOUNCE_M && preAnnounced.current !== key && progress.distanceToNextM > 60) {
      preAnnounced.current = key;
      speak(`Em ${spokenDistance(progress.distanceToNextM)}, ${next.instruction.charAt(0).toLowerCase()}${next.instruction.slice(1)}`);
    }
  }, [navigation?.voice, navigation?.arrived, progress]);

  // Silence any pending speech when navigation ends.
  useEffect(() => {
    if (active) return;
    lastSpokenStep.current = null;
    preAnnounced.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [active]);

  return null;
}
