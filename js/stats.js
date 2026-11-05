/* ==========================================================================
   LBXD Stats Generator — Pure Stats Computation
   Supports Movies & TV Shows Separation, Rich People Metrics & Habits
   ========================================================================== */

const MES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DIA = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const dayN = s => Math.floor(Date.parse(s + 'T00:00:00Z') / 864e5);
const wd = s => (new Date(s + 'T00:00:00Z').getUTCDay() + 6) % 7;

const tally = (arr, fn) => {
    const m = new Map();
    arr.forEach(x => {
        const k = fn(x);
        if (k != null && k !== '') m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
};

const fmap = M => new Map(M.films.map(f => [f.key, f]));

const isRew = (M, f) => {
    const list = M.entries.filter(e => e.key === f.key);
    return list.length > 1 || list.some(e => e.isRewatch || e.rewatch);
};

function applyFilters(M, q) {
    const fm = fmap(M);
    const yr = q.year ? +q.year : null;

    let films = M.films.filter(f => {
        if (q.decade && !(f.year && Math.floor(f.year / 10) * 10 === +q.decade)) return false;
        if (q.rating && !(f.rating != null && f.rating >= +q.rating)) return false;
        if (q.liked && !f.liked) return false;
        if (q.genre && !(f.genres || []).includes(q.genre)) return false;

        if (q.director) {
            const hasDir = (f.directors || []).some(d => (typeof d === 'string' ? d : d.name) === q.director);
            if (!hasDir) return false;
        }

        if (q.actor) {
            const hasActor = (f.cast || []).some(c => (typeof c === 'string' ? c : c.n) === q.actor);
            if (!hasActor) return false;
        }

        if (q.rewatched && !isRew(M, f)) return false;
        if (yr && !M.entries.some(e => e.key === f.key && e.date && +e.date.slice(0, 4) === yr)) return false;
        return true;
    });

    const keys = new Set(films.map(f => f.key));
    let entries = M.entries.filter(e => keys.has(e.key) && (!yr || (e.date && +e.date.slice(0, 4) === yr)));
    if (q.rewatched) entries = entries.filter(e => e.isRewatch || e.rewatch);

    return {
        films,
        entries,
        reviews: M.reviews.filter(r => keys.has(r.key)),
        fm
    };
}

function people(films, getter, minForBest = 2) {
    const m = new Map();
    films.forEach(f => {
        const items = getter(f) || [];
        items.forEach(p => {
            const name = typeof p === 'string' ? p : (p && (p.name || p.n)) || '';
            if (!name) return;
            const photo = (p && typeof p === 'object') ? (p.photo || null) : null;
            const id = (p && typeof p === 'object') ? (p.id || null) : null;
            const role = (p && typeof p === 'object') ? (p.role || null) : null;

            const o = m.get(name) || {
                n: name,
                c: 0,
                r: [],
                photo: null,
                id: null,
                role: null,
                films: []
            };

            o.c++;
            if (photo && !o.photo) o.photo = photo;
            if (id && !o.id) o.id = id;
            if (role && !o.role) o.role = role;
            if (f.rating != null) o.r.push(f.rating);
            o.films.push(f);
            m.set(name, o);
        });
    });

    const all = [...m.values()].map(o => {
        const sortedF = o.films.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
        return {
            n: o.n,
            c: o.c,
            avg: avg(o.r),
            nr: o.r.length,
            photo: o.photo,
            id: o.id,
            role: o.role,
            films: o.films,
            topFilm: sortedF[0] || null,
            favCount: o.films.filter(f => f.liked || (f.rating && f.rating >= 4.5)).length
        };
    });

    return {
        all,
        most: all.slice().sort((a, b) => b.c - a.c || a.n.localeCompare(b.n)),
        best: all.filter(o => o.nr >= minForBest).sort((a, b) => b.avg - a.avg || b.c - a.c)
    };
}

function compute(V) {
    const { films = [], entries = [], reviews = [] } = V || {};
    const fm = (V && V.fm) ? V.fm : (films.length ? fmap({ films }) : new Map());
    const rated = films.filter(f => f.rating != null);
    const dated = entries.filter(e => e.date);

    // Split movies vs TV shows
    const movies = films.filter(f => !f.isTv);
    const shows = films.filter(f => f.isTv);
    const movieEntries = entries.filter(e => {
        const f = fm.get(e.key);
        return f && !f.isTv;
    });
    const showEntries = entries.filter(e => {
        const f = fm.get(e.key);
        return f && f.isTv;
    });

    const sortKeys = m => [...m.entries()].sort((a, b) => a[0] > b[0] ? 1 : -1);
    const byYear = sortKeys(tally(dated, e => e.date.slice(0, 4))).map(([l, v]) => ({ l, v }));

    const mm = tally(dated, e => e.date.slice(0, 7));
    const byMonth = [];
    if (mm.size) {
        const ks = [...mm.keys()].sort();
        let [y, m] = ks[0].split('-').map(Number);
        const [ey, em] = ks[ks.length - 1].split('-').map(Number);
        while (y < ey || (y === ey && m <= em)) {
            const k = y + '-' + String(m).padStart(2, '0');
            byMonth.push({ l: MES[m - 1] + ' ' + String(y).slice(2), v: mm.get(k) || 0 });
            if (++m > 12) { m = 1; y++; }
        }
    }

    const wdc = tally(dated, e => wd(e.date));
    const moc = tally(dated, e => +e.date.slice(5, 7) - 1);
    const weekday = DIA.map((l, i) => ({ l, v: wdc.get(i) || 0 }));
    const monthOfYear = MES.map((l, i) => ({ l, v: moc.get(i) || 0 }));

    // Star rating distribution (0.5 to 5.0)
    const dist = [];
    for (let r = 0.5; r <= 5; r += 0.5) {
        const count = rated.filter(f => f.rating === r).length;
        const pct = rated.length ? Math.round((count / rated.length) * 100) : 0;
        dist.push({ l: String(r), v: count, pct });
    }

    const ay = {};
    dated.forEach(e => {
        if (e.rating != null) {
            const y = e.date.slice(0, 4);
            (ay[y] = ay[y] || []).push(e.rating);
        }
    });
    const avgByYear = Object.keys(ay).sort().map(l => ({ l, v: avg(ay[l]), n: ay[l].length }));

    const dc = tally(films.filter(f => f.year), f => Math.floor(f.year / 10) * 10);
    const decades = sortKeys(dc).map(([l, v]) => ({ l: l + 's', v }));

    const withYear = films.filter(f => f.year).sort((a, b) => a.year - b.year);
    const dayCounts = tally(dated, e => e.date);
    const days = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]);

    const ds = [...dayCounts.keys()].map(dayN).sort((a, b) => a - b);
    let best = 0, run = 0, bEnd = 0;
    ds.forEach((d, i) => {
        run = i && d === ds[i - 1] + 1 ? run + 1 : 1;
        if (run > best) { best = run; bEnd = d; }
    });

    const vc = tally(entries, e => e.key);
    const topBy = (arr, cmp, n = 24) => arr.slice().sort(cmp).slice(0, n);
    const byR = (a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name);
    const rt = films.filter(f => f.runtime);

    const dir = people(films, f => f.directors);
    const act = people(films, f => f.cast ? f.cast.filter(c => c.g === 2 || !c.g) : []);
    const actr = people(films, f => f.cast ? f.cast.filter(c => c.g === 1) : []);
    const castAll = people(films, f => f.cast || []);
    const gen = people(films, f => f.genres || []);

    // TV specific people
    const tvDir = people(shows, f => f.directors);
    const tvCast = people(shows, f => f.cast || []);

    const rewatchEntries = entries.filter(e => e.isRewatch || e.rewatch);
    const rewatchesCount = rewatchEntries.length;
    const rewatchedFilmsCount = new Set(rewatchEntries.map(e => e.key)).size;

    // TV specific rewatches
    const tvRewatchEntries = showEntries.filter(e => e.isRewatch || e.rewatch);

    // Episodes count calculation:
    // If show has seasons/episodes from TMDB, estimate total episodes watched
    let totalEpisodes = 0;
    shows.forEach(s => {
        const viewCount = vc.get(s.key) || 1;
        if (s.episodes) totalEpisodes += s.episodes * viewCount;
        else totalEpisodes += viewCount;
    });

    // Favorite weekday & month
    const favWeekday = weekday.slice().sort((a, b) => b.v - a.v)[0];
    const favMonth = monthOfYear.slice().sort((a, b) => b.v - a.v)[0];

    return {
        films,
        entries,
        movies,
        shows,
        n: films.length,
        viewings: entries.length,
        rated: rated.length,
        rewatches: rewatchesCount,
        rewatchedFilms: rewatchedFilmsCount,
        reviews: reviews.length,
        avg: avg(rated.map(f => f.rating)),
        pctRated: films.length ? (rated.length / films.length * 100) : null,
        minutes: rt.length ? rt.reduce((a, f) => a + (f.runtime || 0), 0) : null,
        rtCount: rt.length,
        undated: entries.length - dated.length,

        // Movies specific
        moviesCount: movies.length,
        movieViewings: movieEntries.length,
        movieRewatches: movieEntries.filter(e => e.isRewatch || e.rewatch).length,
        movieTop: topBy(movies.filter(f => f.rating != null), byR),
        movieWorst: topBy(movies.filter(f => f.rating != null), (a, b) => (a.rating || 0) - (b.rating || 0) || a.name.localeCompare(b.name)),

        // TV specific
        showsCount: shows.length,
        showViewings: showEntries.length,
        showRewatches: tvRewatchEntries.length,
        showsTop: topBy(shows.filter(f => f.rating != null), byR),
        showEpisodes: totalEpisodes,
        tvDir,
        tvCast,

        // Time calculations
        hours: rt.length ? Math.round(rt.reduce((a, f) => a + (f.runtime || 0), 0) / 60) : null,
        daysWatchTime: rt.length ? +(rt.reduce((a, f) => a + (f.runtime || 0), 0) / 1440).toFixed(1) : null,

        // Charts data
        byYear,
        byMonth,
        weekday,
        monthOfYear,
        favWeekday,
        favMonth,
        dist,
        avgByYear,
        decades,

        // Calendar Milestones
        oldest: withYear[0],
        newest: withYear[withYear.length - 1],
        recordDay: days[0],
        streak: best,
        streakEnd: bEnd ? new Date(bEnd * 864e5).toISOString().slice(0, 10) : null,
        activeDays: dayCounts.size,

        // Lists of films
        top: topBy(rated, byR),
        worst: topBy(rated, (a, b) => (a.rating || 0) - (b.rating || 0) || a.name.localeCompare(b.name)),
        liked: films.filter(f => f.liked).slice(0, 24),
        five: rated.filter(f => f.rating === 5).slice(0, 24),
        half: rated.filter(f => f.rating === 0.5).slice(0, 24),
        mostSeen: topBy(films.filter(f => (vc.get(f.key) || 0) > 1), (a, b) => (vc.get(b.key) || 0) - (vc.get(a.key) || 0) || a.name.localeCompare(b.name)),
        mostRew: topBy(films.filter(f => entries.some(e => e.key === f.key && (e.isRewatch || e.rewatch))), (a, b) => {
            const countA = entries.filter(e => e.key === a.key && (e.isRewatch || e.rewatch)).length;
            const countB = entries.filter(e => e.key === b.key && (e.isRewatch || e.rewatch)).length;
            return countB - countA || a.name.localeCompare(b.name);
        }),

        // People
        vc,
        dir,
        act,
        actr,
        castAll,
        gen,
        hasPeople: films.some(f => (f.directors && f.directors.length) || (f.cast && f.cast.length)),
        hasGenres: films.some(f => f.genres && f.genres.length)
    };
}

/* ==========================================================================
   Year in Review Stats (GraphEd Engine)
   ========================================================================== */

const YearStats = {
    viewings: (M, y) => M.entries.filter(e => e.date && +e.date.slice(0, 4) === y),
    released: (M, y) => M.films.filter(f => f.watched && f.year === y),
    uniqueFilms: (M, y) => {
        const m = fmap(M);
        const s = new Set(YearStats.viewings(M, y).map(e => e.key));
        return [...s].map(k => m.get(k)).filter(Boolean);
    },
    first: (M, y) => {
        const dated = YearStats.viewings(M, y).filter(e => e.date).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        return dated[0] || YearStats.viewings(M, y)[0] || null;
    },
    last: (M, y) => {
        const dated = YearStats.viewings(M, y).filter(e => e.date).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return dated[0] || YearStats.viewings(M, y)[0] || null;
    },
    topRated: (M, y, n = 6) => {
        const m = fmap(M);
        const s = new Set(YearStats.viewings(M, y).map(e => e.key));
        return [...s].map(k => m.get(k)).filter(f => f && f.rating != null).sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name)).slice(0, n);
    },
    topReleased: (M, y, n = 6) => {
        const m = fmap(M);
        const s = new Set(YearStats.viewings(M, y).map(e => e.key));
        let list = [...s].map(k => m.get(k) || M.films.find(f => f.key === k)).filter(f => f && f.year === y && f.rating != null);
        if (!list.length) {
            list = [...s].map(k => m.get(k) || M.films.find(f => f.key === k)).filter(f => f && f.year === y);
        }
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.liked ? 1 : 0) - (a.liked ? 1 : 0) || a.name.localeCompare(b.name));
        return list.slice(0, n);
    },
    worstRated: (M, y, n = 5) => {
        const m = fmap(M);
        const s = new Set(YearStats.viewings(M, y).map(e => e.key));
        return [...s].map(k => m.get(k)).filter(f => f && f.rating != null).sort((a, b) => (a.rating || 0) - (b.rating || 0) || a.name.localeCompare(b.name)).slice(0, n);
    },
    topDirector: (M, y) => {
        const flms = YearStats.uniqueFilms(M, y);
        return people(flms, f => f.directors).most[0] || null;
    },
    topDirectors: (M, y, n = 5) => {
        const flms = YearStats.uniqueFilms(M, y);
        return people(flms, f => f.directors).most.slice(0, n);
    },
    topActor: (M, y) => {
        const flms = YearStats.uniqueFilms(M, y);
        return people(flms, f => f.cast).most[0] || null;
    },
    topActors: (M, y, n = 5) => {
        const flms = YearStats.uniqueFilms(M, y);
        return people(flms, f => f.cast).most.slice(0, n);
    },
    mostRewatched: (M, y) => {
        const vs = YearStats.viewings(M, y);
        const counts = tally(vs, e => e.key);
        const rewatchEntries = vs.filter(e => e.isRewatch || e.rewatch);
        const rewatchCounts = tally(rewatchEntries, e => e.key);
        const m = fmap(M);

        const candidates = [...counts.entries()].map(([k, count]) => {
            return {
                film: m.get(k),
                totalYearViews: count,
                rewatchesInYear: rewatchCounts.get(k) || 0
            };
        }).filter(c => c.film && (c.totalYearViews > 1 || c.rewatchesInYear > 0));

        candidates.sort((a, b) => b.totalYearViews - a.totalYearViews || b.rewatchesInYear - a.rewatchesInYear);
        return candidates[0] || null;
    },
    rewatches: (M, y) => YearStats.viewings(M, y).filter(e => e.isRewatch || e.rewatch).length,
    runtime: (M, y) => {
        const m = fmap(M);
        const vs = YearStats.viewings(M, y);
        let total = 0;
        let count = 0;
        vs.forEach(e => {
            const f = m.get(e.key);
            if (f && f.runtime) {
                total += f.runtime;
                count++;
            }
        });
        return { total, count, hours: Math.round(total / 60), days: +(total / 1440).toFixed(1) };
    },
    habits: (M, y) => {
        const vs = YearStats.viewings(M, y);
        const wdc = tally(vs, e => wd(e.date));
        const moc = tally(vs, e => +e.date.slice(5, 7) - 1);
        const weekday = DIA.map((l, i) => ({ l, v: wdc.get(i) || 0 }));
        const monthOfYear = MES.map((l, i) => ({ l, v: moc.get(i) || 0 }));
        const favWeekday = weekday.slice().sort((a, b) => b.v - a.v)[0] || { l: '—', v: 0 };
        const favMonth = monthOfYear.slice().sort((a, b) => b.v - a.v)[0] || { l: '—', v: 0 };

        const dayCounts = tally(vs, e => e.date);
        const days = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]);
        const recordDay = days[0] || ['—', 0];

        const ds = [...dayCounts.keys()].map(dayN).sort((a, b) => a - b);
        let best = 0, run = 0;
        ds.forEach((d, i) => {
            run = i && d === ds[i - 1] + 1 ? run + 1 : 1;
            if (run > best) best = run;
        });

        return {
            weekday,
            monthOfYear,
            favWeekday,
            favMonth,
            recordDay,
            streak: best,
            activeDays: dayCounts.size
        };
    },
    getFullYearData: (M, y) => {
        const vs = YearStats.viewings(M, y);
        if (!vs || !vs.length) return null;
        const m = fmap(M);
        const unique = YearStats.uniqueFilms(M, y);
        const topR = YearStats.topRated(M, y, 10);
        const topRel = YearStats.topReleased(M, y, 6);
        const worstR = YearStats.worstRated(M, y, 5);
        const firstE = YearStats.first(M, y);
        const lastE = YearStats.last(M, y);

        const firstFilm = firstE ? (m.get(firstE.key) || M.films.find(f => f.key === firstE.key) || { key: firstE.key, name: firstE.name || firstE.key, year: firstE.year || y }) : null;
        const lastFilm = lastE ? (m.get(lastE.key) || M.films.find(f => f.key === lastE.key) || { key: lastE.key, name: lastE.name || lastE.key, year: lastE.year || y }) : null;

        const mostRew = YearStats.mostRewatched(M, y);
        const run = YearStats.runtime(M, y);
        const hab = YearStats.habits(M, y);
        const topD = YearStats.topDirector(M, y);
        const topDs = YearStats.topDirectors(M, y, 6);
        const topA = YearStats.topActor(M, y);
        const topAs = YearStats.topActors(M, y, 6);

        const isCurrent = (y === new Date().getFullYear());

        return {
            year: y,
            isCurrentYear: isCurrent,
            title: isCurrent ? `Your ${y} stats so far` : `Your ${y} in Film`,
            viewingsCount: vs.length,
            uniqueCount: unique.length,
            uniqueFilms: unique,
            rewatchesCount: YearStats.rewatches(M, y),
            runtime: run,
            habits: hab,
            topFilms: topR,
            topFilm: topR[0] || null,
            topReleasedFilms: topRel,
            topReleasedFilm: topRel[0] || (topR.find(f => f && f.year === y) || null),
            worstFilms: worstR,
            worstFilm: worstR[0] || null,
            firstEntry: firstE,
            firstFilm,
            lastEntry: lastE,
            lastFilm,
            mostRewatched: mostRew,
            topDirector: topD,
            topDirectors: topDs,
            topActor: topA,
            topActors: topAs
        };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        compute,
        YearStats,
        applyFilters
    };
}
