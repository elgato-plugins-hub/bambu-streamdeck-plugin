# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
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
