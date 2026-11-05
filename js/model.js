/* ==========================================================================
   LBXD Stats Generator — Data Normalization & TMDB Model
   Supports Movies, TV Shows, Person Metadata, Deduplication & Rich Enrichement
   ========================================================================== */

const TMDB_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5MWE2Yzk5YWVlMjA5MTc3ODY2NjZjMzhhODczOWU2YSIsIm5iZiI6MTc2MTk0NTEyNS4zOTEsInN1YiI6IjY5MDUyNjI1OTBmMzM4Mzc2MjRjN2NiNiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ebK9-2YoYZRKBQDHN3uhWMhEyyi77hOUD6ZTSfzWGPI';

const norm = s => (s == null ? '' : String(s)).trim();
const fkey = (n, y) => norm(n).toLowerCase().replace(/\s+/g, ' ') + '|' + norm(y);

const pick = (r, ...ns) => {
    for (const n of ns) {
        for (const k in r) {
            if (k.trim().toLowerCase() === n && norm(r[k]) !== '') return norm(r[k]);
        }
    }
    return '';
};

const num = s => {
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
};

const REQ = {
    diary: ['name', 'year'],
    ratings: ['name', 'year', 'rating'],
    watched: ['name', 'year'],
    watchlist: ['name', 'year'],
    reviews: ['name', 'year'],
    'likes-films': ['name', 'year']
};

const KNOWN = ['diary', 'ratings', 'watched', 'watchlist', 'reviews', 'profile', 'comments', 'films', 'lists'];

function parseTable(text) {
    const rows = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data;
    if (!rows.length) return { header: [], rows: [] };
    const header = rows[0].map(h => norm(h));
    return {
        header,
        rows: rows.slice(1).map(r => {
            const o = {};
            header.forEach((h, i) => o[h] = r[i] == null ? '' : r[i]);
            return o;
        })
    };
}

function classify(path, header) {
    const clean = (path || '').replace(/\\/g, '/');
    const lp = clean.toLowerCase();
    const base = lp.split('/').pop().replace(/\.csv$/, '');
    if (/(^|\/)(deleted|orphaned)\//.test(lp)) return 'bin';
    if (/(^|\/)lists\//.test(lp)) return 'list';
    if (/(^|\/)likes\//.test(lp)) return base.startsWith('film') ? 'likes-films' : 'likes-other';
    if (KNOWN.includes(base)) return base;
    const h = (header || []).map(x => (x || '').toLowerCase());
    if (h.includes('watched date') && h.includes('review')) return 'reviews';
    if (h.includes('watched date')) return 'diary';
    if (h.includes('name') && h.includes('year') && h.includes('rating')) return 'ratings';
    if (h.includes('name') && h.includes('year')) return 'films';
    return 'unknown';
}

function parseList(text) {
    const rows = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: true }).data;
    const meta = rows.findIndex(r => r[0] === 'Date' && r[1] === 'Name');
    const pos = rows.findIndex(r => r[0] === 'Position');
    if (meta < 0 || pos < 0) return null;
    return {
        name: rows[meta + 1] ? rows[meta + 1][1] : '(sin nombre)',
        url: rows[meta + 1] ? rows[meta + 1][3] : '',
        films: rows.slice(pos + 1).map(r => ({ name: r[1], year: r[2], url: r[3] }))
    };
}

// Known indicators of TV / miniseries in title, tags or URI
function isLikelyTv(title, tags, uri) {
    const t = (title || '').toLowerCase();
    const tg = (tags || '').toLowerCase();
    const u = (uri || '').toLowerCase();
    if (/\b(miniseries|mini-series|limited series|season \d+|docuseries|series|serie|tv show)\b/.test(t)) return true;
    if (/\b(miniseries|mini-series|docuseries|limited series|limited-series|series|serie|tv series|tv-series|tv show|tv-show|tv|anime series)\b/.test(tg)) return true;
    if (u.includes('/tv/') || u.includes('/series/') || u.includes('/show/') || u.includes('/shows/')) return true;
    return false;
}

async function buildModel(files, progress) {
    const tick = () => new Promise(r => setTimeout(r, 0));
    const diag = { files: [], warnings: [] };
    const W = m => diag.warnings.push(m);
    const byType = {}, seenBase = {};

    for (const f of files.slice().sort((a, b) => a.path.length - b.path.length)) {
        const cleanPath = (f.path || '').replace(/\\/g, '/');
        if (!/\.csv$/i.test(cleanPath) || /__MACOSX|\/\._/.test(cleanPath)) continue;
        progress && progress('Reading ' + cleanPath.split('/').pop() + '…');
        await tick();
        let text = '';
        try {
            text = f.getText ? await f.getText() : (typeof f.text === 'function' ? await f.text() : f.text);
        } catch (e) {
            diag.files.push({ path: cleanPath, type: '?', rows: 0, status: 'error', note: 'Could not read file' });
            continue;
        }
        const t0 = parseTable(text);
        const type = classify(cleanPath, t0.header);
        const rec = { path: cleanPath, type, rows: t0.rows.length, status: 'ok', note: '' };
        diag.files.push(rec);

        if (type === 'bin') {
            rec.status = 'ignored';
            rec.note = 'Trash/orphaned: excluded from statistics';
            continue;
        }
        if (type === 'unknown' || type === 'likes-other' || type === 'comments' || type === 'lists') {
            rec.status = 'ignored';
            rec.note = type === 'comments' ? 'Comments: not included in stats' : 'Not used in stats';
            continue;
        }
        if (type === 'list') {
            const l = parseList(text);
            if (!l) {
                rec.status = 'warn';
                rec.note = 'Unrecognized list format';
                continue;
            }
            rec.rows = l.films.length;
            (byType.list = byType.list || []).push(l);
            continue;
        }

        const bk = type + '|' + f.path.split('/').pop().toLowerCase();
        if (seenBase[bk]) {
            rec.status = 'ignored';
            rec.note = 'Duplicate of ' + seenBase[bk];
            W('Duplicate file ' + rec.path + ' (using ' + seenBase[bk] + ')');
            continue;
        }
        seenBase[bk] = f.path;

        const low = t0.header.map(h => h.toLowerCase());
        const miss = (REQ[type] || []).filter(c => !low.includes(c) && !(c === 'name' && (low.includes('title') || low.includes('film'))));
        if (miss.length) {
            rec.status = 'error';
            rec.note = 'Missing columns: ' + miss.join(', ');
            W(rec.path + ': ' + rec.note);
            continue;
        }
        if (!t0.rows.length) {
            rec.status = 'empty';
            rec.note = 'Empty file';
            continue;
        }
        byType[type] = t0.rows;
    }

    if (!Object.keys(byType).some(k => ['diary', 'ratings', 'watched', 'reviews'].includes(k))) {
        throw new Error('No valid Letterboxd export files found (diary, ratings, watched or reviews). Is this an official export ZIP?');
    }

    const F = new Map();
    const film = r => {
        const name = pick(r, 'name', 'title', 'film');
        if (!name) return null;
        const year = pick(r, 'year');
        const k = fkey(name, year);
        let f = F.get(k);
        if (!f) {
            f = {
                key: k,
                name,
                year: num(year),
                uri: '',
                rating: null,
                watched: false,
                liked: false,
                reviewed: false,
                reviews: [],
                genres: [],
                directors: [],
                cast: [],
                runtime: null,
                poster: null,
                backdrop: null,
                overview: '',
                originalTitle: '',
                releaseDate: '',
                isTv: false,
                seasons: null,
                episodes: null,
                tmdbId: null,
                mediaType: 'movie'
            };
            F.set(k, f);
        }
        return f;
    };

    const uri = r => pick(r, 'letterboxd uri', 'letterboxd url', 'url', 'uri');

    (byType.watched || []).forEach(r => {
        const f = film(r);
        if (f) {
            f.watched = true;
            f.uri = f.uri || uri(r);
            if (isLikelyTv(f.name, '', f.uri)) f.isTv = true;
        }
    });

    (byType.ratings || []).forEach(r => {
        const f = film(r);
        if (f) {
            f.watched = true;
            f.uri = f.uri || uri(r);
            const v = num(pick(r, 'rating'));
            if (v != null) f.rating = v;
            if (isLikelyTv(f.name, '', f.uri)) f.isTv = true;
        }
    });

    (byType['likes-films'] || []).forEach(r => {
        const f = film(r);
        if (f) {
            f.liked = true;
            f.uri = f.uri || uri(r);
            if (isLikelyTv(f.name, '', f.uri)) f.isTv = true;
        }
    });

    (byType.films || []).forEach(r => {
        const f = film(r);
        if (f) {
            f.uri = f.uri || uri(r);
            const g = pick(r, 'genres', 'genre');
            const d = pick(r, 'directors', 'director');
            const rt = num(pick(r, 'runtime', 'duration'));
            if (g) f.genres = g.split(/[,|]/).map(norm);
            if (d) f.directors = d.split(/[,|]/).map(norm);
            if (rt) f.runtime = rt;
            if (isLikelyTv(f.name, '', f.uri)) f.isTv = true;
        }
    });

    const entries = [];
    const diarySeen = new Set();
    let dupes = 0;

    (byType.diary || []).forEach(r => {
        const f = film(r);
        if (!f) return;
        const u = uri(r);
        const watchedDate = pick(r, 'watched date', 'date watched');
        const loggedDate = pick(r, 'date');
        const ratingVal = num(pick(r, 'rating'));
        const isRewatchFlag = /^(yes|true|1)$/i.test(pick(r, 'rewatch'));
        const tags = pick(r, 'tags');

        if (isLikelyTv(f.name, tags, u)) f.isTv = true;

        const rowKey = `${f.key}|${watchedDate}|${loggedDate}|${ratingVal}`;
        if (diarySeen.has(rowKey)) {
            dupes++;
            return;
        }
        diarySeen.add(rowKey);

        f.watched = true;
        if (!f.uri && u) f.uri = u;

        entries.push({
            key: f.key,
            uri: u || f.uri,
            logged: loggedDate,
            date: watchedDate,
            rating: ratingVal,
            rewatch: isRewatchFlag,
            tags
        });
    });

    const reviews = [];
    (byType.reviews || []).forEach(r => {
        const f = film(r);
        if (!f) return;
        const u = uri(r);
        const reviewText = pick(r, 'review');
        const watchedDate = pick(r, 'watched date', 'date watched');
        const loggedDate = pick(r, 'date');
        const ratingVal = num(pick(r, 'rating'));
        const rowKey = `${f.key}|${watchedDate}|${loggedDate}|${ratingVal}`;

        if (!diarySeen.has(rowKey) && (watchedDate || loggedDate)) {
            diarySeen.add(rowKey);
            f.watched = true;
            if (!f.uri && u) f.uri = u;
            entries.push({
                key: f.key,
                uri: u || f.uri,
                logged: loggedDate,
                date: watchedDate,
                rating: ratingVal,
                rewatch: /^(yes|true|1)$/i.test(pick(r, 'rewatch')),
                tags: pick(r, 'tags')
            });
        }

        if (reviewText) {
            f.reviewed = true;
            const revObj = { key: f.key, text: reviewText, date: loggedDate || watchedDate };
            reviews.push(revObj);
            f.reviews.push(revObj);
        }
    });

    // Chronological rewatch analysis
    const sortedEntries = entries.slice().sort((a, b) => (a.date || a.logged || '').localeCompare(b.date || b.logged || ''));
    const filmWatchTally = new Map();
    sortedEntries.forEach(e => {
        const priorCount = filmWatchTally.get(e.key) || 0;
        if (priorCount > 0 || e.rewatch) {
            e.isRewatch = true;
        } else {
            e.isRewatch = false;
        }
        filmWatchTally.set(e.key, priorCount + 1);
    });

    // Rating backfill
    F.forEach(f => {
        if (f.rating == null) {
            const rs = entries.filter(e => e.key === f.key && e.rating != null)
                .sort((a, b) => (a.logged || a.date || '').localeCompare(b.logged || b.date || ''));
            if (rs.length) f.rating = rs[rs.length - 1].rating;
        }
    });

    const prof = (byType.profile || [])[0] || {};
    const films = [...F.values()].filter(f => f.watched);
    const favoriteFilmUrls = (prof['Favorite Films'] || '').split(/\s*,\s*/).filter(Boolean);
    const normalizeUrl = value => norm(value).replace(/\/+$/, '').toLowerCase();
    const favoriteFilms = favoriteFilmUrls.length === 4
        ? favoriteFilmUrls.map(url => films.find(f => normalizeUrl(f.uri) === normalizeUrl(url))).filter(Boolean)
        : [];
    const dated = entries.filter(e => e.date);

    const sameDay = {};
    dated.forEach(e => {
        const k = e.key + e.date;
        sameDay[k] = (sameDay[k] || 0) + 1;
    });
    const sd = Object.values(sameDay).filter(n => n > 1).length;
    if (sd) W(sd + ' film(s) logged multiple times on the same date.');

    const noDate = films.filter(f => f.watched && !entries.some(e => e.key === f.key && e.date)).length;
    const miss = [];
    if (!byType.diary && !byType.reviews) miss.push('diary.csv: cannot compute viewings, dates, streaks or rewatches');
    if (!byType.ratings && !entries.some(e => e.rating != null)) miss.push('ratings.csv: no ratings found');
    miss.forEach(W);

    const rewatchesTotal = entries.filter(e => e.isRewatch || e.rewatch).length;

    diag.counts = {
        films: films.length,
        entries: entries.length,
        rated: films.filter(f => f.rating != null).length,
        dated: dated.length,
        undatedEntries: entries.length - dated.length,
        filmsNoDate: noDate,
        dupes,
        rewatches: rewatchesTotal,
        watchlist: (byType.watchlist || []).length,
        lists: (byType.list || []).length
    };

    return {
        films,
        entries,
        reviews,
        lists: byType.list || [],
        watchlist: byType.watchlist || [],
        profile: {
            user: prof.Username || '',
            givenName: prof['Given Name'] || '',
            familyName: prof['Family Name'] || '',
            joined: prof['Date Joined'] || '',
            location: prof.Location || '',
            website: prof.Website || '',
            email: prof['Email Address'] || '',
            bio: prof.Bio || '',
            pronoun: prof.Pronoun || '',
            favoriteFilms: favoriteFilms.length === 4 ? favoriteFilms : []
        },
        diag
    };
}

/* ==========================================================================
   TMDB Enrichment Engine (Movies, TV Shows & Person Bio / Filmography)
   ========================================================================== */

const _tmdbCache = {};
const _personCache = {};
const _personBioCache = {};

async function fetchJSONWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function cleanExact(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanStripped(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/^(the|a|an|el|la|los|las|le|les|das|der|die)\s+/i, '')
        .replace(/[^a-z0-9]/g, '');
}

async function enrichTMDB(films, key, onP) {
    const apiKey = key || TMDB_KEY;
    const bearer = apiKey.length > 40;
    const H = bearer ? { headers: { Authorization: 'Bearer ' + apiKey } } : {};
    const k = bearer ? '' : '&api_key=' + apiKey;
    const B = 'https://api.themoviedb.org/3';

    const q = films.slice();
    const out = {};
    let done = 0;

    films.forEach(f => {
        if (_tmdbCache[f.key] && !f.tmdbSelection) {
            out[f.key] = _tmdbCache[f.key];
        }
    });

    const worker = async () => {
        while (q.length) {
            const f = q.shift();
            if (_tmdbCache[f.key] && !f.tmdbSelection) {
                out[f.key] = _tmdbCache[f.key];
                done++;
                onP && onP(done, { ...out });
                continue;
            }

            try {
                const qExact = cleanExact(f.name);
                const qStripped = cleanStripped(f.name);
                const baseName = f.name.includes(':') ? f.name.split(':')[0].trim() : (f.name.includes(' - ') ? f.name.split(' - ')[0].trim() : '');
                const qBaseExact = baseName ? cleanExact(baseName) : '';
                let searchRes = null;
                let isTvResult = false;

                // Search both media types and use the Letterboxd year as the primary
                // discriminator. Movie results are preferred when all other signals tie.
                let multiRes = await fetchJSONWithTimeout(`${B}/search/multi?query=${encodeURIComponent(f.name)}${k}`, H);
                if (multiRes.status_code === 7 || multiRes.status_code === 10 || multiRes.success === false) {
                    q.length = 0;
                    throw new Error('Invalid TMDB API key');
                }

                let candidates = (multiRes.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
                const addResults = results => {
                    for (const result of results || []) {
                        const candidate = { ...result };
                        if (!candidate.media_type) candidate.media_type = 'movie';
                        if (!candidates.some(c => c.id === candidate.id && c.media_type === candidate.media_type)) {
                            candidates.push(candidate);
                        }
                    }
                };

                if (f.year) {
                    const movieYear = await fetchJSONWithTimeout(`${B}/search/movie?query=${encodeURIComponent(f.name)}&year=${f.year}${k}`, H)
                        .catch(() => ({}));
                    addResults(movieYear.results);
                    const tvYear = await fetchJSONWithTimeout(`${B}/search/tv?query=${encodeURIComponent(f.name)}&first_air_date_year=${f.year}${k}`, H)
                        .catch(() => ({}));
                    addResults((tvYear.results || []).map(r => ({ ...r, media_type: 'tv' })));
                }

                // Check if candidates has a confident exact title & matching year
                const hasStrongMatch = candidates.some(r => {
                    const title = r.title || r.name || '';
                    const origTitle = r.original_title || r.original_name || '';
                    const cExact = cleanExact(title);
                    const cOrigExact = cleanExact(origTitle);
                    const relDate = r.release_date || r.first_air_date || '';
                    const relYear = relDate ? +relDate.slice(0, 4) : null;
                    return (cExact === qExact || cOrigExact === qExact) && (!f.year || !relYear || Math.abs(relYear - f.year) <= 1);
                });

                // If not confident, or if TV show is hinted, search TV specifically as well
                if (!hasStrongMatch || f.isTv || !candidates.some(r => r.media_type === 'tv')) {
                    try {
                        const tvRes = await fetchJSONWithTimeout(`${B}/search/tv?query=${encodeURIComponent(f.name)}${k}`, H);
                        if (tvRes.results && tvRes.results.length) {
                            addResults(tvRes.results.map(r => ({ ...r, media_type: 'tv' })));
                        }
                    } catch {}
                }

                // If title has a base name before colon/hyphen (e.g. Twin Peaks: The Return), also search base TV show
                if (baseName && baseName !== f.name) {
                    try {
                        const tvBaseRes = await fetchJSONWithTimeout(`${B}/search/tv?query=${encodeURIComponent(baseName)}${k}`, H);
                        if (tvBaseRes.results && tvBaseRes.results.length) {
                            addResults(tvBaseRes.results.map(r => ({ ...r, media_type: 'tv' })));
                        }
                    } catch {}
                }

                // If still no candidates, fallback to movie search
                if (!candidates.length) {
                    const mRes = await fetchJSONWithTimeout(`${B}/search/movie?query=${encodeURIComponent(f.name)}${k}`, H).catch(() => ({}));
                    if (mRes.results && mRes.results.length) {
                        addResults(mRes.results.map(r => ({ ...r, media_type: 'movie' })));
                    }
                }

                if (candidates.length) {
                    let best = null;
                    let bestScore = -999999;

                    for (const r of (f.tmdbSelection ? [f.tmdbSelection] : candidates)) {
                        const title = r.title || r.name || '';
                        const origTitle = r.original_title || r.original_name || '';
                        const cExact = cleanExact(title);
                        const cOrigExact = cleanExact(origTitle);
                        const cStripped = cleanStripped(title);
                        const cOrigStripped = cleanStripped(origTitle);

                        const relDate = r.release_date || r.first_air_date || '';
                        const relYear = relDate ? +relDate.slice(0, 4) : null;

                        let score = 0;
                        const isExact = (cExact === qExact || cOrigExact === qExact);
                        const isBaseExact = qBaseExact && (cExact === qBaseExact || cOrigExact === qBaseExact);
                        const isStripped = (cStripped === qStripped || cOrigStripped === qStripped);

                        if (isExact) {
                            score += 2000;
                        } else if (isBaseExact && r.media_type === 'tv') {
                            score += 1700;
                        } else if (isStripped) {
                            score += 1500;
                        } else if (cExact.startsWith(qExact) || qExact.startsWith(cExact)) {
                            score += 400;
                        } else if (qBaseExact && (cExact.startsWith(qBaseExact) || qBaseExact.startsWith(cExact))) {
                            score += 300;
                        } else {
                            score -= 1000;
                        }

                        // Release year matching: critical for Letterboxd logged year
                        if (f.year && relYear) {
                            const diff = Math.abs(relYear - f.year);
                            if (diff === 0) {
                                score += 1200;
                            } else if (diff === 1) {
                                score += 600;
                            } else if (diff === 2) {
                                score += 200;
                            } else {
                                if (r.media_type === 'tv' && relYear < f.year && (isExact || isBaseExact || isStripped)) {
                                    score += 400; // Multi-season show airing in a later year
                                } else {
                                    score -= (2500 + diff * 100);
                                }
                            }
                        }

                        // TV boost if hinted
                        if (r.media_type === 'tv' && f.isTv) {
                            score += 500;
                        }
                        if (r.media_type === 'movie' && !f.isTv) score += 100;

                        score += Math.min(60, (r.popularity || 0) / 5);

                        if (score > bestScore) {
                            bestScore = score;
                            best = r;
                        }

                    }

                    if (best) {
                        searchRes = best;
                        isTvResult = best.media_type === 'tv';
                    }
                }

                if (searchRes) {
                    const tmdbId = searchRes.id;
                    let enriched = null;

                    if (isTvResult) {
                        const d = await fetchJSONWithTimeout(`${B}/tv/${tmdbId}?append_to_response=credits${k}`, H);
                        enriched = {
                            isTv: true,
                            mediaType: 'tv',
                            tmdbId: d.id,
                            genres: (d.genres || []).map(g => g.name),
                            runtime: (d.episode_run_time && d.episode_run_time[0]) || null,
                            seasons: d.number_of_seasons || 1,
                            episodes: d.number_of_episodes || null,
                            poster: d.poster_path ? 'https://image.tmdb.org/t/p/w342' + d.poster_path : null,
                            backdrop: d.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + d.backdrop_path : null,
                            overview: d.overview || '',
                            releaseDate: d.first_air_date || '',
                            originalTitle: d.original_name || '',
                            directors: ((d.created_by && d.created_by.length)
                                ? d.created_by.map(c => ({
                                    name: c.name,
                                    photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : null,
                                    id: c.id,
                                    role: 'Creator'
                                }))
                                : ((d.credits || {}).crew || []).filter(c => c.job === 'Director' || c.job === 'Executive Producer').slice(0, 3).map(c => ({
                                    name: c.name,
                                    photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : null,
                                    id: c.id,
                                    role: c.job
                                }))
                            ),
                            cast: ((d.credits || {}).cast || []).slice(0, 15).map(c => ({
                                n: c.name,
                                g: c.gender,
                                photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : null,
                                id: c.id
                            }))
                        };
                    } else {
                        const d = await fetchJSONWithTimeout(`${B}/movie/${tmdbId}?append_to_response=credits${k}`, H);
                        enriched = {
                            isTv: false,
                            mediaType: 'movie',
                            tmdbId: d.id,
                            genres: (d.genres || []).map(g => g.name),
                            runtime: d.runtime || null,
                            seasons: null,
                            episodes: null,
                            poster: d.poster_path ? 'https://image.tmdb.org/t/p/w342' + d.poster_path : null,
                            backdrop: d.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + d.backdrop_path : null,
                            overview: d.overview || '',
                            releaseDate: d.release_date || '',
                            originalTitle: d.original_title || '',
                            directors: ((d.credits || {}).crew || [])
                                .filter(c => c.job === 'Director')
                                .map(c => ({
                                    name: c.name,
                                    photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : null,
                                    id: c.id,
                                    role: 'Director'
                                })),
                            cast: ((d.credits || {}).cast || []).slice(0, 15).map(c => ({
                                n: c.name,
                                g: c.gender,
                                photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : null,
                                id: c.id
                            }))
                        };
                    }

                    out[f.key] = enriched;
                    _tmdbCache[f.key] = enriched;
                }
            } catch (err) {
                if (err.message && err.message.includes('API key')) throw err;
            }
            done++;
            onP && onP(done, { ...out });
        }
    };

    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
    return out;
}

async function searchTMDBCandidates(query, year, key) {
    const apiKey = key || TMDB_KEY;
    const bearer = apiKey.length > 40;
    const H = bearer ? { headers: { Authorization: 'Bearer ' + apiKey } } : {};
    const k = bearer ? '' : '&api_key=' + apiKey;
    const B = 'https://api.themoviedb.org/3';
    const params = year ? `&year=${encodeURIComponent(year)}` : '';
    const tvParams = year ? `&first_air_date_year=${encodeURIComponent(year)}` : '';
    const [movies, shows] = await Promise.all([
        fetchJSONWithTimeout(`${B}/search/movie?query=${encodeURIComponent(query)}${params}${k}`, H),
        fetchJSONWithTimeout(`${B}/search/tv?query=${encodeURIComponent(query)}${tvParams}${k}`, H)
    ]);
    return [
        ...(movies.results || []).map(r => ({ ...r, media_type: 'movie', release_date: r.release_date || '' })),
        ...(shows.results || []).map(r => ({ ...r, media_type: 'tv', release_date: r.first_air_date || '' }))
    ].slice(0, 20);
}

/* Search person profile photo */
async function fetchPersonPhoto(name) {
    if (!name) return null;
    if (_personCache[name] !== undefined) return _personCache[name];
    const H = { headers: { Authorization: 'Bearer ' + TMDB_KEY } };
    const B = 'https://api.themoviedb.org/3';
    try {
        const s = await (await fetch(`${B}/search/person?query=${encodeURIComponent(name)}`, H)).json();
        const p = s.results && s.results[0];
        const photo = p && p.profile_path ? 'https://image.tmdb.org/t/p/w185' + p.profile_path : null;
        _personCache[name] = photo;
        return photo;
    } catch {
        _personCache[name] = null;
        return null;
    }
}

/* Fetch person biography and details */
async function fetchPersonDetails(personName, personId) {
    if (!personName) return null;
    if (_personBioCache[personName]) return _personBioCache[personName];

    const H = { headers: { Authorization: 'Bearer ' + TMDB_KEY } };
    const B = 'https://api.themoviedb.org/3';

    try {
        let pId = personId;
        if (!pId) {
            const s = await (await fetch(`${B}/search/person?query=${encodeURIComponent(personName)}`, H)).json();
            const p = s.results && s.results[0];
            if (p) pId = p.id;
        }

        if (pId) {
            const d = await (await fetch(`${B}/person/${pId}`, H)).json();
            const res = {
                id: d.id,
                name: d.name,
                biography: d.biography || '',
                birthday: d.birthday || '',
                deathday: d.deathday || null,
                placeOfBirth: d.place_of_birth || '',
                photo: d.profile_path ? 'https://image.tmdb.org/t/p/w300' + d.profile_path : null,
                knownFor: d.known_for_department || ''
            };
            _personBioCache[personName] = res;
            return res;
        }
    } catch {
        // Fallback gracefully
    }
    return null;
}

/* Helper to preload an image URL into browser cache with a timeout */
function preloadImage(url, timeoutMs = 2500) {
    if (!url || typeof Image === 'undefined') return Promise.resolve(null);
    return new Promise(resolve => {
        let settled = false;
        const img = new Image();
        const finish = () => {
            if (!settled) {
                settled = true;
                resolve(url);
            }
        };
        img.onload = finish;
        img.onerror = finish;
        setTimeout(finish, timeoutMs);
        img.src = url;
    });
}

/* Preload GraphEd Assets & Photos before displaying the presentation */
async function preloadGraphEdAssets(M, year, onStep) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Step 1: Revisiting your cinematic year
    if (onStep) onStep('Revisiting your cinematic year...');
    await sleep(250);
    const data = (typeof YearStats !== 'undefined' && YearStats.getFullYearData) 
        ? YearStats.getFullYearData(M, year) 
        : null;
    if (!data) return null;

    // Step 2: Finding your most watched directors
    if (onStep) onStep('Finding your most watched directors...');
    if (data.topDirectors && data.topDirectors.length) {
        await Promise.all(data.topDirectors.slice(0, 5).map(async d => {
            const name = d.n || d.name;
            if (!d.photo && name) {
                d.photo = await fetchPersonPhoto(name);
            }
            if (d.photo) await preloadImage(d.photo);
        }));
    }
    if (data.topDirector) {
        const dName = data.topDirector.n || data.topDirector.name;
        if (!data.topDirector.photo && dName) {
            data.topDirector.photo = await fetchPersonPhoto(dName);
        }
        if (data.topDirector.photo) await preloadImage(data.topDirector.photo);
    }
    await sleep(200);

    // Step 3: Gathering your favorite faces
    if (onStep) onStep('Gathering your favorite faces...');
    if (data.topActors && data.topActors.length) {
        await Promise.all(data.topActors.slice(0, 5).map(async a => {
            const name = a.n || a.name;
            if (!a.photo && name) {
                a.photo = await fetchPersonPhoto(name);
            }
            if (a.photo) await preloadImage(a.photo);
        }));
    }
    if (data.topActor) {
        const aName = data.topActor.n || data.topActor.name;
        if (!data.topActor.photo && aName) {
            data.topActor.photo = await fetchPersonPhoto(aName);
        }
        if (data.topActor.photo) await preloadImage(data.topActor.photo);
    }
    await sleep(200);

    // Step 4: Preparing your movie posters
    if (onStep) onStep('Preparing your movie posters...');

    const filmsToEnrich = [
        data.topReleasedFilm,
        data.topFilm,
        data.firstFilm,
        data.lastFilm,
        data.mostRewatched ? data.mostRewatched.film : null,
        data.worstFilm,
        ...(data.topReleasedFilms || []).slice(0, 4),
        ...(data.topFilms || []).slice(0, 8)
    ].filter(Boolean);

    // If any key film lacks poster or backdrop, enrich via TMDB
    const needingTMDB = filmsToEnrich.filter(f => !f.poster || !f.backdrop);
    if (needingTMDB.length) {
        try {
            const enr = await enrichTMDB(needingTMDB, TMDB_KEY);
            needingTMDB.forEach(f => {
                if (enr && enr[f.key]) Object.assign(f, enr[f.key]);
            });
        } catch (e) {}
    }

    const imagesToPreload = [];
    filmsToEnrich.forEach(f => {
        if (f.poster) imagesToPreload.push(f.poster);
        if (f.backdrop) imagesToPreload.push(f.backdrop);
    });

    await Promise.all(imagesToPreload.map(url => preloadImage(url)));
    await sleep(250);

    // Step 5: Building your year in film
    if (onStep) onStep('Building your year in film...');
    await sleep(300);

    return data;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildModel,
        classify,
        parseTable,
        enrichTMDB,
        searchTMDBCandidates,
        fetchPersonPhoto,
        fetchPersonDetails,
        preloadGraphEdAssets,
        TMDB_KEY
    };
}
