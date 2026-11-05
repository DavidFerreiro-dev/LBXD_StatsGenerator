<p align="center">
  <img src="media/logo.png" alt="LBXD Stats Generator Logo" width="320" />
</p>

<h1 align="center">LBXD — Cinema Stats Generator & Annual GraphEd</h1>

<p align="center">
  <strong>Your cinematic life analyzed with the visual atmosphere, precision, and soul of Letterboxd.</strong>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/Platform-Web%20Browser-00E054?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Platform"></a>
  <a href="#privacy"><img src="https://img.shields.io/badge/Privacy-100%25%20Local%20%26%20Private-00E054?style=for-the-badge&logo=privateinternetaccess&logoColor=white" alt="Privacy"></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/React-18.3-202830?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"></a>
  <a href="#credits"><img src="https://img.shields.io/badge/Metadata-TMDB%20API-01B4E4?style=for-the-badge&logo=themoviedatabase&logoColor=white" alt="TMDB"></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-FF8000?style=for-the-badge" alt="License"></a>
</p>

---

## 📽️ Overview

**LBXD Stats Generator** is a fast, client-side web application designed to bring your Letterboxd movie and series history to life. Simply import your official Letterboxd ZIP data export to unlock deep viewing analytics, director and actor filmographies with high-resolution portraits, television series classification, and an interactive editorial slide deck (**Annual GraphEd**).

Built from the ground up to honor Letterboxd's signature dark aesthetic, typography, and color palette.

---

## ✨ What It Has (Key Features)

### 🔒 100% Local & Privacy-First
- **Zero Server Storage**: Your viewing diary, ratings, watchlist, and comments are parsed exclusively in your browser memory using Web APIs (`JSZip` and `PapaParse`).
- **No Account Linking Required**: No username or password needed; your data stays entirely on your device.

### 📊 Deep Cinema Statistics & Viewing Records
- **Core KPIs**: Total unique titles, logged viewings, rewatch tally, personal star average, and estimated total watch time (in hours and days).
- **Viewing Streaks**: Automatic detection of your longest consecutive daily cinema streak and single-day viewing records.
- **Viewing Habits**: Day-of-the-week preferences (e.g., Sunday cinephile index) and monthly viewing rhythm.
- **Rating Distribution**: Complete histogram visualization across all half-star ratings (from 0.5★ to 5.0★).
- **Yearly Viewing Activity**: Historical timeline of your cinema activity across the years.
- **Year Filter & Search**: Filter all statistics by any specific year or search instantly.

### 🎬 Filmmakers & Cast Hub (TMDB Powered)
- **High-Resolution Portraits**: Direct integration with The Movie Database (TMDB) API for director, actor, and actress portraits.
- **Top Rankings**: Ranked leaders by titles watched and highest personal star average (with minimum viewing thresholds).
- **Person Modals**: Click on any director, actor, or actress to view their bio, birthdate, birthplace, and your personal filmography of their works sorted by your rating.
- **Actor/Actress Search**: Instant real-time search across all directors, actors, and actresses in your cinema history.

### 🎞️ Unified Film Catalogue & TMDB Matching
- **Year-aware matching**: Letterboxd's release year is checked against TMDB release dates before metadata is shown, preventing titles such as *Carrie* or *Obsession* from resolving to the wrong work.
- **Films and series in one catalogue**: Series are displayed alongside films without a TV badge; their TMDB seasons and episode data are still retained internally.
- **Manual correction**: The detail modal includes **"Cambiar obra"**, which searches TMDB by title and year so an ambiguous result can be corrected without re-importing the export.

### ✍️ Rich Review Formatting (HTML Support)
- **Rendered HTML Tags**: Formats Letterboxd reviews preserving `<b>`, `<strong>`, `<i>`, `<em>`, `<p>`, `<a>`, and `<blockquote>` styling rather than displaying raw code.

### ✨ Annual GraphEd (Cinematic Story Mode)
- **Interactive Slideshow**: An editorial, Letterboxd Year-in-Review / Wrapped-style presentation.
- **Curated Slides**:
  - Slide 0: Year intro & total cinema hours.
  - Slide 1: Your official **Film of the Year**.
  - Slide 2: Top Runner-Ups and highest-rated gems.
  - Slide 3: How your year started vs. how it ended.
  - Slide 4: Most-watched directors with TMDB portraits.
  - Slide 5: Most-frequent actors and screen stars.
  - Slide 6: Most-rewatched comfort films.
  - Slide 7: Viewing rhythm and sacred movie days.
  - Slide 8: The Grand Finale wrap-up summary.

### 🍿 Instant Offline Demo Mode
- Test the application instantly with 1 click using an authentic curated sample dataset (featuring Christopher Nolan, Denis Villeneuve, Bong Joon-ho, Hayao Miyazaki, and more) without needing an export file.

---

## 🚫 What It Does Not Have (Scope & Limitations)

To maintain privacy, lightness, and security, LBXD deliberately avoids certain features:

| Limitation | Reason & Context |
| :--- | :--- |
| **No Cloud Sync / Database** | All processing is 100% ephemeral in the browser's local state. Nothing is sent to or stored on private servers. |
| **No Direct Letterboxd Account Write** | Letterboxd does not provide a public write API for standard members. The app operates as an analysis layer on exported data. |
| **No Heavy Server Dependencies** | Pure client-side static application. No Node.js backend or database server is required to run it in production. |
| **No Dark/Light Mode Toggle** | Locked exclusively in dark mode (`#14181C`) to preserve the authentic, immersive Letterboxd cinematic contrast. |

---

## 🚀 Quick Start Guide

### How to Get Your Letterboxd Export
1. Log into your account on [letterboxd.com](https://letterboxd.com).
2. Go to **Settings** (`/settings/`).
3. Click on the **Data** tab in the top navigation.
4. Click the green button: **Export Your Data**.
5. Save the resulting `.zip` file (do not unzip it).

### Running the App Locally
No build process or NPM installation is required.

```bash
# Clone the repository
git clone https://github.com/your-username/LBXD_StatsGenerator.git
cd LBXD_StatsGenerator

# Open index.html directly in your browser, or serve with any static server:
npx serve .
# or
python -m http.server 8080
```

1. Open `http://localhost:8080` (or double-click `index.html`).
2. Drag & drop your `.zip` file into the dropzone (or click **"Load Demo"** to explore immediately).
3. Enjoy your cinematic dashboard!

---

## 🛠️ Tech Stack & Architecture

- **Frontend Core**: Vanilla React 18 (via UMD) + [`htm`](https://github.com/developit/htm) (JSX-like template literals in standard JavaScript with zero build step).
- **ZIP Decompression**: [JSZip](https://stuk.github.io/jszip/) for asynchronous in-memory extraction of CSV tables.
- **CSV Parsing**: [PapaParse](https://www.papaparse.com/) with RFC 4180 compliance, header detection, and Unicode BOM handling.
- **Metadata API**: [The Movie Database (TMDB) API v3](https://www.themoviedb.org/) for high-res artwork, cast, directors, and runtimes.
- **Styling**: Vanilla CSS3 Custom Properties, Responsive Grid, Flexbox, and CSS animations.
- **Typography**: Google Fonts (*Fraunces* serif & *Inter* sans-serif).

---

## 📜 Credits & Attributions

- **Inspiration**: Designed with utmost admiration for [Letterboxd](https://letterboxd.com/), the best social network for film lovers.
- **Film Metadata & Posters**: Artwork and filmography data provided by [The Movie Database (TMDB)](https://www.themoviedb.org/).
  > *This product uses the TMDB API but is not endorsed or certified by TMDB.*
- **Open Source Libraries**:
  - React & React-DOM
  - `htm` by Developit
  - JSZip
  - PapaParse

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

<p align="center">
  <strong>Made with ❤️ for cinema lovers and film buffs around the world.</strong>
</p>
