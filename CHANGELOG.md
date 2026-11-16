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
  and LAN access code, and decodes the stream with `ffmpeg`, which must be installed (`winget install Gyan.FFmpeg`
  on Windows, `brew install ffmpeg` on macOS). A custom `ffmpeg` path can be set per key. Includes Spanish, German and French strings.
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
- **Camera: ffmpeg lookup.** The plugin now finds ffmpeg in the key's path setting, a bundled binary (if the plugin was
  built with one), the standard install locations (winget, Chocolatey and Scoop on Windows; Homebrew's
  `/opt/homebrew/bin` and `/usr/local/bin` on macOS, which are not on the PATH of apps started from the Dock) and
  finally `PATH`, and runs `ffmpeg -version` to confirm it works. A missing or blocked ffmpeg is reported clearly,
  and the key shows `ffmpeg Missing` instead of a generic error.
- **ffmpeg is no longer bundled by default.** It is a prerequisite on both Windows and macOS. The default build and
  install no longer download or ship ffmpeg; `npm run build:bundled` (with `npm install --no-save ffmpeg-static`)
  produces a build that includes it.
- README and in-app help now say **LAN Only Liveview**, the option name Bambu users report for H2D, H2S and X2D
  printers, and document installing ffmpeg as a prerequisite for the Camera action.
- The client headers sent to the Bambu API now report the real operating system and version instead of a
  hardcoded Windows value.
- README documents supported platforms: Windows is tested; macOS is declared in the manifest but untested. The
  Camera action needs `ffmpeg` installed on both platforms.
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
- Bundled builds (`npm run build:bundled`) include a GPL build of `ffmpeg` of about 80 MB per platform, which must be
  built on each target platform and carries FFmpeg's license obligations when distributed.
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
