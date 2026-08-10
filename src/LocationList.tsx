import type { ReactNode } from "react";
import {
  FaClockRotateLeft,
  FaDesktop,
  FaDownload,
  FaFileLines,
  FaFolder,
  FaGamepad,
  FaHardDrive,
  FaHouse,
  FaImage,
  FaMusic,
  FaSdCard,
  FaTableCellsLarge,
  FaVideo,
} from "react-icons/fa6";

import type { Location } from "./backend";
import { ListGroup, ListRow } from "./ListRow";

const ICONS: Record<Location["kind"], ReactNode> = {
  recent: <FaClockRotateLeft />,
  home: <FaHouse />,
  downloads: <FaDownload />,
  documents: <FaFileLines />,
  desktop: <FaDesktop />,
  pictures: <FaImage />,
  videos: <FaVideo />,
  music: <FaMusic />,
  games: <FaGamepad />,
  applications: <FaTableCellsLarge />,
  sdcard: <FaSdCard />,
  drive: <FaHardDrive />,
};

/** "14.2 GB" — one decimal place is enough at a glance on a handheld. */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

interface LocationListProps {
  locations: Location[];
  onSelect(location: Location): void;
}

export function LocationList({ locations, onSelect }: LocationListProps) {
  return (
    <ListGroup>
      {locations.map((location) => (
        <ListRow
          key={location.path}
          icon={ICONS[location.kind] ?? <FaFolder />}
          label={location.label}
          trailing={location.free_bytes === undefined ? undefined : `${formatBytes(location.free_bytes)} free`}
          onSelect={() => onSelect(location)}
        />
      ))}
    </ListGroup>
  );
}
