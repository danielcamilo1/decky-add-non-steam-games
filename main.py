import base64
import glob
import json
import os
import re
import shlex
import shutil
import stat

import decky

# Extensions that need a compatibility tool (Proton) to run on Linux.
WINDOWS_EXTENSIONS = {".exe", ".bat", ".cmd", ".msi"}

# Extensions that are never launchable on their own. Selecting one of these is
# almost always a mistake, so the frontend warns about it.
NON_EXECUTABLE_EXTENSIONS = {
    ".dll", ".so", ".zip", ".7z", ".rar", ".tar", ".gz", ".iso",
    ".txt", ".md", ".png", ".jpg", ".jpeg", ".ini", ".cfg", ".json",
}

SETTINGS_FILENAME = "settings.json"

# Shown in the panel so a stale install is obvious. Keep in sync with package.json.
PLUGIN_VERSION = "1.6.0"

# "ask" prompts after every add; "always"/"never" skip the prompt.
RESTART_CHOICES = ("ask", "always", "never")

# XDG keys we offer as places, in the order they are shown.
XDG_PLACES = (
    ("XDG_DOWNLOAD_DIR", "Downloads", "downloads", "Downloads"),
    ("XDG_DOCUMENTS_DIR", "Documents", "documents", "Documents"),
    ("XDG_DESKTOP_DIR", "Desktop", "desktop", "Desktop"),
    ("XDG_PICTURES_DIR", "Pictures", "pictures", "Pictures"),
    ("XDG_VIDEOS_DIR", "Videos", "videos", "Videos"),
    ("XDG_MUSIC_DIR", "Music", "music", "Music"),
)

# Extra directories worth offering when they exist.
EXTRA_PLACES = (
    ("Games", "games", "Games"),
    ("Applications", "applications", "Applications"),
    ("Emulation", "games", "Emulation"),
)

# Where removable and external media get mounted.
REMOVABLE_MOUNT_ROOTS = ("/run/media", "/media", "/mnt")

# Filesystems that never hold a game and only add noise to the drive list.
PSEUDO_FILESYSTEMS = {
    "autofs", "bpf", "cgroup", "cgroup2", "configfs", "debugfs", "devpts",
    "devtmpfs", "efivarfs", "fuse.gvfsd-fuse", "fusectl", "hugetlbfs", "mqueue",
    "proc", "pstore", "ramfs", "securityfs", "sysfs", "tmpfs", "tracefs",
}

# Where installed applications advertise themselves, highest precedence first.
# A desktop file found earlier wins over the same ID found later, per the XDG
# Desktop Entry spec.
APPLICATION_DIRS = (
    ("~/.local/share/applications", "User"),
    ("~/.local/share/flatpak/exports/share/applications", "Flatpak"),
    ("/var/lib/flatpak/exports/share/applications", "Flatpak"),
    ("/var/lib/snapd/desktop/applications", "Snap"),
    ("/usr/local/share/applications", "System"),
    ("/usr/share/applications", "System"),
)

# Icon theme roots, searched in this order for a named icon.
ICON_DIRS = (
    "~/.local/share/icons",
    "~/.icons",
    "~/.local/share/flatpak/exports/share/icons",
    "/var/lib/flatpak/exports/share/icons",
    "/usr/local/share/icons",
    "/usr/share/icons",
)

# Directories holding loose icon files, no theme structure.
PIXMAP_DIRS = ("/usr/share/pixmaps", "/usr/local/share/pixmaps")

# Icon sizes worth showing in a list row, best first. "scalable" is SVG.
ICON_SIZES = ("128x128", "96x96", "64x64", "scalable", "256x256", "48x48", "32x32")

ICON_MIME_TYPES = {".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg"}

# Bigger than this is not worth inlining into a list row.
MAX_ICON_BYTES = 96 * 1024

# Desktop entry Exec field codes, none of which mean anything to Steam.
EXEC_FIELD_CODES = re.compile(r"%[fFuUdDnNickvm]")

# Flatpak wraps field codes in @@ ... @@ (or @@u ... @@) inside Exec. The inner
# group is deliberately free of leading \s* so the two quantifiers cannot
# backtrack against each other; surrounding space is trimmed afterwards.
FLATPAK_EXEC_WRAPPER = re.compile(r"@@u?(.*?)@@")


# Markers in Steam's binary KeyValues format (shortcuts.vdf).
VDF_MAP = 0x00
VDF_STRING = 0x01
VDF_INT32 = 0x02
VDF_END = 0x08


# /proc/mounts octal-escapes exactly these four characters in paths.
MOUNT_ESCAPES = {"\\040": " ", "\\011": "\t", "\\012": "\n", "\\134": "\\"}


def _unescape_mount(value: str) -> str:
    for escape, character in MOUNT_ESCAPES.items():
        value = value.replace(escape, character)
    return value


def _unescape_udev(value: str) -> str:
    """udev writes by-label symlinks with \\xNN escapes, e.g. 'My\\x20SD'."""
    return re.sub(r"\\x([0-9a-fA-F]{2})", lambda match: chr(int(match.group(1), 16)), value)


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() == "true"


def _read_desktop_entry(path: str) -> dict:
    """
    Read the `[Desktop Entry]` group of a .desktop file.

    Hand-rolled rather than configparser: desktop files routinely contain `%`
    (which configparser tries to interpolate) and repeated keys for localised
    values, both of which raise there.
    """
    entry: dict = {}
    in_group = False

    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue

            if line.startswith("["):
                if in_group:
                    break  # a later group started; only the first one matters
                in_group = line == "[Desktop Entry]"
                continue

            if not in_group or "=" not in line:
                continue

            key, _, value = line.partition("=")
            # setdefault keeps the unlocalised key, which always comes first.
            entry.setdefault(key.strip(), value.strip())

    return entry


def _clean_exec(value: str) -> str:
    """Strip the field codes Steam has no use for out of an Exec line."""
    without_wrappers = FLATPAK_EXEC_WRAPPER.sub(lambda match: match.group(1).strip(), value)
    without_codes = EXEC_FIELD_CODES.sub("", without_wrappers)
    return re.sub(r"\s+", " ", without_codes.replace("%%", "%")).strip()


def _resolve_binary(token: str) -> str | None:
    """Absolute path for an Exec token, or None when it is not installed."""
    if os.path.isabs(token):
        return token if os.path.isfile(token) else None
    return shutil.which(token)


def _parse_exec(command: str) -> tuple[str, str] | None:
    """Split a cleaned Exec line into (executable, arguments)."""
    try:
        tokens = shlex.split(command)
    except ValueError:
        tokens = command.split()
    if not tokens:
        return None

    executable = _resolve_binary(tokens[0])
    if not executable:
        return None
    return executable, shlex.join(tokens[1:])


def _icon_candidates(icon: str):
    """Every path a named icon could live at, best match first."""
    for raw_dir in ICON_DIRS:
        root = os.path.expanduser(raw_dir)
        try:
            themes = ["hicolor", *sorted(os.listdir(root))]
        except OSError:
            continue
        for theme in themes:
            for size in ICON_SIZES:
                for extension in (".png", ".svg"):
                    yield os.path.join(root, theme, size, "apps", icon + extension)

    for raw_dir in PIXMAP_DIRS:
        for extension in (".png", ".svg", ".xpm"):
            yield os.path.join(raw_dir, icon + extension)


def _read_icon_data(path: str) -> str:
    """Inline an icon as a data URI so the panel can render it directly."""
    mime = ICON_MIME_TYPES.get(os.path.splitext(path)[1].lower())
    if not mime:
        return ""

    try:
        if os.path.getsize(path) > MAX_ICON_BYTES:
            return ""
        with open(path, "rb") as handle:
            payload = base64.b64encode(handle.read()).decode("ascii")
    except OSError:
        return ""

    return f"data:{mime};base64,{payload}"


def _parse_binary_vdf(data: bytes) -> dict:
    """Minimal reader for Steam's binary KeyValues, enough for shortcuts.vdf."""
    index = 0

    def read_string() -> str:
        nonlocal index
        end = data.index(b"\x00", index)
        value = data[index:end].decode("utf-8", "replace")
        index = end + 1
        return value

    def read_map() -> dict:
        nonlocal index
        result = {}
        while index < len(data):
            marker = data[index]
            index += 1
            if marker == VDF_END:
                return result

            key = read_string()
            if marker == VDF_MAP:
                result[key] = read_map()
            elif marker == VDF_STRING:
                result[key] = read_string()
            elif marker == VDF_INT32:
                result[key] = int.from_bytes(data[index:index + 4], "little", signed=True)
                index += 4
            else:
                raise ValueError(f"Unexpected VDF marker {marker:#04x} at byte {index - 1}")
        return result

    return read_map()


class Plugin:
    async def _main(self):
        self.settings_path = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, SETTINGS_FILENAME)
        self.settings = self._read_settings()
        # Scanning every .desktop file is too slow to repeat on each panel open.
        self._applications: list | None = None
        self._icon_cache: dict = {}
        decky.logger.info("Add Non-Steam Games ready")

    async def _unload(self):
        decky.logger.info("Add Non-Steam Games unloaded")

    async def _uninstall(self):
        decky.logger.info("Add Non-Steam Games uninstalled")

    # --- Browsing --------------------------------------------------------

    async def get_start_path(self) -> str:
        """Directory the file picker should open at."""
        remembered = self.settings.get("last_directory")
        if remembered and os.path.isdir(remembered):
            return remembered
        return decky.HOME

    async def remember_directory(self, path: str) -> None:
        """Persist the directory of the last picked file so the picker reopens there."""
        directory = path if os.path.isdir(path) else os.path.dirname(path)
        if not directory:
            return
        self.settings["last_directory"] = directory
        self._write_settings()

    async def list_locations(self) -> dict:
        """The sidebar: recent folder, home and user directories, and mounted drives."""
        recent = self.settings.get("last_directory")
        return {
            "recent": (
                {"label": os.path.basename(recent) or recent, "path": recent, "kind": "recent",
                 "detail": recent}
                if recent and os.path.isdir(recent)
                else None
            ),
            "places": self._list_places(),
            "drives": self._list_drives(),
        }

    async def list_applications(self, refresh: bool = False) -> list:
        """
        Installed applications, from the same `.desktop` files the desktop menu
        reads — native, Flatpak and Snap alike.

        Scanning parses a few hundred small files and inlines icons, so the
        result is cached until the caller explicitly asks for a refresh.
        """
        if refresh or self._applications is None:
            self._applications = self._scan_applications()
            decky.logger.info("Found %d applications", len(self._applications))
        return self._applications

    # --- Picked file -----------------------------------------------------

    async def inspect_path(self, path: str) -> dict:
        """Describe a picked path so the frontend can pre-fill the form and warn early."""
        exists = os.path.exists(path)
        is_dir = os.path.isdir(path)
        extension = os.path.splitext(path)[1].lower()

        return {
            "path": path,
            "exists": exists,
            "is_dir": is_dir,
            "directory": path if is_dir else os.path.dirname(path),
            "extension": extension,
            "suggested_name": self._suggest_name(path),
            "is_windows_app": extension in WINDOWS_EXTENSIONS,
            "is_executable": exists and not is_dir and os.access(path, os.X_OK),
            "looks_launchable": extension not in NON_EXECUTABLE_EXTENSIONS,
            "needs_quoting": bool(path) and shlex.quote(path) != path,
        }

    async def make_executable(self, path: str) -> dict:
        """Add the executable bit to a file, e.g. a freshly downloaded .sh or AppImage."""
        if not os.path.isfile(path):
            return {"success": False, "error": "File does not exist"}

        try:
            mode = os.stat(path).st_mode
            os.chmod(path, mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        except OSError as error:
            decky.logger.error("Could not make %s executable: %s", path, error)
            return {"success": False, "error": str(error)}

        # Filesystems mounted noexec (some SD card / NTFS setups) silently drop
        # the bit, so report what actually stuck rather than what we asked for.
        if not os.access(path, os.X_OK):
            return {
                "success": False,
                "error": "The filesystem does not allow executable files (mounted noexec?)",
            }

        decky.logger.info("Made %s executable", path)
        return {"success": True}

    # --- Preferences -----------------------------------------------------

    async def get_restart_preference(self) -> str:
        value = self.settings.get("restart_after_add", "ask")
        return value if value in RESTART_CHOICES else "ask"

    async def set_restart_preference(self, value: str) -> None:
        if value not in RESTART_CHOICES:
            decky.logger.warning("Ignoring unknown restart preference %r", value)
            return
        self.settings["restart_after_add"] = value
        self._write_settings()
        decky.logger.info("Restart preference set to %s", value)

    # --- Diagnostics -----------------------------------------------------

    async def ping(self) -> str:
        """Proves the Python backend loaded, and reports which build is running."""
        return PLUGIN_VERSION

    async def log(self, level: str, message: str) -> None:
        """Mirror frontend events into the plugin log, which is what users can send us."""
        getattr(decky.logger, level, decky.logger.info)(message)

    async def list_saved_shortcuts(self) -> dict:
        """
        The non-Steam games Steam has actually written to disk.

        Steam keeps its shortcut list in memory and only writes `shortcuts.vdf`
        during a clean shutdown, so this is the ground truth for "will my game
        still be there tomorrow" — and the answer only changes after a restart.
        """
        files = self._shortcut_files()
        if not files:
            return {"found": False, "shortcuts": [], "error": "No shortcuts.vdf yet"}

        shortcuts = []
        for path in files:
            try:
                with open(path, "rb") as handle:
                    parsed = _parse_binary_vdf(handle.read())
            except (OSError, ValueError) as error:
                decky.logger.warning("Could not read %s: %s", path, error)
                continue

            for entry in parsed.get("shortcuts", {}).values():
                if not isinstance(entry, dict):
                    continue
                shortcuts.append({
                    # Steam stores the id as a signed int32; the frontend uses
                    # the unsigned form.
                    "app_id": int(entry.get("appid", 0)) & 0xFFFFFFFF,
                    "name": entry.get("AppName") or entry.get("appname") or "",
                    "exe": (entry.get("Exe") or entry.get("exe") or "").strip('"'),
                })

        return {"found": True, "shortcuts": shortcuts}

    def _shortcut_files(self) -> list:
        roots = (
            os.path.join(decky.HOME, ".steam", "steam", "userdata"),
            os.path.join(decky.HOME, ".local", "share", "Steam", "userdata"),
        )
        found = []
        for root in roots:
            for path in glob.glob(os.path.join(root, "*", "config", "shortcuts.vdf")):
                resolved = os.path.realpath(path)
                if resolved not in found:
                    found.append(resolved)
        return found

    # --- Internals: applications -----------------------------------------

    def _scan_applications(self) -> list:
        found = {}

        for raw_dir, source in APPLICATION_DIRS:
            root = os.path.expanduser(raw_dir)
            if not os.path.isdir(root):
                continue

            for directory, _, filenames in os.walk(root):
                for filename in filenames:
                    if not filename.endswith(".desktop"):
                        continue

                    path = os.path.join(directory, filename)
                    # The desktop ID is the path below the root with separators
                    # turned into dashes; it is what makes entries comparable
                    # across directories.
                    desktop_id = os.path.relpath(path, root).replace(os.sep, "-")
                    if desktop_id in found:
                        continue  # an earlier, higher-precedence directory won

                    application = self._read_application(path, source)
                    if application:
                        found[desktop_id] = application

        return sorted(found.values(), key=lambda app: app["name"].lower())

    def _read_application(self, path: str, source: str) -> dict | None:
        try:
            entry = _read_desktop_entry(path)
        except OSError as error:
            decky.logger.debug("Skipping %s: %s", path, error)
            return None

        if entry.get("Type", "Application") != "Application":
            return None
        if _is_true(entry.get("NoDisplay")) or _is_true(entry.get("Hidden")):
            return None

        name = entry.get("Name", "").strip()
        command = _clean_exec(entry.get("Exec", ""))
        if not name or not command:
            return None

        # TryExec names the binary that decides whether the entry is installed.
        try_exec = entry.get("TryExec", "").strip()
        if try_exec and not _resolve_binary(try_exec):
            return None

        parsed = _parse_exec(command)
        if not parsed:
            return None
        executable, arguments = parsed

        working_dir = entry.get("Path", "").strip() or os.path.dirname(executable)
        icon_path = self._resolve_icon(entry.get("Icon", "").strip())

        return {
            "name": name,
            "exe": executable,
            "args": arguments,
            "start_dir": working_dir,
            "source": source,
            "categories": [c for c in entry.get("Categories", "").split(";") if c],
            "icon_path": icon_path or "",
            "icon_data": _read_icon_data(icon_path) if icon_path else "",
            "desktop_file": path,
        }

    def _resolve_icon(self, icon: str) -> str | None:
        """Turn a desktop entry's Icon value into a real file path."""
        if not icon:
            return None
        if os.path.isabs(icon):
            return icon if os.path.isfile(icon) else None
        if icon in self._icon_cache:
            return self._icon_cache[icon]

        resolved = next(
            (path for path in _icon_candidates(icon) if os.path.isfile(path)),
            None,
        )
        self._icon_cache[icon] = resolved
        return resolved

    # --- Internals: places and drives ------------------------------------

    def _list_places(self) -> list:
        home = decky.HOME
        places = [{"label": "Home", "path": home, "kind": "home", "detail": home}]

        user_dirs = self._read_user_dirs()
        seen = {home}
        for key, fallback, kind, label in XDG_PLACES:
            path = user_dirs.get(key) or os.path.join(home, fallback)
            if path not in seen and os.path.isdir(path):
                places.append({"label": label, "path": path, "kind": kind, "detail": path})
                seen.add(path)

        for folder, kind, label in EXTRA_PLACES:
            path = os.path.join(home, folder)
            if path not in seen and os.path.isdir(path):
                places.append({"label": label, "path": path, "kind": kind, "detail": path})
                seen.add(path)

        return places

    def _read_user_dirs(self) -> dict:
        """Parse ~/.config/user-dirs.dirs, which localises Downloads/Documents/..."""
        config = os.path.join(decky.HOME, ".config", "user-dirs.dirs")
        entries = {}
        try:
            with open(config, "r", encoding="utf-8") as handle:
                for line in handle:
                    match = re.match(r'\s*(XDG_[A-Z_]+_DIR)\s*=\s*"(.*)"\s*$', line)
                    if match:
                        key, raw = match.groups()
                        entries[key] = raw.replace("$HOME", decky.HOME)
        except OSError:
            pass
        return entries

    def _list_drives(self) -> list:
        """SD cards, USB sticks and external disks, as mounted by SteamOS."""
        labels = self._device_labels()
        drives = []

        for device, mountpoint, fstype in self._read_mounts():
            if fstype in PSEUDO_FILESYSTEMS or not device.startswith("/dev/"):
                continue
            if not any(mountpoint.startswith(root + "/") for root in REMOVABLE_MOUNT_ROOTS):
                continue
            if not os.path.isdir(mountpoint):
                continue

            label = labels.get(os.path.realpath(device)) or os.path.basename(mountpoint)
            drives.append({
                "label": label,
                "path": mountpoint,
                "kind": "sdcard" if "mmcblk" in device else "drive",
                "detail": mountpoint,
                "free_bytes": self._free_bytes(mountpoint),
                "total_bytes": self._total_bytes(mountpoint),
            })

        drives.sort(key=lambda drive: drive["label"].lower())
        return drives

    def _read_mounts(self) -> list:
        try:
            with open("/proc/mounts", "r", encoding="utf-8") as handle:
                lines = handle.readlines()
        except OSError as error:
            decky.logger.warning("Could not read /proc/mounts: %s", error)
            return []

        mounts = []
        for line in lines:
            fields = line.split()
            if len(fields) < 3:
                continue
            mounts.append((fields[0], _unescape_mount(fields[1]), fields[2]))
        return mounts

    def _device_labels(self) -> dict:
        """Map /dev/sdX -> the filesystem label, so drives get a friendly name."""
        by_label = "/dev/disk/by-label"
        labels = {}
        try:
            for entry in os.listdir(by_label):
                target = os.path.realpath(os.path.join(by_label, entry))
                labels[target] = _unescape_udev(entry)
        except OSError:
            pass
        return labels

    def _free_bytes(self, path: str) -> int:
        try:
            stats = os.statvfs(path)
            return stats.f_bavail * stats.f_frsize
        except OSError:
            return 0

    def _total_bytes(self, path: str) -> int:
        try:
            stats = os.statvfs(path)
            return stats.f_blocks * stats.f_frsize
        except OSError:
            return 0

    def _suggest_name(self, path: str) -> str:
        """Turn '/games/Some_cool-game.x86_64' into 'Some cool-game'."""
        basename = os.path.basename(os.path.normpath(path))
        stem = os.path.splitext(basename)[0] or basename
        return re.sub(r"\s+", " ", stem.replace("_", " ")).strip()

    def _read_settings(self) -> dict:
        try:
            with open(self.settings_path, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
        except FileNotFoundError:
            return {}
        except (OSError, ValueError) as error:
            decky.logger.warning("Ignoring unreadable settings file: %s", error)
            return {}
        return loaded if isinstance(loaded, dict) else {}

    def _write_settings(self) -> None:
        try:
            with open(self.settings_path, "w", encoding="utf-8") as handle:
                json.dump(self.settings, handle)
        except OSError as error:
            decky.logger.warning("Could not save settings: %s", error)
