# Continum

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Express](https://img.shields.io/badge/express-4.x-informational.svg)](https://expressjs.com/)

**Continum** is a modern, lightweight Express-powered web control panel designed for Discord automation and account state management. It provides a clean browser UI to monitor client state, manage voice channels, switch presence statuses, override user status, and run background message loops seamlessly.

---

## ✨ Features

- **🌐 Web Control Panel**: Clean dashboard interface powered by Express and EJS templates.
- **🎙️ Voice Management**: Connect to Discord voice channels with configurable self-mute and self-deaf options.
- **🟢 Presence & Status Control**: Change online presence state (Online, Idle, DND, Offline) and set custom status overrides directly from the browser.
- **💬 Background Chat Activity**: Automated background message sender targeting a designated text channel at randomized intervals.
- **📊 Real-time Account Overview**: Monitor user profile details, active connections, and runtime logs directly on the dashboard.

---

## 📁 Project Structure

```text
Continum/
├── index.js              # Application entry point, Discord client, and Express API routes
├── config.json           # Local application configuration state
├── .env                  # Environment variables and secrets (Git ignored)
├── package.json          # Node dependencies and project metadata
└── views/                # Dynamic EJS views and dashboard partials
    ├── index.ejs         # Main dashboard view layout
    └── partials/         # UI components & sections
        ├── new-sidebar.ejs
        ├── user-card.ejs
        └── status-override.ejs
```

---

## ⚡ Quick Start

### 1. Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Installation

Clone the repository and install project dependencies:

```bash
git clone https://github.com/burnedglitchy/Continum.git
cd Continum
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory and define the following variables:

```env
# Discord Account User Token
TOKEN=your_discord_token_here

# Target Channel ID for background chat activity
SPAM_CHANNEL_ID=your_target_channel_id_here

# Webserver Port (Default: 4000)
PORT=4000
```

### 4. Running the Application

Start the Continum server:

```bash
node index.js
```

Once launched, access the web UI by navigating to:
```text
http://localhost:4000
```

---

## 🛠️ Usage & Control Panel

| Feature | Description |
| :--- | :--- |
| **Authentication** | Automatically authenticates using the `TOKEN` specified in `.env`. |
| **Voice Join** | Enter `guildId` and `channelId` to switch or join voice channels with custom `mute`/`deaf` flags. |
| **Presence Switch** | Toggle account presence between `online`, `idle`, `dnd`, and `offline`. |
| **Background Loop** | Sends periodic background messages to `SPAM_CHANNEL_ID` at randomized intervals (60s–120s). |

---

## ⚠️ Disclaimer & Risk Warning

> **Warning**: Using selfbot automation libraries (`discord.js-selfbot-v13`) on user accounts is against the [Discord Terms of Service](https://discord.com/terms). Using this application may lead to account suspension or termination. Use at your own risk and responsibility.

---

## 📄 License

Distributed under the **ISC License**. See `package.json` for details.
