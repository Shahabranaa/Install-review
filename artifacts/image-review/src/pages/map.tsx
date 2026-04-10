import "leaflet/dist/leaflet.css";
import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { Link } from "wouter";
import type { LatLngBoundsExpression } from "leaflet";
import { useListTowers, useListStrings, useListLocations } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wind } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  "Complete":    "#22c55e",
  "Completed":   "#22c55e",
  "In Progress": "#3b82f6",
  "Pending":     "#f59e0b",
  "pending":     "#f59e0b",
  "Not Started": "#94a3b8",
  "Excluded":    "#cbd5e1",
};
const DEFAULT_COLOR = "#94a3b8";

const STATUS_LABEL: Record<string, string> = {
  "Complete":    "Complete",
  "Completed":   "Complete",
  "In Progress": "In Progress",
  "Pending":     "Pending",
  "Not Started": "Not Started",
  "Excluded":    "Excluded",
};

function getColor(status: string) {
  return STATUS_COLOR[status] ?? DEFAULT_COLOR;
}

const LEGEND_ENTRIES = [
  { label: "Complete",    color: "#22c55e" },
  { label: "In Progress", color: "#3b82f6" },
  { label: "Pending",     color: "#f59e0b" },
  { label: "Not Started", color: "#94a3b8" },
  { label: "Excluded",    color: "#cbd5e1" },
];

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, bounds]);
  return null;
}

export default function MapPage() {
  const { data: towers, isLoading: towerLoading } = useListTowers();
  const { data: strings } = useListStrings();
  const { data: locations } = useListLocations();

  const [selectedOspId, setSelectedOspId] = useState<number | undefined>();
  const [selectedStringId, setSelectedStringId] = useState<number | undefined>();

  const ospLocations = locations?.filter((l) => l.type === "OSP") ?? [];

  const stringsForOsp = selectedOspId
    ? (strings?.filter((s) => s.locationId === selectedOspId) ?? [])
    : (strings ?? []);

  const towersWithCoords = (towers ?? []).filter(
    (t) => t.lat != null && t.lng != null,
  );

  const isActive = useCallback(
    (tower: (typeof towersWithCoords)[0]) => {
      if (selectedStringId) return tower.stringId === selectedStringId;
      if (selectedOspId) {
        const ospStringIds = new Set(
          (strings ?? []).filter((s) => s.locationId === selectedOspId).map((s) => s.id),
        );
        return ospStringIds.has(tower.stringId);
      }
      return true;
    },
    [selectedOspId, selectedStringId, strings],
  );

  const bounds: LatLngBoundsExpression | null =
    towersWithCoords.length > 0
      ? towersWithCoords.map((t) => [t.lat!, t.lng!] as [number, number])
      : null;

  const stringLookup = new Map((strings ?? []).map((s) => [s.id, s]));
  const ospLookup = new Map((locations ?? []).map((l) => [l.id, l]));

  if (towerLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Map</h1>
          <p className="text-muted-foreground mt-1">
            CVOW offshore wind turbine locations — {towersWithCoords.length} towers
          </p>
        </div>
        <Wind className="w-5 h-5 text-muted-foreground" />
      </div>

      {/* OSP filter */}
      {ospLocations.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">OSP:</span>
          <Button
            size="sm"
            variant={selectedOspId === undefined ? "default" : "outline"}
            onClick={() => { setSelectedOspId(undefined); setSelectedStringId(undefined); }}
          >
            All
          </Button>
          {ospLocations.map((osp) => (
            <Button
              key={osp.id}
              size="sm"
              variant={selectedOspId === osp.id ? "default" : "outline"}
              onClick={() => { setSelectedOspId(osp.id); setSelectedStringId(undefined); }}
            >
              {osp.name}
            </Button>
          ))}
        </div>
      )}

      {/* String filter */}
      {stringsForOsp.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground font-medium">String:</span>
          <Button
            size="sm"
            variant={selectedStringId === undefined ? "default" : "outline"}
            onClick={() => setSelectedStringId(undefined)}
          >
            All
          </Button>
          {stringsForOsp.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={selectedStringId === s.id ? "default" : "outline"}
              onClick={() => setSelectedStringId(s.id)}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border" style={{ height: "calc(100vh - 260px)", minHeight: 400 }}>
        <MapContainer
          center={[36.90, -75.40]}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {bounds && <FitBounds bounds={bounds} />}

          {towersWithCoords.map((tower) => {
            const active = isActive(tower);
            const str = stringLookup.get(tower.stringId);
            const osp = str ? ospLookup.get(str.locationId) : undefined;
            const color = getColor(tower.progressStatus);
            return (
              <CircleMarker
                key={tower.id}
                center={[tower.lat!, tower.lng!]}
                radius={active ? 8 : 5}
                pathOptions={{
                  color: active ? color : "#94a3b8",
                  fillColor: active ? color : "#e2e8f0",
                  fillOpacity: active ? 0.85 : 0.35,
                  weight: active ? 2 : 1,
                  opacity: active ? 1 : 0.4,
                }}
              >
                <Popup>
                  <div className="space-y-1 min-w-[140px]">
                    <p className="font-semibold text-sm">{tower.name}</p>
                    {str && (
                      <p className="text-xs text-gray-500">String: {str.name}</p>
                    )}
                    {osp && (
                      <p className="text-xs text-gray-500">OSP: {osp.name}</p>
                    )}
                    <span
                      className="inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: color }}
                    >
                      {(STATUS_LABEL[tower.progressStatus] ?? tower.progressStatus) || "—"}
                    </span>
                    {tower.lat != null && (
                      <p className="text-xs text-gray-400 font-mono mt-1">
                        {tower.lat.toFixed(5)}, {tower.lng!.toFixed(5)}
                      </p>
                    )}
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <Link href={`/drive-photos?tower=${encodeURIComponent(tower.name)}`}>
                        <button className="w-full text-xs text-blue-600 hover:text-blue-800 font-medium text-left">
                          View images →
                        </button>
                      </Link>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg border shadow-md px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-gray-600 mb-1">Status</p>
          {LEGEND_ENTRIES.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
