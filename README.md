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

---

## 🚀 Installation

1. Download the latest `.streamDeckPlugin` release from the [Releases](https://github.com/Alejandrokbo/bambu-streamdeck-plugin/releases) section.
2. Double-click `com.alejandrocabo.bambuconnect.streamDeckPlugin` to install it into Elgato Stream Deck.
3. Open Stream Deck and drag any action from the **Bambu Connect** category onto your key grid.

---

## ⚙️ Configuration

1. Click on any **Bambu Connect** key in Stream Deck.
2. In the Property Inspector below, enter your **Bambu Lab Account Email** and **Password**.
3. If 2FA is enabled, enter your verification code.
4. Select your printer (`KBO-P2S`, `X1C`, `P1S`, `A1`...) from the dropdown menu.
5. All other keys will automatically connect to your selected printer!

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

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
