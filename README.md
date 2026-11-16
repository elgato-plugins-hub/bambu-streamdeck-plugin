# 🖨️ Bambu Connect — Elgato Stream Deck Plugin

[![Stream Deck](https://img.shields.io/badge/Stream%20Deck-v6.4+-00AE42?style=for-the-badge&logo=elgato&logoColor=white)](https://marketplace.elgato.com)
[![Bambu Lab](https://img.shields.io/badge/Bambu%20Lab-P1P%20%7C%20P1S%20%7C%20X1C%20%7C%20A1%20%7C%20P2S-00AE42?style=for-the-badge)](https://bambulab.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**Bambu Connect** is a feature-rich, live telemetry monitor plugin for **Elgato Stream Deck**. It connects directly to **Bambu Lab Cloud MQTT** service to provide real-time updates on nozzle temperature, heatbed, chamber ambient, AMS spools, fan speeds, active Gcode jobs, and print progress right at your fingertips.

---

## ✨ Features

- **🔥 Nozzle & Heatbed Telemetry**: Live temperatures with dynamic `HEATING 🔥` and `COOLING ❄️` status indicators.
- **🌡️ Chamber Temperature**: Real-time enclosure ambient monitoring (supports Bambu Lab P1/P2/X1/A1 series).
- **🎨 AMS Overview & Slots (A1–A4)**: Individual spool keys displaying exact Loaded Filament Hex Colors, Types (PLA, PETG, TPU...), humidity level (`24%`), and active `IN USE` badge.
- **🧵 External Spool Support**: Dedicated key for rear virtual tray / external spool.
- **🌬️ Air & Fan Speed Control**: Real-time Part Cooling, Auxiliary Fan, and Chamber Exhaust Filter Fan monitoring (`0–100%`).
- **📑 Active Gcode & Print Speed**: Displays active Gcode job filename and print speed mode (`Silent 50%`, `Standard 100%`, `Sport 124%`, `Ludicrous 166%`).
- **⏳ Print Time & Layer Counter**: Remaining time, elapsed time, and current/total layers (`X/Y LAYER`).
- **📊 Print Progress Ring**: Dynamic percentage arc and state indicator (`PRINTING`, `PAUSED`, `FINISHED`).
- **🔑 One-Click Bambu Cloud Sign-In**: Easy authentication via Property Inspector with 2FA/TOTP support and automatic global printer detection.

---

## 📸 Actions Overview

| Action | Description |
| :--- | :--- |
| **Print Progress** | Ring arc percentage, state (`PRINTING`, `PAUSED`, `FINISHED`). |
| **Nozzle Temp** | Current/target temp with `HEATING 🔥` / `COOLING ❄️` indicators. |
| **Heatbed Temp** | Heatbed current/target temp with thermal status badges. |
| **Chamber Temp** | Internal chamber ambient temperature. |
| **Air & Fan Speeds** | Part, Aux, and Chamber filter fan speeds (`0–100%`). |
| **Active Gcode & Speed** | Active Gcode filename and print speed mode. |
| **AMS Overview** | All 4 spools, active slot, and humidity percentage (`24%`). |
| **AMS Slot A1–A4** | Individual spool color, material, and `IN USE` status. |
| **External Spool** | Rear external spool filament color and active state. |
| **Print Time & Layers** | Remaining time, elapsed time, and layer count (`X/Y`). |
| **Light Toggle** | Printer light state (`ON` / `OFF`). Press to switch the light on or off. |
| **Camera** | Live thumbnail from the printer camera (LAN). Press to save a full-resolution snapshot. |

---

## 🚀 Installation

1. Download the latest `.streamDeckPlugin` release from the [Releases](https://github.com/Alejandrokbo/bambu-streamdeck-plugin/releases) section.
2. Double-click `com.alejandrocabo.bambuconnect.streamDeckPlugin` to install it into Elgato Stream Deck.
3. Open Stream Deck and drag any action from the **Bambu Connect** category onto your key grid.

**Prerequisite for the Camera action (Windows and macOS):** install [`ffmpeg`](https://ffmpeg.org) first. The other actions do not need it.

| Platform | Install command |
| :--- | :--- |
| **Windows** | `winget install Gyan.FFmpeg` (restart Stream Deck afterwards) |
| **macOS** | `brew install ffmpeg` with [Homebrew](https://brew.sh) |

The plugin finds `ffmpeg` automatically in the standard install locations (winget, Chocolatey, Scoop, Homebrew in `/opt/homebrew/bin` and `/usr/local/bin`, and your `PATH`). To use a specific build, set **ffmpeg Path** on the key.

---

## 🖥️ Supported Platforms

| Platform | Status |
| :--- | :--- |
| **Windows 10+** | Supported and tested, including the Camera action (requires `ffmpeg`). |
| **macOS 10.15+** | Declared in the plugin manifest but **not tested**. The cloud-based keys (telemetry and Light Toggle) use no platform-specific code and are expected to work. |

**Camera on macOS:** requires `ffmpeg` (see the prerequisite under [Installation](#-installation)). The key shows `ffmpeg Missing` if no working `ffmpeg` is found, and the plugin log says whether it is missing or blocked from running. The camera also needs access to your local network, and macOS may ask you to allow it. This is untested.

---

## ⚙️ Configuration

1. Click on any **Bambu Connect** key in Stream Deck.
2. In the Property Inspector below, enter your **Bambu Lab Account Email** and **Password**.
3. If 2FA is enabled, enter your verification code.
4. Select your printer (`KBO-P2S`, `X1C`, `P1S`, `A1`...) from the dropdown menu.
5. All other keys will automatically connect to your selected printer!

### If your printer is not listed

Bambu's Cloudflare protection can block the printer-list request from some networks, so the dropdown stays empty
and the key may show `Token Error`. The live MQTT connection is not affected, so you can enter the details by hand:

1. In the signed-in Property Inspector, type your **printer serial number** (printed on the printer's label and shown in Bambu Handy / Bambu Studio).
2. Enter your numeric **Bambu User ID** (with or without the `u_` prefix). In Bambu Studio on Windows, the account's folder name under `%APPDATA%\BambuStudio\user\` is your user ID.
3. Click **Use This Serial / User ID**. The key reconnects using these values.

Details of failed requests are written to the plugin log (`com.alejandrocabo.bambuconnect.sdPlugin/logs/`). Check it before reporting a problem, and remove your serial number and user ID from anything you share.

---

## 📷 Camera

The **Camera** action shows a live thumbnail from the printer's built-in camera and saves a snapshot when pressed. Unlike the other keys it does not use Bambu Cloud: it connects directly to the printer over your local network, so the printer and computer must be on the same network.

1. On the printer, enable **LAN Only Liveview** in the LAN mode settings and note the **IP address** and **LAN access code** shown on its screen.
2. Add the **Camera** action to a key and enter the IP address and access code in the Property Inspector.
3. The key starts showing the live view (about 3 frames per second by default). Press it to save a full-resolution JPEG to the snapshot folder (default `Pictures/Bambu Camera`).

Notes:
- Video is decoded by `ffmpeg`, which you install yourself (see [Installation](#-installation)). The plugin tries the key's **ffmpeg Path**, then a bundled copy if the plugin was built with one, then the standard system locations, then your `PATH`, and checks that the one it picks can actually run.
- The stream uses RTSPS on port 322 with the printer's self-signed certificate, as supported by X1, H2 and X2 series printers. Printers that use the older port-6000 camera protocol (P1P, P1S, A1) are not supported yet.
- The access code is stored in the key's settings and is never written to the plugin log.

---

## 🌍 Languages

Messages follow the Stream Deck app language. English, Spanish (`es`), German (`de`) and French (`fr`) are included, and any other language falls back to English. To add a language, create `<lang>.json` in the plugin folder (copy `es.json` as a template: keep the English keys and translate the values) and add the same language to `com.alejandrocabo.bambuconnect.sdPlugin/ui/i18n.js`. Text drawn on the key faces is not yet localized.

---

## 🛠️ Development & Building

```bash
# Clone the repository
git clone https://github.com/Alejandrokbo/bambu-streamdeck-plugin.git
cd bambu-streamdeck-plugin

# Install dependencies
npm install

# Build Rollup bundle
npm run build

# Validate plugin schema
npx streamdeck validate com.alejandrocabo.bambuconnect.sdPlugin

# Package for Elgato Marketplace (.streamDeckPlugin)
npx streamdeck pack com.alejandrocabo.bambuconnect.sdPlugin --force
```

The default build does **not** include `ffmpeg`. To make a package that bundles it (for example a private Windows build), install the optional helper and use the bundled scripts:

```bash
npm install --no-save ffmpeg-static
npm run build:bundled      # or: npm run pack:bundled
```

This copies the `ffmpeg` binary for the **current** platform into `com.alejandrocabo.bambuconnect.sdPlugin/bin/ffmpeg/` (git-ignored, about 80 MB), so build on each platform you want to ship.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

`ffmpeg` is not distributed with the plugin by default. If you build with `npm run build:bundled`, the `ffmpeg-static` builds it includes are GPL-licensed, so distributing that package carries FFmpeg's license obligations (see [ffmpeg.org/legal.html](https://ffmpeg.org/legal.html)).
