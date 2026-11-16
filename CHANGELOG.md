# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Camera action**: a key that shows a live thumbnail from the printer's camera and saves a full-resolution snapshot
  when pressed. It connects over the local network (RTSPS, port 322) using the printer's IP address and LAN access
  code, so it works independently of Bambu Cloud. Video is decoded with `ffmpeg`, which must be installed
  (`winget install Gyan.FFmpeg` on Windows, `brew install ffmpeg` on macOS). The plugin finds it in the key's
  **ffmpeg Path** setting, a bundled copy if the plugin was built with one, the standard install locations (winget,
  Chocolatey and Scoop on Windows; Homebrew's `/opt/homebrew/bin` and `/usr/local/bin` on macOS, which are not on
  the `PATH` of apps started from the Dock) and finally `PATH`, and checks that it can run. If it cannot, the key
  shows `ffmpeg Missing` and the plugin log says why. The default build does not include ffmpeg;
  `npm run build:bundled` (after `npm install --no-save ffmpeg-static`) makes an opt-in build that does.
- **Light Toggle action**: a key that shows whether the printer light is on or off and switches it when pressed
  (`ledctrl` over the existing Bambu Cloud MQTT connection). The plugin now reads `lights_report` for the state.
- **Dual-nozzle support on the Nozzle Temp key.** Printers that report more than one extruder (H2D, X2D) show both
  nozzles, left and right, with their current and target temperatures and the active nozzle outlined. Single-nozzle
  printers are unchanged.
- **Multiple AMS units.** The AMS Slot keys have an **AMS Unit** option (A-D, or AMS HT 1-4). The AMS Overview key
  shows one unit at a time and switches to the next unit when pressed; on dual-nozzle printers it marks which nozzle
  (`L`/`R`) the unit feeds. Keys pointing at a unit or slot that does not exist show `NO UNIT` or `NO SLOT`.
- **Second external spool.** The External Spool key has a **Spool 1 / Spool 2** option for dual-nozzle printers,
  which report both.
- **Manual printer serial and Bambu user ID fields** in the Property Inspector. They let a key connect when Bambu's
  REST API refuses the printer-list or profile lookups (for example a Cloudflare `403` block), which previously left
  the plugin unable to find any printer or resolve the account's user ID.
- **Localization** (`es`, `de`, `fr`) following the Stream Deck app language, with English as the fallback. It covers
  login and error messages, key placeholders, the Property Inspector, and the action names and tooltips shown in the
  Stream Deck action list. Strings live in `<lang>.json` (plugin) and `ui/i18n.js` (Property Inspector); a language
  is added by creating another `<lang>.json` and extending `ui/i18n.js`.
- **Diagnostic logging** for the cloud login, device list (`/user/bind`), profile and verification-code requests.
  The HTTP status and the start of the response body are written to the plugin log, which makes blocked or failing
  requests visible.
- **Explicit email verification code request** (`/user/sendemail/code`) when Bambu asks for an email code, instead of
  relying on the login request to send it.

### Changed
- Status messages, errors and debug logs that were hardcoded in Spanish are now English by default and are
  translated through the new localization layer.
- A failed printer-list request is no longer swallowed after sign-in; the error is logged and the Property Inspector
  points to the manual serial and user ID fields.
- Non-JSON responses from the login endpoint (for example a Cloudflare block page) now produce a clear error instead
  of a JSON parse failure.
- Requests to the Bambu API send fuller slicer client headers (client version, the real operating system and
  version, language and device ID).
- MQTT user ID resolution also reads the token's `username` claim, tolerates more profile response shapes, and logs
  why resolution failed.
- All "no data" key placeholders use a single translated string.
- Documentation: added this changelog, and README sections for supported platforms, the manual serial and user ID
  fallback, the Camera and languages.

### Fixed
- The active AMS spool was only highlighted for unit A. It is now read from each nozzle's `snow` value, so it is
  correct for any AMS unit, for AMS HT, for an external spool, and for whichever nozzle is in use.
- An unloaded filament kept the old active-spool highlight instead of clearing it.
- Incremental printer updates could overwrite the wrong AMS unit or blank a loaded slot (for example an update that
  listed only some trays, or only a tray's `remain`). Units are now merged by id and trays by slot.
- On dual-nozzle printers the plugin no longer relies on the single-nozzle `nozzle_temper` field, which only describes
  whichever nozzle is active; it reads the per-nozzle data in `device.extruder` instead.

### Known issues
- The Camera needs LAN Only Liveview enabled on the printer, the printer reachable on the same network, and `ffmpeg`
  installed. Printers that stream over the older port-6000 protocol (P1P, P1S, A1 series) are not supported yet.
- Bambu's Cloudflare rules can return `403` for authenticated REST calls from some networks or clients. The printer
  list then cannot be loaded and the serial and user ID must be entered manually. The Cloud MQTT connection itself is
  not affected.
- The Light Toggle switches only the primary light (`chamber_light`, or `work_light` on printers without one), not a
  second chamber light on printers that have one.
- AMS units with more than four slots (AMS 3H) show only their first four slots.
- The left/right nozzle labels follow the layout used by other Bambu integrations (id 0 is the right nozzle, id 1 the
  left) and have not been confirmed on every printer model.
- macOS is declared in the manifest but untested; the Camera there depends on a Homebrew `ffmpeg`.
- Builds made with `npm run build:bundled` include a GPL build of `ffmpeg` of about 80 MB per platform. They must be
  built on each target platform and carry FFmpeg's license obligations when distributed.
- Labels drawn on the key faces (for example `NOZZLE`, `HEATBED`, `PRINTING`) are not localized yet.

## [1.1.2] - 2026-08-08

### Added
- Fallback to the hardware AMS enclosure sensor for the chamber temperature when the printer reports no chamber value.

## [1.1.1] - 2026-08-08

### Added
- The chamber temperature is read directly from the printer's chamber sensor.
- Four-fan telemetry.

## [1.1.0] - 2026-08-08

### Added
- Multi-day print durations (for example `2d 12h 2m`).
- Layer progress shown as `L 1 / 167`.
- Four-fan telemetry.

### Changed
- Larger, more legible typography on the key faces.
- Remaining and elapsed time use the Bambu Lab format (for example `1h 36m left`).
- AMS humidity readings are stabilized and mapped to match Bambu Studio, and the AMS temperature is included.

### Fixed
- A typo in the auxiliary fan value on the fan-speed key.

## [1.0.0] - 2026-08-01

### Added
- Initial release: live telemetry from Bambu Lab printers over the Bambu Cloud MQTT service, with Bambu Cloud sign-in
  from the Property Inspector.
- Keys for print progress, nozzle, heatbed and chamber temperatures, air and fan speeds, active Gcode and print speed,
  print time and layers, the AMS overview, individual AMS slots A1-A4, and the external spool.

[Unreleased]: https://github.com/elgato-plugins-hub/bambu-streamdeck-plugin/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/elgato-plugins-hub/bambu-streamdeck-plugin/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/elgato-plugins-hub/bambu-streamdeck-plugin/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/elgato-plugins-hub/bambu-streamdeck-plugin/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/elgato-plugins-hub/bambu-streamdeck-plugin/releases/tag/v1.0.0
