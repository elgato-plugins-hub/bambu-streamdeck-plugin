# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Light Toggle action**: a key that shows whether the printer light is on or off and switches it when pressed
  (`ledctrl` over the existing Bambu Cloud MQTT connection). The service now also reads `lights_report`, so the
  light state is available to the plugin. Includes Spanish, German and French strings.
- **Camera action**: a key that shows a live thumbnail from the printer's camera and saves a full-resolution
  snapshot when pressed. It connects over the local network (RTSPS, port 322) using the printer's IP address
  and LAN access code, and decodes the stream with a bundled `ffmpeg` (via `ffmpeg-static`, copied into the
  plugin at build time). A custom `ffmpeg` path can be set per key. Includes Spanish, German and French strings.
- **Manual printer serial and Bambu user ID fields** in the Property Inspector. They let a key connect when
  Bambu's REST API refuses the printer-list or profile lookups (for example a Cloudflare `403` block), which
  previously left the plugin unable to find any printer or resolve the account's user ID.
- **Localization** (`es`, `de`, `fr`) following the Stream Deck app language, with English as the fallback.
  This covers login and error messages, key placeholders, the Property Inspector, and the action names and
  tooltips shown in the Stream Deck action list. Strings live in `<lang>.json` (plugin) and `ui/i18n.js`
  (Property Inspector). New languages can be added by creating another `<lang>.json` and extending `ui/i18n.js`.
- **Diagnostic logging** for the cloud login, device list (`/user/bind`), profile and verification-code requests.
  HTTP status and the start of the response body are written to the plugin log, which makes blocked or failing
  requests visible.
- **Explicit email verification code request** (`/user/sendemail/code`) when Bambu asks for an email code,
  instead of relying on the login request to send it.

### Changed
- Status messages, errors and debug logs that were hardcoded in Spanish are now English by default and
  translated through the new localization layer.
- A failed printer-list request is no longer swallowed after sign-in; the error is logged and the Property
  Inspector now points to the manual serial and user ID fields.
- Non-JSON responses from the login endpoint (for example a Cloudflare block page) now produce a clear error
  instead of a JSON parse failure.
- The slicer client headers sent to the Bambu API are more complete (client version, OS, language, device ID).
- MQTT user ID resolution now also reads the token's `username` claim, tolerates more profile response shapes,
  and logs why resolution failed.
- All "no data" key placeholders use a single translated string.

### Fixed
- Signing in no longer discards a manually entered user ID or other saved global settings.

### Known issues
- The Camera action needs the printer's LAN Mode Liveview enabled and the printer reachable on the same network.
  Printers that stream over the older port-6000 protocol (P1P, P1S, A1 series) are not supported yet.
- The bundled `ffmpeg` is a GPL build of about 80 MB per platform. It is not committed to git; `npm run build`
  copies the binary for the machine doing the build, so the macOS and Windows packages must be built on their
  own platforms.
- Bambu's Cloudflare rules can return `403` for authenticated REST calls from some networks or clients, in
  which case the printer list cannot be loaded and the serial and user ID must be entered manually. The
  Cloud MQTT connection itself is not affected.
- Labels drawn on the key faces (for example `NOZZLE`, `HEATBED`, `PRINTING`) are not localized yet.

## [1.1.2]
- Fallback to the hardware AMS enclosure sensor for chamber temperature.

## [1.1.1]
- Direct chamber temperature sensor reading and 4-fan telemetry.

## [1.1.0]
- Multi-day print duration, `L` layer spacing, and 4-fan telemetry.

## [1.0.0]
- Initial release of the Bambu Connect Stream Deck plugin.
