/* ==========================================================================
   LBXD Stats Generator — Complete Cinematic UI Application
   ========================================================================== */

const { useState, useMemo, useRef, useEffect, useCallback } = React;
const html = htm.bind(React.createElement);

const COL = {
    g: '#00E054',
    gd: '#006B35',
    o: '#FF8000',
    b: '#40BCF4',
    red: '#FF5A5F'
};

const fmt = (n, d = 2) => n == null ? '—' : (+n).toLocaleString('en-US', { maximumFractionDigits: d });
const stars = r => r == null ? '—' : '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '');

function formatReviewHtml(raw) {
    if (!raw) return '';
    return String(raw)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
        .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/javascript:/gi, '');
}

const getDirectorNames = film => {
    if (!film || !film.directors) return '';
    if (Array.isArray(film.directors)) {
        return film.directors.map(d => typeof d === 'string' ? d : (d.name || d.n || '')).filter(Boolean).join(', ');
    }
    return String(film.directors);
};

const dl = (b, n) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = n;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2500);
};

const toCSV = rows => Papa.unparse(rows);
const hue = s => {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
};

/* ==========================================================================
   Welcome Cinematic Splash Screen
   ========================================================================== */

function SplashScreen({ onFinish, busyText, progress }) {
    return html`
        <div class="splash-overlay">
            <div class="splash-content">
                <div class="splash-film-reel"></div>
                <div class="splash-logo-container">
                    <img src="media/logo.png" alt="LBXD" class="splash-logo-img" />
                </div>
                <div class="splash-tagline">Your cinematic universe is loading</div>
                
                ${progress != null && html`
                    <div class="splash-progress-track">
                        <div class="splash-progress-bar" style=${{ width: `${progress}%` }}></div>
                    </div>
                `}
                
                <div class="splash-status-text">
                    ${busyText || 'Starting your cinematic experience…'}
                </div>
            </div>
        </div>
    `;
}

/* ==========================================================================
   Poster & Person Cards
   ========================================================================== */

function FilmPosterCard({ film, sub, onClick }) {
    const h = hue(film.name || '');
    const fallbackBg = `linear-gradient(160deg, hsl(${[150, 25, 200][h % 3]} 30% 18%), #0E1210)`;

    return html`
        <div class="film-card" onClick=${() => onClick && onClick(film)} title=${`${film.name}${film.year ? ` (${film.year})` : ''}`}>
            <div class="film-poster-wrap">
                ${film.poster
            ? html`<img src=${film.poster} alt=${film.name} class="film-poster-img" loading="lazy" />`
            : html`<div class="film-poster-fallback" style=${{ background: fallbackBg }}>
                        <span>${film.name}</span>
                    </div>`
        }
                
                ${film.liked && html`<div class="film-heart-badge">♥</div>`}
            </div>
            
            <div class="film-info-bar">
                <span class="film-stars">${stars(film.rating)}</span>
                <span class="film-year">${film.year || ''}</span>
            </div>
            <div class="film-title-text">${film.name}</div>
            ${sub && html`<div style=${{ fontSize: '11px', color: 'var(--mut)', marginTop: '1px' }}>${sub}</div>`}
        </div>
    `;
}

function PersonCard({ person, onClick }) {
    return html`
        <div class="person-card" onClick=${() => onClick && onClick(person)}>
            <div class="person-photo-circle">
                ${person.photo
            ? html`<img src=${person.photo} alt=${person.n} class="person-photo-img" loading="lazy" />`
            : html`<span>🎬</span>`
        }
            </div>
            <div class="person-name" title=${person.n}>${person.n}</div>
            <div class="person-count">${person.c} ${person.c === 1 ? 'title' : 'titles'}</div>
            ${person.avg != null && html`<div class="person-avg-rating">${fmt(person.avg)}★</div>`}
        </div>
    `;
}

function PosterShelf({ title, count, list, sub, onSelectFilm, why, extraAction }) {
    return html`
        <div class="poster-shelf-container">
            <div class="poster-shelf-header">
                <h3 class="poster-shelf-title">${title}</h3>
                <div style=${{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    ${count != null && html`<span class="poster-shelf-count">${count} titles</span>`}
                    ${extraAction}
                </div>
            </div>
            ${list && list.length > 0
            ? html`
                    <div class="poster-shelf">
                        ${list.map(f => html`<${FilmPosterCard} key=${f.key} film=${f} sub=${sub && sub(f)} onClick=${onSelectFilm} />`)}
                    </div>
                `
            : html`<div class="card" style=${{ padding: '24px', textAlign: 'center', color: 'var(--mut)' }}>${why || 'No titles in this category.'}</div>`
        }
        </div>
    `;
}

/* ==========================================================================
   Modals: Film Detail & Person Detail
   ========================================================================== */

function FilmModal({ film, onClose, entries, onToggleTvType, onSelectPerson, onChangeWork }) {
    if (!film) return null;
    const [workQuery, setWorkQuery] = useState(film.name);
    const [workResults, setWorkResults] = useState([]);
    const [workSearching, setWorkSearching] = useState(false);
    const [workError, setWorkError] = useState('');

    const filmEntries = useMemo(() => {
        return (entries || []).filter(e => e.key === film.key);
    }, [film, entries]);

    const lastSeen = useMemo(() => {
        const dated = filmEntries.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date));
        return dated[0] ? dated[0].date : (filmEntries[0] ? filmEntries[0].logged : null);
    }, [filmEntries]);

    const rewatchesCount = useMemo(() => {
        return filmEntries.filter(e => e.isRewatch || e.rewatch).length;
    }, [filmEntries]);

    const searchWorks = async () => {
        setWorkSearching(true);
        setWorkError('');
        try {
            const results = await searchTMDBCandidates(workQuery.trim(), film.year);
            setWorkResults(results);
        } catch (e) {
            setWorkError('No se pudieron consultar las obras en TMDB.');
        } finally {
            setWorkSearching(false);
        }
    };

    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        const origOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = origOverflow;
        };
    }, [onClose]);

    return html`
        <div class="modal-backdrop-overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
            <div class="film-detail-modal">
                <button class="modal-close-btn" onClick=${onClose} aria-label="Close">✕</button>

                <div class="modal-backdrop-header">
                    ${film.backdrop
            ? html`<img src=${film.backdrop} alt="" class="modal-backdrop-img" />`
            : film.poster
                ? html`<img src=${film.poster} alt="" class="modal-backdrop-img" style=${{ filter: 'blur(20px) brightness(0.55)', transform: 'scale(1.2)' }} />`
                : html`<div style=${{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1B2228, #14181C)' }} />`
        }
                    <div class="modal-backdrop-gradient"></div>
                </div>

                <div class="modal-content-grid">
                    <div class="modal-poster-col">
                        <div class="modal-poster-box">
                            ${film.poster
            ? html`<img src=${film.poster} alt=${film.name} />`
            : html`<div class="film-poster-fallback"><span>${film.name}</span></div>`
        }
                        </div>

                        ${film.uri && html`
                            <a href=${film.uri} target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style=${{ width: '100%', textAlign: 'center' }}>
                                Open on Letterboxd ↗
                            </a>
                        `}

                        <button
                            class="btn btn-ghost btn-sm"
                            style=${{ width: '100%', fontSize: '11.5px', color: 'var(--mut)' }}
                            onClick=${() => onToggleTvType && onToggleTvType(film.key)}
                        >
                            ${film.isTv ? '🎬 Switch to Film' : '📺 Switch to TV Series'}
                        </button>

                        <div class="work-correction-box">
                            <button class="btn btn-ghost btn-sm" style=${{ width: '100%', fontSize: '11.5px' }} onClick=${searchWorks}>
                                Cambiar obra
                            </button>
                            <input
                                class="work-correction-input"
                                value=${workQuery}
                                onInput=${e => setWorkQuery(e.target.value)}
                                onKeyDown=${e => e.key === 'Enter' && searchWorks()}
                                placeholder="Buscar obra en TMDB"
                            />
                            ${workSearching && html`<div class="work-correction-status">Buscando…</div>`}
                            ${workError && html`<div class="work-correction-error">${workError}</div>`}
                            ${workResults.length > 0 && html`
                                <div class="work-correction-results">
                                    ${workResults.map(result => html`
                                        <button class="work-correction-result" key=${`${result.media_type}-${result.id}`} onClick=${() => onChangeWork && onChangeWork(film, result)}>
                                            <span>${result.title || result.name}</span>
                                            <small>${(result.release_date || '').slice(0, 4) || '—'} · ${result.media_type === 'tv' ? 'TV' : 'Película'}</small>
                                        </button>
                                    `)}
                                </div>
                            `}
                        </div>
                    </div>

                    <div class="modal-body-col">
                        <div class="modal-title-row">
                            <h2 class="modal-film-title">${film.name}</h2>
                            ${film.originalTitle && film.originalTitle !== film.name && html`
                                <div class="modal-orig-title">${film.originalTitle}</div>
                            `}
                        </div>

                        <div class="modal-meta-row">
                            ${film.year && html`<span>${film.year}</span>`}
                            ${film.runtime && html`<span>· ${film.runtime} min ${film.isTv ? '/ ep' : ''}</span>`}
                            ${film.seasons && html`<span>· ${film.seasons} ${film.seasons === 1 ? 'season' : 'seasons'}</span>`}
                            ${film.episodes && html`<span>· ${film.episodes} episodes</span>`}
                            ${film.rating != null && html`
                                <span>· <span class="modal-user-rating">${stars(film.rating)} (${film.rating})</span></span>
                            `}
                            ${film.liked && html`<span style=${{ color: COL.o }}>· ♥ Favorite</span>`}
                        </div>

                        ${film.genres && film.genres.length > 0 && html`
                            <div class="modal-pills">
                                ${film.genres.map((g, i) => html`<span class="modal-pill" key=${i}>${g}</span>`)}
                            </div>
                        `}

                        ${film.overview && html`
                            <p class="modal-overview">${film.overview}</p>
                        `}

                        <div class="modal-stats-boxes">
                            <div class="modal-stat-box">
                                <div class="modal-stat-box-val">${filmEntries.length}</div>
                                <div class="modal-stat-box-lbl">Viewings</div>
                            </div>
                            <div class="modal-stat-box">
                                <div class="modal-stat-box-val">${rewatchesCount}</div>
                                <div class="modal-stat-box-lbl">Rewatches</div>
                            </div>
                            <div class="modal-stat-box">
                                <div class="modal-stat-box-val" style=${{ fontSize: '15px', lineHeight: '24px' }}>${lastSeen || '—'}</div>
                                <div class="modal-stat-box-lbl">Last Watched</div>
                            </div>
                        </div>

                        ${film.directors && film.directors.length > 0 && html`
                            <div class="modal-people-section">
                                <div class="modal-people-title">${film.isTv ? 'Creation / Direction' : 'Direction'}</div>
                                <div class="modal-people-list">
                                    ${film.directors.map((d, i) => {
            const name = typeof d === 'string' ? d : d.name;
            const photo = typeof d === 'string' ? null : d.photo;
            return html`
                                            <div
                                                class="modal-person-mini"
                                                key=${i}
                                                onClick=${() => onSelectPerson && onSelectPerson({ n: name, photo, role: film.isTv ? 'Creator' : 'Director' })}
                                            >
                                                ${photo && html`<img src=${photo} alt=${name} class="modal-person-mini-img" />`}
                                                <span>${name}</span>
                                            </div>
                                        `;
        })}
                                </div>
                            </div>
                        `}

                        ${film.cast && film.cast.length > 0 && html`
                            <div class="modal-people-section">
                                <div class="modal-people-title">Top Cast</div>
                                <div class="modal-people-list">
                                    ${film.cast.slice(0, 10).map((c, i) => html`
                                        <div
                                            class="modal-person-mini"
                                            key=${i}
                                            onClick=${() => onSelectPerson && onSelectPerson({ n: c.n, photo: c.photo, role: 'Cast' })}
                                        >
                                            ${c.photo && html`<img src=${c.photo} alt=${c.n} class="modal-person-mini-img" />`}
                                            <span>${c.n}</span>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        `}

                        ${film.reviews && film.reviews.length > 0 && html`
                            <div style=${{ marginTop: '16px' }}>
                                <div class="modal-people-title">Your Review</div>
                                ${film.reviews.map((r, i) => html`
                                    <div class="modal-review-box" key=${i}>
                                        <div class="modal-review-text" dangerouslySetInnerHTML=${{ __html: formatReviewHtml(r.text) }}></div>
                                        ${r.date && html`<div style=${{ fontSize: '11px', color: 'var(--mut)', marginTop: '6px', textAlign: 'right' }}>${r.date}</div>`}
                                    </div>
                                `)}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function PersonModal({ person, onClose, films, entries, onSelectFilm }) {
    if (!person) return null;

    const [details, setDetails] = useState(null);
    const [watchedYear, setWatchedYear] = useState('');

    useEffect(() => {
        let active = true;
        fetchPersonDetails(person.n, person.id).then(d => {
            if (active && d) setDetails(d);
        });
        return () => { active = false; };
    }, [person]);

    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        const origOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = origOverflow;
        };
    }, [onClose]);

    // Find all works seen by user with this person
    const personWorks = useMemo(() => {
        return (films || []).filter(f => {
            const hasDir = (f.directors || []).some(d => (typeof d === 'string' ? d : d.name) === person.n);
            const hasCast = (f.cast || []).some(c => (typeof c === 'string' ? c : c.n) === person.n);
            return hasDir || hasCast;
        }).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }, [person, films]);

    const ratedWorks = personWorks.filter(f => f.rating != null);
    const userAvg = ratedWorks.length ? avg(ratedWorks.map(f => f.rating)) : null;
    const watchedYears = useMemo(() => [...new Set((entries || [])
        .filter(e => e.date && personWorks.some(f => f.key === e.key))
        .map(e => e.date.slice(0, 4))
        .filter(Boolean))].sort((a, b) => b.localeCompare(a)), [entries, personWorks]);
    const displayedWorks = useMemo(() => {
        if (!watchedYear) return personWorks;
        const keys = new Set((entries || [])
            .filter(e => e.date && e.date.startsWith(watchedYear))
            .map(e => e.key));
        return personWorks.filter(f => keys.has(f.key));
    }, [entries, personWorks, watchedYear]);

    const photoSrc = (details && details.photo) || person.photo;

    return html`
        <div class="modal-backdrop-overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
            <div class="person-detail-modal">
                <button class="modal-close-btn" onClick=${onClose} aria-label="Close">✕</button>

                <div class="person-header-banner">
                    <div class="person-portrait-big">
                        ${photoSrc
            ? html`<img src=${photoSrc} alt=${person.n} />`
            : html`<div style=${{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>🎬</div>`
        }
                    </div>

                    <div class="person-info-content">
                        <span class="person-role-tag">${person.role || (details && details.knownFor) || 'Filmmaker / Cast'}</span>
                        <h2 class="person-name-big">${person.n}</h2>
                        
                        <div style=${{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '14px', color: 'var(--mut)' }}>
                            <span><strong>${displayedWorks.length}</strong> titles watched${watchedYear ? ` in ${watchedYear}` : ''}</span>
                            ${userAvg != null && html`<span>Your average: <strong style=${{ color: COL.g }}>${fmt(userAvg)}★</strong></span>`}
                            ${details && details.birthday && html`<span>Born: ${details.birthday}</span>`}
                            ${details && details.placeOfBirth && html`<span>Birthplace: ${details.placeOfBirth}</span>`}
                        </div>

                        ${details && details.biography && html`
                            <p class="person-bio-text">${details.biography}</p>
                        `}
                    </div>
                </div>

                <div style=${{ padding: '24px 28px' }}>
                    <div class="poster-shelf-header" style=${{ marginBottom: '14px' }}>
                        <h3 class="poster-shelf-title">Watched Works with ${person.n} (${displayedWorks.length})</h3>
                        <div style=${{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                                class="person-year-filter"
                                value=${watchedYear}
                                onChange=${e => setWatchedYear(e.target.value)}
                            >
                                <option value="">All viewing years</option>
                                ${watchedYears.map(year => html`<option value=${year} key=${year}>Viewed in ${year}</option>`)}
                            </select>
                            <span class="poster-shelf-count">Sorted by your rating</span>
                        </div>
                    </div>

                    <div class="poster-grid" style=${{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                        ${displayedWorks.map(f => html`
                            <${FilmPosterCard}
                                key=${f.key}
                                film=${f}
                                onClick=${filmObj => {
                onClose();
                onSelectFilm(filmObj);
            }}
                            />
                        `)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* ==========================================================================
   Interactive SVG Charts
   ========================================================================== */

function InteractiveBars({ data, color = COL.g, h = 210, f = n => fmt(n, 1) }) {
    const [hv, setHv] = useState(null);
    const W = 680, pl = 36, pb = 28, pt = 12;
    const n = data.length || 1;
    const max = Math.max(1, ...data.map(d => d.v));
    const bw = (W - pl) / n;
    const ih = h - pb - pt;
    const ev = Math.ceil(n / 12);

    return html`
        <div>
            <div class="chart-hover-text">
                ${hv != null && data[hv] ? `${data[hv].l}: ${f(data[hv].v)}${data[hv].pct ? ` (${data[hv].pct}%)` : ''}` : '\u00A0'}
            </div>
            <svg viewBox=${`0 0 ${W} ${h}`} className="chart-svg" xmlns="http://www.w3.org/2000/svg">
                <rect width=${W} height=${h} fill="#14181C" rx="6" />
                ${[0, 0.5, 1].map(t => html`
                    <g key=${t}>
                        <line x1=${pl} x2=${W} y1=${pt + ih * (1 - t)} y2=${pt + ih * (1 - t)} stroke="#2C3440" stroke-width="1" />
                        <text x="0" y=${pt + ih * (1 - t) + 4} fill="#99AABB" font-size="10" font-family="sans-serif">${fmt(max * t, 0)}</text>
                    </g>
                `)}
                ${data.map((d, i) => {
        const bh = ih * d.v / max;
        return html`
                        <g key=${i} onMouseEnter=${() => setHv(i)} onMouseLeave=${() => setHv(null)} style=${{ cursor: 'pointer' }}>
                            <rect x=${pl + i * bw} y=${pt} width=${bw} height=${ih} fill="transparent" />
                            <rect
                                x=${pl + i * bw + bw * 0.12}
                                y=${pt + ih - bh}
                                width=${bw * 0.76}
                                height=${d.v > 0 ? Math.max(bh, 2) : 0}
                                rx="3"
                                fill=${color}
                                opacity=${hv === i ? 1 : 0.85}
                                style=${{ transition: 'all 0.15s ease' }}
                            >
                                <title>${d.l}: ${f(d.v)}</title>
                            </rect>
                            ${i % ev === 0 && html`
                                <text x=${pl + i * bw + bw / 2} y=${h - 8} fill="#99AABB" font-size="10" text-anchor="middle" font-family="sans-serif">${d.l}</text>
                            `}
                        </g>
                    `;
    })}
            </svg>
        </div>
    `;
}

function DualLineChart({ data, h = 210 }) {
    const [hv, setHv] = useState(null);
    const W = 680, pl = 36, pb = 28, pt = 14, ih = h - pb - pt;
    const n = data.length;
    const X = i => pl + 14 + (n < 2 ? (W - pl - 28) / 2 : i * (W - pl - 28) / (n - 1));
    const Y = v => pt + ih * (1 - (v || 0) / 5);

    return html`
        <div>
            <div class="chart-hover-text">
                ${hv != null && data[hv] ? `${data[hv].l}: ${fmt(data[hv].v)}★ (${data[hv].n} ratings)` : '\u00A0'}
            </div>
            <svg viewBox=${`0 0 ${W} ${h}`} className="chart-svg" xmlns="http://www.w3.org/2000/svg">
                <rect width=${W} height=${h} fill="#14181C" rx="6" />
                ${[0, 2.5, 5].map(t => html`
                    <g key=${t}>
                        <line x1=${pl} x2=${W} y1=${Y(t)} y2=${Y(t)} stroke="#2C3440" stroke-width="1" />
                        <text x="0" y=${Y(t) + 4} fill="#99AABB" font-size="10" font-family="sans-serif">${t}★</text>
                    </g>
                `)}
                <polyline
                    fill="none"
                    stroke=${COL.o}
                    stroke-width="2.5"
                    stroke-linecap="round"
                    points=${data.map((d, i) => `${X(i)},${Y(d.v)}`).join(' ')}
                />
                ${data.map((d, i) => html`
                    <g key=${i} onMouseEnter=${() => setHv(i)} onMouseLeave=${() => setHv(null)} style=${{ cursor: 'pointer' }}>
                        <circle cx=${X(i)} cy=${Y(d.v)} r="5.5" fill=${COL.o} stroke="#14181C" stroke-width="2">
                            <title>${d.l}: ${fmt(d.v)}★</title>
                        </circle>
                        <text x=${X(i)} y=${h - 8} fill="#99AABB" font-size="10" text-anchor="middle" font-family="sans-serif">${d.l}</text>
                    </g>
                `)}
            </svg>
        </div>
    `;
}

function RankList({ rows, unit = '', max, onSelectPerson }) {
    const m = max || Math.max(1, ...rows.map(r => r.c));
    return html`
        <div>
            ${rows.map(r => html`
                <div
                    class="rank-item"
                    key=${r.n}
                    style=${onSelectPerson ? { cursor: 'pointer' } : {}}
                    onClick=${() => onSelectPerson && onSelectPerson(r)}
                >
                    <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title=${r.n}>
                        ${r.n}
                    </span>
                    <div class="rank-bar-bg">
                        <div class="rank-bar-fill" style=${{ width: (r.c / m * 100) + '%' }}></div>
                    </div>
                    <span class="rank-meta">${fmt(r.c, 0)}${unit}${r.avg != null ? ' · ' + fmt(r.avg) + '★' : ''}</span>
                </div>
            `)}
        </div>
    `;
}

/* ==========================================================================
   Header & Navigation
   ========================================================================== */

function Header({ tab, setTab, onClear, user }) {
    const navItems = [
        { id: 'overview', label: 'Overview' },
        { id: 'films', label: 'Films' },
        { id: 'diary', label: 'Diary' },
        { id: 'ratings', label: 'Ratings' },
        { id: 'stats', label: 'Stats' },
        { id: 'graphed', label: 'GraphEd', isGraphEd: true },
        { id: 'credits', label: 'Credits & About' }
    ];

    return html`
        <header class="site-header">
            <div class="header-inner">
                <a class="brand-logo" onClick=${() => setTab('overview')} title="LBXD — Overview">
                    <img src="media/logo.png" alt="LBXD" class="brand-logo-img" />
                    <span class="brand-badge">CINEMA</span>
                </a>

                <nav class="header-nav">
                    ${navItems.map(item => html`
                        <button
                            key=${item.id}
                            class=${`nav-link ${tab === item.id ? 'active' : ''} ${item.isGraphEd ? 'graphed-pill' : ''}`}
                            onClick=${() => setTab(item.id)}
                        >
                            ${item.isGraphEd ? '✨ ' : ''}${item.label}
                        </button>
                    `)}
                </nav>

                <div class="header-actions">
                    <button class="btn btn-ghost btn-sm" onClick=${onClear} title="Clear session data">
                        Clear Data
                    </button>
                </div>
            </div>
        </header>
    `;
}

function MobileNav({ tab, setTab }) {
    const items = [
        { id: 'overview', icon: '📊', label: 'Overview' },
        { id: 'films', icon: '🎬', label: 'Films' },
        { id: 'diary', icon: '📅', label: 'Diary' },
        { id: 'ratings', icon: '★', label: 'Ratings' },
        { id: 'stats', icon: '👥', label: 'Stats' },
        { id: 'graphed', icon: '✨', label: 'GraphEd' }
    ];

    return html`
        <nav class="mobile-nav-bar">
            <div class="mobile-nav-inner">
                ${items.map(it => html`
                    <button
                        key=${it.id}
                        class=${`mobile-nav-btn ${tab === it.id ? 'active' : ''}`}
                        onClick=${() => setTab(it.id)}
                    >
                        <span class="icon">${it.icon}</span>
                        <span>${it.label}</span>
                    </button>
                `)}
            </div>
        </nav>
    `;
}

function Footer({ setTab }) {
    return html`
        <footer class="site-footer">
            <div class="footer-nav">
                <a href="#about" onClick=${e => { e.preventDefault(); setTab('credits'); }}>About LBXD</a>
                <a href="#credits" onClick=${e => { e.preventDefault(); setTab('credits'); }}>Credits</a>
                <a href="#privacy" onClick=${e => { e.preventDefault(); setTab('credits'); }}>Privacy</a>
                <a href="https://github.com/DavidFerreiro-dev" target="_blank" rel="noopener">GitHub</a>
                <a href="https://github.com/DavidFerreiro-dev/LBXD_StatsGenerator" target="_blank" rel="noopener">Repository</a>
                <a href="https://letterboxd.com" target="_blank" rel="noopener">Letterboxd</a>
                <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>
            </div>
            <div>LBXD Stats Generator — An independent open-source project for film lovers.</div>
            <div style=${{ fontSize: '12px', color: 'var(--dim)', marginTop: '8px' }}>
                LBXD is not affiliated with, endorsed by, or officially connected to Letterboxd.
            </div>
        </footer>
    `;
}

/* ==========================================================================
   Tab Views
   ========================================================================== */

function OverviewTab({ M, S, setTab, onSelectFilm }) {
    const hasDates = M.entries.some(e => e.date);
    const topBackdrop = S.top.find(f => f.backdrop);

    return html`
        <div>
            <!-- Cinematic Hero -->
            <div class="hero-dashboard">
                ${topBackdrop && html`
                    <div class="hero-backdrop-collage" style=${{ backgroundImage: `url(${topBackdrop.backdrop})` }}></div>
                `}
                <div class="wrap hero-dashboard-inner">
                    <div>
                        <div class="hero-welcome-badge">✦ Cinematic Summary</div>
                        <h1 class="hero-welcome-title">
                            ${M.profile.user ? `Hello, @${M.profile.user}` : 'Your Life in Film'}
                        </h1>
                        <p class="hero-welcome-sub">
                            You have logged <strong>${S.n}</strong> titles across <strong>${S.viewings}</strong> total viewings,
                            with an average rating of <strong style=${{ color: COL.g }}>${fmt(S.avg)}★</strong>.
                        </p>

                        <div class="hero-actions-row">
                            <button class="btn btn-primary" onClick=${() => setTab('graphed')}>
                                ✨ View Annual GraphEd
                            </button>
                            <button class="btn btn-ghost" onClick=${() => setTab('films')}>
                                🎬 All films (${S.n})
                            </button>
                        </div>
                    </div>

                    <div class="hero-side-poster-fan">
                        ${S.top.slice(0, 3).map((f, i) => html`
                            <div class="hero-poster-card-stack" key=${f.key} onClick=${() => onSelectFilm(f)} title=${f.name}>
                                ${f.poster
            ? html`<img src=${f.poster} alt=${f.name} style=${{ width: '100%', height: '100%', objectFit: 'cover' }} />`
            : html`<div class="film-poster-fallback"><span>${f.name}</span></div>`
        }
                            </div>
                        `)}
                    </div>
                </div>
            </div>

            <!-- Quick Metrics Grid -->
            <div class="wrap">
                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', margin: '24px 0' }}>
                    <div class="stat-card">
                        <div class="stat-value">${S.n}</div>
                        <div class="stat-label">Unique Films</div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-value">${S.viewings}</div>
                        <div class="stat-label">Total Viewings</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${S.rewatches}</div>
                        <div class="stat-label">Rewatches</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" style=${{ color: COL.g }}>${fmt(S.avg)}★</div>
                        <div class="stat-label">Personal Average</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${S.hours ? S.hours + ' h' : '—'}</div>
                        <div class="stat-label">Watch Time ${S.daysWatchTime ? `(${S.daysWatchTime} days)` : ''}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${S.streak} days</div>
                        <div class="stat-label">Longest Daily Streak</div>
                    </div>
                </div>

                ${M.profile && html`
                    <div class="profile-overview-card">
                        <div class="profile-overview-heading">
                            <div class="profile-overview-kicker">Letterboxd profile</div>
                            <h2>${[M.profile.givenName, M.profile.familyName].filter(Boolean).join(' ') || (M.profile.user ? '@' + M.profile.user : 'Your profile')}</h2>
                        </div>
                        <div class="profile-overview-meta">
                            ${M.profile.user && html`<span><strong>Username</strong> @${M.profile.user}</span>`}
                            ${M.profile.location && html`<span><strong>Location</strong> ${M.profile.location}</span>`}
                            ${M.profile.pronoun && html`<span><strong>Pronouns</strong> ${M.profile.pronoun}</span>`}
                            ${M.profile.joined && html`<span><strong>Joined</strong> ${M.profile.joined}</span>`}
                            ${M.profile.website && html`<a href=${M.profile.website} target="_blank" rel="noopener"><strong>Custom link</strong> ↗</a>`}
                            ${M.profile.email && html`<a href=${`mailto:${M.profile.email}`}><strong>Email</strong> ${M.profile.email}</a>`}
                        </div>
                        ${M.profile.bio && html`
                            <div class="profile-overview-bio">
                                <div class="profile-overview-label">Bio</div>
                                <div dangerouslySetInnerHTML=${{ __html: formatReviewHtml(M.profile.bio) }}></div>
                            </div>
                        `}
                        ${M.profile.favoriteFilms && M.profile.favoriteFilms.length === 4 && html`
                            <div class="profile-favorites">
                                <div class="profile-favorites-heading">
                                    <span class="profile-favorites-icon">♥</span>
                                    <strong>Favorite films</strong>
                                    <span class="profile-favorites-rule"></span>
                                </div>
                                <div class="profile-favorite-posters">
                                    ${M.profile.favoriteFilms.map(f => html`
                                        <div class="profile-favorite-item" key=${f.key}>
                                            <div class="profile-favorite-number">${M.profile.favoriteFilms.indexOf(f) + 1}</div>
                                            <${FilmPosterCard} film=${f} onClick=${onSelectFilm} />
                                        </div>
                                    `)}
                                </div>
                            </div>
                        `}
                    </div>
                `}

                <!-- Dual Visual Charts -->
                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', margin: '28px 0' }}>
                    <div class="chart-card">
                        <div class="chart-header">
                            <div>
                                <h3 class="chart-title">Yearly Viewing Activity</h3>
                                <p class="chart-sub">Films logged per year</p>
                            </div>
                        </div>
                        ${hasDates
            ? html`<${InteractiveBars} data=${S.byYear} />`
            : html`<div style=${{ padding: '30px', color: 'var(--mut)', textAlign: 'center' }}>No dates in diary</div>`
        }
                    </div>

                    <div class="chart-card">
                        <div class="chart-header">
                            <div>
                                <h3 class="chart-title">Rating Distribution</h3>
                                <p class="chart-sub">Letterboxd scale (½★ to 5★)</p>
                            </div>
                        </div>
                        <${InteractiveBars} data=${S.dist} color=${COL.o} />
                    </div>
                </div>

                <!-- Featured Shelves -->
                <${PosterShelf}
                    title="Your Highest-Rated Films"
                    count=${S.top.length}
                    list=${S.top.slice(0, 16)}
                    onSelectFilm=${onSelectFilm}
                />

                ${S.mostRew && S.mostRew.length > 0 && html`
                    <${PosterShelf}
                        title="Most Rewatched Films"
                        list=${S.mostRew.slice(0, 14)}
                        sub=${f => {
                const cnt = S.entries ? S.entries.filter(e => e.key === f.key && (e.isRewatch || e.rewatch)).length : 0;
                return cnt > 0 ? cnt + ' rewatches' : null;
            }}
                        onSelectFilm=${onSelectFilm}
                    />
                `}

                ${S.liked && S.liked.length > 0 && html`
                    <${PosterShelf}
                        title="Your Favorites ♥"
                        list=${S.liked.slice(0, 14)}
                        onSelectFilm=${onSelectFilm}
                    />
                `}
            </div>
        </div>
    `;
}

function FilmsTab({ V, S, onSelectFilm }) {
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState(['rating', -1]);
    const [limit, setLimit] = useState(48);

    const filteredFilms = useMemo(() => {
        const q = search.toLowerCase().trim();
        let list = V.films.filter(f => !q || f.name.toLowerCase().includes(q));
        list = list.slice().sort((a, b) => {
            let va = a[sort[0]], vb = b[sort[0]];
            if (sort[0] === 'views') {
                va = S.vc.get(a.key) || 0;
                vb = S.vc.get(b.key) || 0;
            }
            if (va == null) va = sort[1] > 0 ? 999999 : -999999;
            if (vb == null) vb = sort[1] > 0 ? 999999 : -999999;
            return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * sort[1];
        });
        return list;
    }, [V.films, search, sort, S.vc]);

    return html`
        <div>
            <${PosterShelf}
                title="Highest-Rated Films"
                list=${S.movieTop.slice(0, 14)}
                onSelectFilm=${onSelectFilm}
            />

            <${PosterShelf}
                title="Most Watched Films"
                list=${S.mostSeen.slice(0, 14)}
                sub=${f => (S.vc.get(f.key) || 0) + ' viewings'}
                onSelectFilm=${onSelectFilm}
            />

            <div class="poster-shelf-header" style=${{ marginTop: '36px' }}>
                <h2 class="poster-shelf-title" style=${{ fontSize: '24px' }}>
                    All Films (${filteredFilms.length})
                </h2>
                <div style=${{ display: 'flex', gap: '10px' }}>
                    <input
                        type="search"
                        class="filter-select"
                        placeholder="Search films…"
                        value=${search}
                        onInput=${e => { setSearch(e.target.value); setLimit(48); }}
                    />
                    <select class="filter-select" onChange=${e => {
            const [k, d] = e.target.value.split(':');
            setSort([k, +d]);
        }}>
                        <option value="rating:-1">Highest rating</option>
                        <option value="rating:1">Lowest rating</option>
                        <option value="name:1">Title (A-Z)</option>
                        <option value="year:-1">Year (Newest)</option>
                        <option value="year:1">Year (Oldest)</option>
                        <option value="views:-1">Most viewings</option>
                    </select>
                </div>
            </div>

            <div class="poster-grid">
                ${filteredFilms.slice(0, limit).map(f => html`
                    <${FilmPosterCard}
                        key=${f.key}
                        film=${f}
                        sub=${(S.vc.get(f.key) || 0) > 1 ? (S.vc.get(f.key) + ' viewings') : null}
                        onClick=${onSelectFilm}
                    />
                `)}
            </div>

            ${filteredFilms.length > limit && html`
                <div style=${{ textAlign: 'center', margin: '28px 0' }}>
                    <button class="btn btn-ghost" onClick=${() => setLimit(l => l + 48)}>
                        Show more films (${filteredFilms.length - limit} remaining)
                    </button>
                </div>
            `}
        </div>
    `;
}

function TvShowsTab({ V, S, onSelectFilm, onSelectPerson, onToggleTvType }) {
    const shows = useMemo(() => V.films.filter(f => f.isTv), [V.films]);

    return html`
        <div>
            <div class="section-heading">
                <div>
                    <h2>Television Series & Miniseries (${shows.length})</h2>
                    <div class="section-heading-sub">Television content categorized and analyzed independently</div>
                </div>
            </div>

            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', margin: '20px 0' }}>
                <div class="stat-card">
                    <div class="stat-value">${S.showsCount}</div>
                    <div class="stat-label">Tracked Series</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.showViewings}</div>
                    <div class="stat-label">Show Viewings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.showRewatches}</div>
                    <div class="stat-label">Rewatches</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.showEpisodes || '—'}</div>
                    <div class="stat-label">Total Estimated Episodes</div>
                </div>
            </div>

            <${PosterShelf}
                title="Highest-Rated Shows"
                list=${S.showsTop}
                onSelectFilm=${onSelectFilm}
                why="No television series logged yet."
            />

            ${shows.length > 0 && html`
                <div style=${{ marginTop: '32px' }}>
                    <h3 class="poster-shelf-title" style=${{ marginBottom: '16px' }}>Series Creators & Directors</h3>
                    <div class="people-grid">
                        ${S.tvDir.most.slice(0, 10).map((p, i) => html`
                            <${PersonCard} key=${i} person=${p} onClick=${onSelectPerson} />
                        `)}
                    </div>
                </div>
            `}

            <div class="poster-shelf-header" style=${{ marginTop: '36px' }}>
                <h3 class="poster-shelf-title">All Your TV Shows (${shows.length})</h3>
            </div>

            <div class="poster-grid">
                ${shows.map(f => html`
                    <div key=${f.key} style=${{ display: 'flex', flexDirection: 'column' }}>
                        <${FilmPosterCard}
                            film=${f}
                            sub=${f.seasons ? `${f.seasons} ${f.seasons === 1 ? 'season' : 'seasons'}` : null}
                            onClick=${onSelectFilm}
                        />
                        <button
                            class="btn btn-ghost btn-sm"
                            style=${{ fontSize: '11px', padding: '4px 6px', marginTop: '6px', width: '100%', color: 'var(--mut)', borderRadius: '6px' }}
                            onClick=${e => {
            e.stopPropagation();
            onToggleTvType && onToggleTvType(f.key);
        }}
                            title="Switch this title to Films"
                        >
                            🎬 Switch to Film
                        </button>
                    </div>
                `)}
            </div>

            ${!shows.length && html`
                <div class="card" style=${{ padding: '40px', textAlign: 'center', color: 'var(--mut)', marginTop: '20px' }}>
                    No TV series detected in your export. If you logged miniseries like Chernobyl, Twin Peaks or The Queen's Gambit, you can open them in the Films tab and click «Switch to TV Series».
                </div>
            `}
        </div>
    `;
}

function DiaryTab({ V, S, onSelectFilm }) {
    const hasDates = V.entries.some(e => e.date);

    return html`
        <div>
            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', margin: '20px 0' }}>
                <div class="stat-card">
                    <div class="stat-value">${S.recordDay ? S.recordDay[1] : '—'}</div>
                    <div class="stat-label">Single-Day Record (${S.recordDay ? S.recordDay[0] : '—'})</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.streak} days</div>
                    <div class="stat-label">Longest Daily Streak</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.activeDays}</div>
                    <div class="stat-label">Days with Cinema Activity</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.favWeekday ? S.favWeekday.l : '—'}</div>
                    <div class="stat-label">Favorite Day of the Week</div>
                </div>
            </div>

            ${hasDates && html`
                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', margin: '24px 0' }}>
                    <div class="chart-card">
                        <div class="chart-header">
                            <div>
                                <h3 class="chart-title">By Day of the Week</h3>
                                <p class="chart-sub">Screening frequency</p>
                            </div>
                        </div>
                        <${InteractiveBars} data=${S.weekday} />
                    </div>

                    <div class="chart-card">
                        <div class="chart-header">
                            <div>
                                <h3 class="chart-title">By Month of the Year</h3>
                                <p class="chart-sub">Annual distribution</p>
                            </div>
                        </div>
                        <${InteractiveBars} data=${S.monthOfYear} color=${COL.o} />
                    </div>
                </div>
            `}

            <div class="card" style=${{ marginTop: '24px' }}>
                <h3 class="card-title" style=${{ marginBottom: '16px' }}>Recent Diary Entries</h3>
                <div style=${{ overflowX: 'auto' }}>
                    <table style=${{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                        <thead>
                            <tr style=${{ borderBottom: '1px solid var(--bd)', color: 'var(--mut)', textAlign: 'left' }}>
                                <th style=${{ padding: '10px' }}>Date</th>
                                <th style=${{ padding: '10px' }}>Title</th>
                                <th style=${{ padding: '10px' }}>Year</th>
                                <th style=${{ padding: '10px' }}>Type</th>
                                <th style=${{ padding: '10px' }}>Rating</th>
                                <th style=${{ padding: '10px' }}>Rewatch</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${V.entries.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((e, idx) => {
        const f = (V.fm ? V.fm.get(e.key) : null) || (V.films ? V.films.find(x => x.key === e.key) : null) || { name: e.key, year: '—' };
        return html`
                                    <tr
                                        key=${idx}
                                        style=${{ borderBottom: '1px solid var(--bd)', cursor: 'pointer' }}
                                        onClick=${() => onSelectFilm(f)}
                                    >
                                        <td style=${{ padding: '12px 10px', color: 'var(--mut)' }}>${e.date}</td>
                                        <td style=${{ padding: '12px 10px', fontWeight: 600 }}>${f.name}</td>
                                        <td style=${{ padding: '12px 10px', color: 'var(--mut)' }}>${f.year || '—'}</td>
                                        <td style=${{ padding: '12px 10px' }}>Film</td>
                                        <td style=${{ padding: '12px 10px', color: COL.g, fontWeight: 700 }}>${stars(e.rating)}</td>
                                        <td style=${{ padding: '12px 10px', color: 'var(--mut)' }}>${(e.isRewatch || e.rewatch) ? '↻ Rewatch' : ''}</td>
                                    </tr>
                                `;
    })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function RatingsTab({ S, onSelectFilm }) {
    return html`
        <div>
            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', margin: '20px 0' }}>
                <div class="stat-card">
                    <div class="stat-value" style=${{ color: COL.g }}>${fmt(S.avg)}★</div>
                    <div class="stat-label">Average Rating</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.rated} / ${S.n}</div>
                    <div class="stat-label">Rated Titles</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.dist.slice(-2).reduce((a, d) => a + d.v, 0)}</div>
                    <div class="stat-label">4.5★ or Higher</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${S.half.length}</div>
                    <div class="stat-label">Half-Star (½★)</div>
                </div>
            </div>

            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', margin: '24px 0' }}>
                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <h3 class="chart-title">Rating Distribution</h3>
                            <p class="chart-sub">Letterboxd 10-star scale</p>
                        </div>
                    </div>
                    <${InteractiveBars} data=${S.dist} color=${COL.o} />
                </div>

                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <h3 class="chart-title">Average Rating Evolution</h3>
                            <p class="chart-sub">Average for each year</p>
                        </div>
                    </div>
                    ${S.avgByYear && S.avgByYear.length > 0
            ? html`<${DualLineChart} data=${S.avgByYear} />`
            : html`<div style=${{ padding: '30px', color: 'var(--mut)', textAlign: 'center' }}>Not enough annual data</div>`
        }
                </div>
            </div>

            <${PosterShelf}
                title="Five Stars ★★★★★"
                list=${S.five}
                onSelectFilm=${onSelectFilm}
                why="No 5-star rated titles yet."
            />

            <${PosterShelf}
                title="Half Star ½"
                list=${S.half}
                onSelectFilm=${onSelectFilm}
                why="No half-star rated titles."
            />
        </div>
    `;
}

function StatsTab({ M, S, onSelectFilm, onSelectPerson }) {
    const [subTab, setSubTab] = useState('directors');
    const [selectedYear, setSelectedYear] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Available years from diary entries
    const years = useMemo(() => {
        if (!M || !M.entries) return [];
        const set = new Set();
        M.entries.forEach(e => {
            if (e.date && e.date.length >= 4) {
                const y = +e.date.slice(0, 4);
                if (y >= 1900 && y <= 2100) set.add(y);
            }
        });
        return [...set].sort((a, b) => b - a);
    }, [M]);

    // Active statistics: all-time or filtered by selected year
    const activeS = useMemo(() => {
        if (!selectedYear || !M) return S;
        const filteredV = applyFilters(M, { year: selectedYear, mediaType: 'all' });
        return compute(filteredV);
    }, [M, S, selectedYear]);

    const q = searchQuery.toLowerCase().trim();

    // Matching persons
    const matchingDirectors = useMemo(() => {
        const list = (activeS.dir && activeS.dir.all) || [];
        if (!q) return (activeS.dir && activeS.dir.most) || [];
        return list.filter(p => p.n.toLowerCase().includes(q))
            .sort((a, b) => b.c - a.c || (b.avg || 0) - (a.avg || 0));
    }, [activeS.dir, q]);

    const matchingActors = useMemo(() => {
        const list = (activeS.act && activeS.act.all) || [];
        if (!q) return (activeS.act && activeS.act.most) || [];
        return list.filter(p => p.n.toLowerCase().includes(q))
            .sort((a, b) => b.c - a.c || (b.avg || 0) - (a.avg || 0));
    }, [activeS.act, q]);

    const matchingActresses = useMemo(() => {
        const list = (activeS.actr && activeS.actr.all) || [];
        if (!q) return (activeS.actr && activeS.actr.most) || [];
        return list.filter(p => p.n.toLowerCase().includes(q))
            .sort((a, b) => b.c - a.c || (b.avg || 0) - (a.avg || 0));
    }, [activeS.actr, q]);

    const matchingGenres = useMemo(() => {
        const list = (activeS.gen && activeS.gen.all) || [];
        if (!q) return (activeS.gen && activeS.gen.most) || [];
        return list.filter(p => p.n.toLowerCase().includes(q))
            .sort((a, b) => b.c - a.c || (b.avg || 0) - (a.avg || 0));
    }, [activeS.gen, q]);

    return html`
        <div>
            <!-- Header bar with Title, Year Selector and Search Input -->
            <div class="stats-header-bar">
                <div class="stats-title-group">
                    <h2>Cinema Statistics</h2>
                    <p>
                        ${selectedYear
            ? `Filtering by year ${selectedYear} · ${activeS.films ? activeS.films.length : 0} titles in this period`
            : `Full History · ${activeS.films ? activeS.films.length : 0} titles logged`
        }
                    </p>
                </div>

                <div class="stats-controls-wrap">
                    <!-- Search bar for directors, actors & actresses -->
                    <div class="stats-search-wrap">
                        <span class="stats-search-icon">🔍</span>
                        <input
                            type="search"
                            class="stats-search-input"
                            placeholder="Search director, actor, actress…"
                            value=${searchQuery}
                            onInput=${e => setSearchQuery(e.target.value)}
                        />
                        ${searchQuery && html`
                            <button
                                class="stats-search-clear"
                                onClick=${() => setSearchQuery('')}
                                title="Clear search"
                            >✕</button>
                        `}
                    </div>

                    <!-- Year Filter Dropdown -->
                    ${years.length > 0 && html`
                        <select
                            class="filter-select"
                            value=${selectedYear}
                            onChange=${e => setSelectedYear(e.target.value)}
                            title="Filter stats by year"
                        >
                            <option value="">All Years (Full History)</option>
                            ${years.map(yr => html`
                                <option key=${yr} value=${yr}>Year ${yr}</option>
                            `)}
                        </select>
                    `}

                    ${(selectedYear || searchQuery) && html`
                        <button
                            class="btn btn-ghost btn-sm"
                            onClick=${() => { setSelectedYear(''); setSearchQuery(''); }}
                            title="Reset filters"
                        >
                            Reset
                        </button>
                    `}
                </div>
            </div>

            <!-- Subtabs navigation with match count badges -->
            <div class="stats-subtabs-bar">
                <button
                    class=${`btn ${subTab === 'directors' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    onClick=${() => setSubTab('directors')}
                >
                    Directors ${q ? `(${matchingDirectors.length})` : ''}
                </button>
                <button
                    class=${`btn ${subTab === 'actors' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    onClick=${() => setSubTab('actors')}
                >
                    Actors ${q ? `(${matchingActors.length})` : ''}
                </button>
                <button
                    class=${`btn ${subTab === 'actresses' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    onClick=${() => setSubTab('actresses')}
                >
                    Actresses ${q ? `(${matchingActresses.length})` : ''}
                </button>
                <button
                    class=${`btn ${subTab === 'genres' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    onClick=${() => setSubTab('genres')}
                >
                    Genres ${q ? `(${matchingGenres.length})` : ''}
                </button>
                <button
                    class=${`btn ${subTab === 'decades' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    onClick=${() => setSubTab('decades')}
                >
                    Decades & Milestones
                </button>
            </div>

            <!-- DIRECTORS SUBTAB -->
            ${subTab === 'directors' && html`
                <div>
                    ${(q && matchingDirectors.length === 0) ? html`
                        <div>
                            ${matchingActors.length > 0 && html`
                                <div class="stats-switch-tab-hint">
                                    <span>🔍 No directors matching "<strong>${searchQuery}</strong>", but found <strong>${matchingActors.length}</strong> actor(s) in Cast.</span>
                                    <button class="stats-switch-tab-btn" onClick=${() => setSubTab('actors')}>View in Actors →</button>
                                </div>
                            `}
                            ${matchingActresses.length > 0 && html`
                                <div class="stats-switch-tab-hint">
                                    <span>🔍 No directors matching "<strong>${searchQuery}</strong>", but found <strong>${matchingActresses.length}</strong> actress(es) in Cast.</span>
                                    <button class="stats-switch-tab-btn" onClick=${() => setSubTab('actresses')}>View in Actresses →</button>
                                </div>
                            `}
                            ${matchingActors.length === 0 && matchingActresses.length === 0 && html`
                                <div style=${{ textAlign: 'center', padding: '48px 0', color: 'var(--mut)' }}>
                                    <div style=${{ fontSize: '36px', marginBottom: '10px' }}>🎬</div>
                                    <p style=${{ fontSize: '16px', color: 'var(--tx)', marginBottom: '6px' }}>No directors found matching "<strong>${searchQuery}</strong>"</p>
                                    <p style=${{ fontSize: '13px' }}>Try searching with another name or clear the search filter.</p>
                                    <button class="btn btn-ghost btn-sm" style=${{ marginTop: '14px' }} onClick=${() => setSearchQuery('')}>Clear search</button>
                                </div>
                            `}
                        </div>
                    ` : html`
                        <div>
                            <h3 class="poster-shelf-title" style=${{ marginBottom: '14px' }}>
                                ${q ? `Directors matching "${searchQuery}" (${matchingDirectors.length})` : 'Most Watched Directors (with portraits)'}
                            </h3>
                            <div class="people-grid">
                                ${matchingDirectors.slice(0, q ? 48 : 14).map((p, idx) => html`
                                    <${PersonCard} key=${idx} person=${p} onClick=${onSelectPerson} />
                                `)}
                            </div>

                            ${!q ? html`
                                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '28px' }}>
                                    <div class="chart-card">
                                        <h3 class="chart-title" style=${{ marginBottom: '12px' }}>Most Watched Directors Ranking</h3>
                                        <${RankList} rows=${activeS.dir.most.slice(0, 12)} unit=" titles" onSelectPerson=${onSelectPerson} />
                                    </div>
                                    <div class="chart-card">
                                        <h3 class="chart-title" style=${{ marginBottom: '4px' }}>Highest-Rated Directors</h3>
                                        <p class="chart-sub" style=${{ marginBottom: '12px' }}>Minimum 2 films</p>
                                        <${RankList} rows=${activeS.dir.best.slice(0, 12).map(p => ({ ...p, c: p.avg }))} max=${5} onSelectPerson=${onSelectPerson} />
                                    </div>
                                </div>
                            ` : html`
                                <div class="chart-card" style=${{ marginTop: '28px' }}>
                                    <h3 class="chart-title" style=${{ marginBottom: '12px' }}>Results for "${searchQuery}"</h3>
                                    <${RankList} rows=${matchingDirectors.slice(0, 20)} unit=" titles" onSelectPerson=${onSelectPerson} />
                                </div>
                            `}
                        </div>
                    `}
                </div>
            `}

            <!-- ACTORS SUBTAB -->
            ${subTab === 'actors' && html`
                <div>
                    ${(q && matchingActors.length === 0) ? html`
                        <div>
                            ${matchingActresses.length > 0 && html`
                                <div class="stats-switch-tab-hint">
                                    <span>🔍 No actors matching "<strong>${searchQuery}</strong>", but found <strong>${matchingActresses.length}</strong> actress(es) in Actresses.</span>
                                    <button class="stats-switch-tab-btn" onClick=${() => setSubTab('actresses')}>View in Actresses →</button>
                                </div>
                            `}
                            ${matchingDirectors.length > 0 && html`
                                <div class="stats-switch-tab-hint">
                                    <span>🔍 No actors matching "<strong>${searchQuery}</strong>", but found <strong>${matchingDirectors.length}</strong> director(s) in Directors.</span>
                                    <button class="stats-switch-tab-btn" onClick=${() => setSubTab('directors')}>View in Directors →</button>
                                </div>
                            `}
                            ${matchingActresses.length === 0 && matchingDirectors.length === 0 && html`
                                <div style=${{ textAlign: 'center', padding: '48px 0', color: 'var(--mut)' }}>
                                    <div style=${{ fontSize: '36px', marginBottom: '10px' }}>🎭</div>
                                    <p style=${{ fontSize: '16px', color: 'var(--tx)', marginBottom: '6px' }}>No actors found matching "<strong>${searchQuery}</strong>"</p>
                                    <p style=${{ fontSize: '13px' }}>Try searching another name or check the Actresses tab.</p>
                                    <button class="btn btn-ghost btn-sm" style=${{ marginTop: '14px' }} onClick=${() => setSearchQuery('')}>Clear search</button>
                                </div>
                            `}
                        </div>
                    ` : html`
                        <div>
                            <h3 class="poster-shelf-title" style=${{ marginBottom: '14px' }}>
                                ${q ? `Actors matching "${searchQuery}" (${matchingActors.length})` : 'Most Watched Actors'}
                            </h3>
                            <div class="people-grid">
                                ${matchingActors.slice(0, q ? 48 : 14).map((p, idx) => html`
                                    <${PersonCard} key=${idx} person=${p} onClick=${onSelectPerson} />
                                `)}
                            </div>
                            <div class="chart-card" style=${{ marginTop: '24px' }}>
                                <h3 class="chart-title" style=${{ marginBottom: '12px' }}>
                                    ${q ? `Actors Ranking (${matchingActors.length})` : 'Actors Ranking'}
                                </h3>
                                <${RankList} rows=${matchingActors.slice(0, q ? 20 : 15)} unit=" titles" onSelectPerson=${onSelectPerson} />
                            </div>
                        </div>
                    `}
                </div>
            `}

            <!-- ACTRESSES SUBTAB -->
            ${subTab === 'actresses' && html`
                <div>
                    ${(q && matchingActresses.length === 0) ? html`
                        <div>
                            ${matchingActors.length > 0 && html`
                                <div class="stats-switch-tab-hint">
                                    <span>🔍 No actresses matching "<strong>${searchQuery}</strong>", but found <strong>${matchingActors.length}</strong> actor(s) in Actors.</span>
                                    <button class="stats-switch-tab-btn" onClick=${() => setSubTab('actors')}>View in Actors →</button>
                                </div>
                            `}
                            ${matchingDirectors.length > 0 && html`
                                <div class="stats-switch-tab-hint">
                                    <span>🔍 No actresses matching "<strong>${searchQuery}</strong>", but found <strong>${matchingDirectors.length}</strong> director(s) in Directors.</span>
                                    <button class="stats-switch-tab-btn" onClick=${() => setSubTab('directors')}>View in Directors →</button>
                                </div>
                            `}
                            ${matchingActors.length === 0 && matchingDirectors.length === 0 && html`
                                <div style=${{ textAlign: 'center', padding: '48px 0', color: 'var(--mut)' }}>
                                    <div style=${{ fontSize: '36px', marginBottom: '10px' }}>🎭</div>
                                    <p style=${{ fontSize: '16px', color: 'var(--tx)', marginBottom: '6px' }}>No actresses found matching "<strong>${searchQuery}</strong>"</p>
                                    <p style=${{ fontSize: '13px' }}>Try searching another name or check the Actors tab.</p>
                                    <button class="btn btn-ghost btn-sm" style=${{ marginTop: '14px' }} onClick=${() => setSearchQuery('')}>Clear search</button>
                                </div>
                            `}
                        </div>
                    ` : html`
                        <div>
                            <h3 class="poster-shelf-title" style=${{ marginBottom: '14px' }}>
                                ${q ? `Actresses matching "${searchQuery}" (${matchingActresses.length})` : 'Most Watched Actresses'}
                            </h3>
                            <div class="people-grid">
                                ${matchingActresses.slice(0, q ? 48 : 14).map((p, idx) => html`
                                    <${PersonCard} key=${idx} person=${p} onClick=${onSelectPerson} />
                                `)}
                            </div>
                            <div class="chart-card" style=${{ marginTop: '24px' }}>
                                <h3 class="chart-title" style=${{ marginBottom: '12px' }}>
                                    ${q ? `Actresses Ranking (${matchingActresses.length})` : 'Actresses Ranking'}
                                </h3>
                                <${RankList} rows=${matchingActresses.slice(0, q ? 20 : 15)} unit=" titles" onSelectPerson=${onSelectPerson} />
                            </div>
                        </div>
                    `}
                </div>
            `}

            <!-- GENRES SUBTAB -->
            ${subTab === 'genres' && html`
                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                    <div class="chart-card">
                        <h3 class="chart-title" style=${{ marginBottom: '12px' }}>
                            ${q ? `Genres matching "${searchQuery}"` : 'Most Watched Genres'}
                        </h3>
                        <${RankList} rows=${matchingGenres.slice(0, 15)} unit=" titles" />
                    </div>
                    <div class="chart-card">
                        <h3 class="chart-title" style=${{ marginBottom: '4px' }}>Highest-Rated Genres</h3>
                        <p class="chart-sub" style=${{ marginBottom: '12px' }}>Minimum 2 ratings</p>
                        <${RankList} rows=${(activeS.gen && activeS.gen.best ? activeS.gen.best : []).filter(p => !q || p.n.toLowerCase().includes(q)).slice(0, 15).map(p => ({ ...p, c: p.avg }))} max=${5} />
                    </div>
                </div>
            `}

            <!-- DECADES & RECORDS SUBTAB -->
            ${subTab === 'decades' && html`
                <div>
                    <div class="chart-card" style=${{ marginBottom: '24px' }}>
                        <div class="chart-header">
                            <div>
                                <h3 class="chart-title">Distribution by Release Decade</h3>
                                <p class="chart-sub">${selectedYear ? `Films watched in ${selectedYear}` : 'Original release year'}</p>
                            </div>
                        </div>
                        <${InteractiveBars} data=${activeS.decades} color=${COL.b} />
                    </div>

                    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        <div class="card">
                            <h3 class="card-title">Oldest Title Watched</h3>
                            ${activeS.oldest
                ? html`
                                    <div style=${{ marginTop: '12px', cursor: 'pointer' }} onClick=${() => onSelectFilm(activeS.oldest)}>
                                        <p style=${{ fontSize: '18px', fontWeight: 700, margin: 0 }}>${activeS.oldest.name}</p>
                                        <p style=${{ color: 'var(--mut)', margin: '4px 0' }}>Released in ${activeS.oldest.year}</p>
                                        <span style=${{ color: COL.g, fontWeight: 700 }}>${stars(activeS.oldest.rating)}</span>
                                    </div>
                                `
                : html`<p style=${{ color: 'var(--mut)' }}>No release year data</p>`
            }
                        </div>

                        <div class="card">
                            <h3 class="card-title">Newest Title Watched</h3>
                            ${activeS.newest
                ? html`
                                    <div style=${{ marginTop: '12px', cursor: 'pointer' }} onClick=${() => onSelectFilm(activeS.newest)}>
                                        <p style=${{ fontSize: '18px', fontWeight: 700, margin: 0 }}>${activeS.newest.name}</p>
                                        <p style=${{ color: 'var(--mut)', margin: '4px 0' }}>Released in ${activeS.newest.year}</p>
                                        <span style=${{ color: COL.g, fontWeight: 700 }}>${stars(activeS.newest.rating)}</span>
                                    </div>
                                `
                : html`<p style=${{ color: 'var(--mut)' }}>No release year data</p>`
            }
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;
}

function GraphEdTab({ M, onSelectFilm, onSelectPerson }) {
    const years = useMemo(() => {
        return [...new Set(M.entries.filter(e => e.date).map(e => +e.date.slice(0, 4)))].sort((a, b) => b - a);
    }, [M]);

    const [selectedYear, setSelectedYear] = useState(years[0] || new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [stepMsg, setStepMsg] = useState('Revisiting your cinematic year...');
    const [yearData, setYearData] = useState(null);
    const [slide, setSlide] = useState(0);

    const TOTAL_SLIDES = 9;

    // Mobile touch swipe gestures
    const touchStartRef = useRef({ x: 0, y: 0 });
    const onTouchStart = e => {
        if (e.touches && e.touches.length === 1) {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    };
    const onTouchEnd = e => {
        if (e.changedTouches && e.changedTouches.length === 1) {
            const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
            const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
                if (dx < 0) {
                    setSlide(s => Math.min(TOTAL_SLIDES - 1, s + 1));
                } else {
                    setSlide(s => Math.max(0, s - 1));
                }
            }
        }
    };

    useEffect(() => {
        setLoading(true);
        setSlide(0);
        let active = true;
        if (typeof preloadGraphEdAssets === 'function') {
            preloadGraphEdAssets(M, selectedYear, msg => {
                if (active) setStepMsg(msg);
            }).then(res => {
                if (active) {
                    setYearData(res);
                    setLoading(false);
                }
            }).catch(() => {
                if (active) setLoading(false);
            });
        } else {
            const fallback = YearStats.getFullYearData ? YearStats.getFullYearData(M, selectedYear) : null;
            setYearData(fallback);
            setLoading(false);
        }
        return () => { active = false; };
    }, [selectedYear, M]);

    useEffect(() => {
        const onKey = e => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                setSlide(s => Math.min(TOTAL_SLIDES - 1, s + 1));
            } else if (e.key === 'ArrowLeft') {
                setSlide(s => Math.max(0, s - 1));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    if (!years.length) {
        return html`
            <div class="card" style=${{ padding: '48px 24px', textAlign: 'center', color: 'var(--mut)', margin: '40px auto', maxWidth: '600px' }}>
                <div style=${{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
                <h3 style=${{ fontFamily: 'var(--serif)', fontSize: '20px', color: 'var(--tx)', marginBottom: '8px' }}>No dates in diary</h3>
                <p>No dated entries were found in your Letterboxd export to generate an annual GraphEd story.</p>
            </div>
        `;
    }

    if (loading || !yearData) {
        return html`
            <div class="graphed-container">
                <div class="graphed-preloader">
                    <div class="graphed-preloader-watermark">${selectedYear}</div>
                    <div class="graphed-spinner"></div>
                    <div class="graphed-preloader-title">
                        ${selectedYear === new Date().getFullYear() ? `Your ${selectedYear} stats so far` : `Your ${selectedYear} in Film`}
                    </div>
                    <div class="graphed-preloader-step">
                        ${stepMsg}
                    </div>
                </div>
            </div>
        `;
    }

    const d = yearData;
    const topD = d.topDirector;
    const topA = d.topActor;
    const dirName = topD ? (topD.n || topD.name) : '—';
    const actName = topA ? (topA.n || topA.name) : '—';

    return html`
        <div class="graphed-container">
            <!-- Top Controls Bar -->
            <div class="graphed-top-bar">
                <div class="graphed-year-heading">
                    <h1 class="graphed-title-text">${d.title}</h1>
                    <span class="graphed-year-badge">${d.viewingsCount} viewings</span>
                </div>

                <div style=${{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <select
                        class="filter-select"
                        style=${{ fontSize: '14px', padding: '6px 14px', fontWeight: 600 }}
                        value=${selectedYear}
                        onChange=${e => setSelectedYear(+e.target.value)}
                    >
                        ${years.map(yr => html`<option key=${yr} value=${yr}>Year ${yr}</option>`)}
                    </select>
                </div>
            </div>

            <!-- Segmented Story Progress Bar -->
            <div class="graphed-progress-track">
                ${Array.from({ length: TOTAL_SLIDES }).map((_, i) => html`
                    <div
                        key=${i}
                        class=${`graphed-progress-segment ${i < slide ? 'past' : ''} ${i === slide ? 'active' : ''}`}
                        onClick=${() => setSlide(i)}
                        title=${`Slide ${i + 1}`}
                    />
                `)}
            </div>

            <!-- Interactive Slide Stage with Swipe Support -->
            <div class="graphed-slide-stage" onTouchStart=${onTouchStart} onTouchEnd=${onTouchEnd}>
                <!-- Ambient Backdrop Glow (Stage-level behind content) -->
                ${(slide === 1 && d.topReleasedFilm && d.topReleasedFilm.backdrop) && html`
                    <img src=${d.topReleasedFilm.backdrop} alt="" class="graphed-slide-bg" />
                `}
                <div class="graphed-slide-watermark">${selectedYear}</div>

                <!-- Slide 0: The Big Picture / Intro -->
                ${slide === 0 && html`
                    <div class="graphed-slide-content graphed-slide-intro">
                        <div class="graphed-intro-tag">
                            ✨ LBXD GraphEd · Annual Review
                        </div>
                        <h2 class="graphed-intro-title">
                            ${d.title}
                        </h2>
                        <p class="graphed-intro-sub">
                            A visual voyage across all the stories, screen hours, and artists that defined your film experience in ${selectedYear}.
                        </p>

                        <div class="graphed-stats-grid">
                            <div class="stat-card" style=${{ background: 'var(--surface)' }}>
                                <div class="stat-value" style=${{ color: 'var(--g)' }}>${d.viewingsCount}</div>
                                <div class="stat-label">Viewings</div>
                            </div>
                            <div class="stat-card" style=${{ background: 'var(--surface)' }}>
                                <div class="stat-value">${d.uniqueCount}</div>
                                <div class="stat-label">Unique Titles</div>
                            </div>
                            <div class="stat-card" style=${{ background: 'var(--surface)' }}>
                                <div class="stat-value">${d.rewatchesCount}</div>
                                <div class="stat-label">Rewatches</div>
                            </div>
                            <div class="stat-card" style=${{ background: 'var(--surface)' }}>
                                <div class="stat-value">${d.runtime.hours ? d.runtime.hours + ' h' : '—'}</div>
                                <div class="stat-label">Watch Time</div>
                            </div>
                        </div>

                        <div class="graphed-intro-streak">
                            ${d.habits.activeDays} days of the year enjoying cinema · Longest streak: ${d.habits.streak} consecutive days
                        </div>
                    </div>
                `}

                <!-- Slide 1: Favorite Film Released this Year -->
                ${slide === 1 && html`
                    <div class="graphed-slide-content">
                        <div style=${{ marginBottom: '16px', textAlign: 'center' }}>
                            <div class="graphed-badge-released">
                                <span>🏆</span>
                                <span>${d.topReleasedFilm && d.topReleasedFilm.year === selectedYear
                ? `Your Favorite Film Released in ${selectedYear}`
                : `Highest-Rated Film of ${selectedYear}`
            }</span>
                            </div>
                        </div>

                        ${d.topReleasedFilm ? html`
                            <div class="graphed-released-hero">
                                <div class="graphed-released-poster" onClick=${() => onSelectFilm && onSelectFilm(d.topReleasedFilm)}>
                                    <div class="film-poster-wrap">
                                        ${d.topReleasedFilm.poster
                    ? html`<img src=${d.topReleasedFilm.poster} alt=${d.topReleasedFilm.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span>${d.topReleasedFilm.name}</span></div>`
                }
                                    </div>
                                </div>

                                <div class="graphed-released-details">
                                    <h2 class="graphed-released-title">
                                        ${d.topReleasedFilm.name}
                                    </h2>
                                    <div class="graphed-released-meta">
                                        Released in <strong>${d.topReleasedFilm.year || selectedYear}</strong>
                                        ${(() => {
                    const dirStr = getDirectorNames(d.topReleasedFilm);
                    return dirStr ? ` · Directed by ${dirStr}` : '';
                })()}
                                    </div>
                                    <div class="graphed-released-stars-row">
                                        <div class="graphed-released-stars">
                                            ${stars(d.topReleasedFilm.rating)}
                                        </div>
                                        ${d.topReleasedFilm.rating != null && html`
                                            <span class="graphed-released-rating-val">${fmt(d.topReleasedFilm.rating, 1)}★</span>
                                        `}
                                    </div>
                                    <p class="graphed-released-desc">
                                        ${d.topReleasedFilm.year === selectedYear
                    ? `Your crowned masterpiece and personal favorite among all films released in ${selectedYear}. No other new release topped your rating.`
                    : `Your highest-rated and most cherished screening enjoyed during ${selectedYear}.`
                }
                                    </p>

                                    ${(d.topReleasedFilms && d.topReleasedFilms.length > 1) && html`
                                        <div class="graphed-runnerups-wrap">
                                            <div class="graphed-runnerups-label">
                                                Other standout gems released in ${selectedYear}:
                                            </div>
                                            <div class="graphed-runnerups-row">
                                                ${d.topReleasedFilms.slice(1, 6).map(rf => html`
                                                    <div key=${rf.key} class="graphed-runnerup-item" onClick=${() => onSelectFilm && onSelectFilm(rf)} title=${`${rf.name} (${rf.rating != null ? rf.rating + '★' : ''})`}>
                                                        <div class="film-poster-wrap">
                                                            ${rf.poster
                        ? html`<img src=${rf.poster} alt=${rf.name} class="film-poster-img" />`
                        : html`<div class="film-poster-fallback"><span style=${{ fontSize: '9px' }}>${rf.name}</span></div>`
                    }
                                                        </div>
                                                        <div class="graphed-runnerup-stars">${rf.rating != null ? `${rf.rating}★` : ''}</div>
                                                    </div>
                                                `)}
                                            </div>
                                        </div>
                                    `}
                                </div>
                            </div>
                        ` : html`
                            <div style=${{ textAlign: 'center', color: 'var(--mut)', padding: '40px 0' }}>
                                <div style=${{ fontSize: '36px', marginBottom: '12px' }}>🎬</div>
                                <div style=${{ fontSize: '16px' }}>No ratings recorded for films released in this year.</div>
                            </div>
                        `}
                    </div>
                `}

                <!-- Slide 2: Director of the Year -->
                ${slide === 2 && html`
                    <div class="graphed-slide-content">
                        <div class="graphed-hero-person-wrap">
                            <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '14px' }}>
                                🎬 Director of the Year
                            </div>

                            ${topD && topD.photo
                ? html`<img src=${topD.photo} alt=${dirName} class="graphed-hero-portrait" />`
                : html`<div class="graphed-hero-fallback-portrait">🎬</div>`
            }

                            <h2 class="graphed-hero-name">
                                ${dirName}
                            </h2>

                            <div class="graphed-hero-stats">
                                ${topD ? `${topD.c} films watched in ${selectedYear}${topD.avg != null ? ` · ${fmt(topD.avg)}★ average` : ''}` : ''}
                            </div>

                            <p class="graphed-editorial-phrase">
                                ${topD
                ? `A cinematic journey guided by the vision and style of ${dirName}: ${topD.c} of their films were part of your year.`
                : 'Not enough director data for this period.'
            }
                            </p>

                            ${topD && topD.films && topD.films.length > 0 && html`
                                <div class="graphed-hero-thumbs">
                                    ${topD.films.slice(0, 5).map(f => html`
                                        <div key=${f.key} class="graphed-hero-thumb-item" onClick=${() => onSelectFilm && onSelectFilm(f)} title=${f.name}>
                                            <div class="film-poster-wrap">
                                                ${f.poster
                    ? html`<img src=${f.poster} alt=${f.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span style=${{ fontSize: '9px' }}>${f.name}</span></div>`
                }
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            `}
                        </div>
                    </div>
                `}

                <!-- Slide 3: Actor of the Year -->
                ${slide === 3 && html`
                    <div class="graphed-slide-content">
                        <div class="graphed-hero-person-wrap">
                            <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '14px' }}>
                                🌟 Screen Presence of the Year
                            </div>

                            ${topA && topA.photo
                ? html`<img src=${topA.photo} alt=${actName} class="graphed-hero-portrait" />`
                : html`<div class="graphed-hero-fallback-portrait">🎭</div>`
            }

                            <h2 class="graphed-hero-name">
                                ${actName}
                            </h2>

                            <div class="graphed-hero-stats">
                                ${topA ? `${topA.c} screen appearances in ${selectedYear}${topA.avg != null ? ` · ${fmt(topA.avg)}★ average` : ''}` : ''}
                            </div>

                            <p class="graphed-editorial-phrase">
                                ${topA
                ? `The performer who accompanied your screenings the most: ${actName} starred in ${topA.c} of your films this year.`
                : 'Not enough cast data for this period.'
            }
                            </p>

                            ${topA && topA.films && topA.films.length > 0 && html`
                                <div class="graphed-hero-thumbs">
                                    ${topA.films.slice(0, 5).map(f => html`
                                        <div key=${f.key} class="graphed-hero-thumb-item" onClick=${() => onSelectFilm && onSelectFilm(f)} title=${f.name}>
                                            <div class="film-poster-wrap">
                                                ${f.poster
                    ? html`<img src=${f.poster} alt=${f.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span style=${{ fontSize: '9px' }}>${f.name}</span></div>`
                }
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            `}
                        </div>
                    </div>
                `}

                <!-- Slide 4: Top Directors & Top Cast -->
                ${slide === 4 && html`
                    <div class="graphed-slide-content">
                        <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '14px', textAlign: 'center' }}>
                            👥 Most Frequent Directors & Cast
                        </div>

                        <div class="graphed-dual-grid">
                            <!-- Top Directors -->
                            <div class="card graphed-dual-card">
                                <h3 class="graphed-dual-title">Top Directors</h3>
                                <div class="graphed-dual-list">
                                    ${(d.topDirectors || []).slice(0, 5).map((dir, i) => html`
                                        <div key=${i} class="graphed-person-row">
                                            <div class="graphed-person-circle">
                                                ${dir.photo ? html`<img src=${dir.photo} alt=${dir.n || dir.name} />` : '🎬'}
                                            </div>
                                            <div style=${{ flex: 1, minWidth: 0 }}>
                                                <div class="graphed-person-name">${dir.n || dir.name}</div>
                                                <div class="graphed-person-sub">${dir.c} titles${dir.avg != null ? ` · ${fmt(dir.avg)}★` : ''}</div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>

                            <!-- Top Actors -->
                            <div class="card graphed-dual-card">
                                <h3 class="graphed-dual-title">Top Actors & Actresses</h3>
                                <div class="graphed-dual-list">
                                    ${(d.topActors || []).slice(0, 5).map((act, i) => html`
                                        <div key=${i} class="graphed-person-row">
                                            <div class="graphed-person-circle">
                                                ${act.photo ? html`<img src=${act.photo} alt=${act.n || act.name} />` : '🎭'}
                                            </div>
                                            <div style=${{ flex: 1, minWidth: 0 }}>
                                                <div class="graphed-person-name">${act.n || act.name}</div>
                                                <div class="graphed-person-sub">${act.c} films${act.avg != null ? ` · ${fmt(act.avg)}★` : ''}</div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        </div>
                    </div>
                `}

                <!-- Slide 5: How It Started vs How It Ended -->
                ${slide === 5 && html`
                    <div class="graphed-slide-content">
                        <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '16px', textAlign: 'center' }}>
                            ⏳ The Beginning and The End
                        </div>

                        <div class="graphed-compare-grid">
                            <!-- First film -->
                            <div class="card graphed-compare-card">
                                <div class="graphed-compare-tag" style=${{ color: 'var(--g)' }}>
                                    First Logged
                                </div>
                                ${d.firstFilm ? html`
                                    <div class="graphed-compare-poster-wrap" onClick=${() => onSelectFilm && onSelectFilm(d.firstFilm)}>
                                        <div class="film-poster-wrap">
                                            ${d.firstFilm.poster
                    ? html`<img src=${d.firstFilm.poster} alt=${d.firstFilm.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span>${d.firstFilm.name}</span></div>`
                }
                                        </div>
                                    </div>
                                    <div class="graphed-compare-title">${d.firstFilm.name}</div>
                                    <div class="graphed-compare-date">Watched ${d.firstEntry ? d.firstEntry.date : '—'}</div>
                                    <div class="graphed-compare-stars">${stars(d.firstEntry ? d.firstEntry.rating : d.firstFilm.rating)}</div>
                                ` : html`
                                    <div style=${{ color: 'var(--mut)', padding: '24px 0' }}>No dated entries</div>
                                `}
                            </div>

                            <!-- Last film -->
                            <div class="card graphed-compare-card">
                                <div class="graphed-compare-tag" style=${{ color: 'var(--o)' }}>
                                    Last Logged
                                </div>
                                ${d.lastFilm ? html`
                                    <div class="graphed-compare-poster-wrap" onClick=${() => onSelectFilm && onSelectFilm(d.lastFilm)}>
                                        <div class="film-poster-wrap">
                                            ${d.lastFilm.poster
                    ? html`<img src=${d.lastFilm.poster} alt=${d.lastFilm.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span>${d.lastFilm.name}</span></div>`
                }
                                        </div>
                                    </div>
                                    <div class="graphed-compare-title">${d.lastFilm.name}</div>
                                    <div class="graphed-compare-date">Watched ${d.lastEntry ? d.lastEntry.date : '—'}</div>
                                    <div class="graphed-compare-stars">${stars(d.lastEntry ? d.lastEntry.rating : d.lastFilm.rating)}</div>
                                ` : html`
                                    <div style=${{ color: 'var(--mut)', padding: '24px 0' }}>No dated entries</div>
                                `}
                            </div>
                        </div>
                    </div>
                `}

                <!-- Slide 6: Obsessions & Extremes -->
                ${slide === 6 && html`
                    <div class="graphed-slide-content">
                        <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '16px', textAlign: 'center' }}>
                            🔁 Obsessions & Extremes of the Year
                        </div>

                        <div class="graphed-extremes-grid">
                            <!-- Most Rewatched -->
                            <div class="card graphed-extreme-card">
                                <div class="graphed-extreme-tag" style=${{ color: 'var(--g)' }}>Most Rewatched Film</div>
                                ${d.mostRewatched && d.mostRewatched.film ? html`
                                    <div class="graphed-extreme-body">
                                        <div class="graphed-extreme-poster" onClick=${() => onSelectFilm && onSelectFilm(d.mostRewatched.film)}>
                                            <div class="film-poster-wrap">
                                                ${d.mostRewatched.film.poster
                    ? html`<img src=${d.mostRewatched.film.poster} alt=${d.mostRewatched.film.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span style=${{ fontSize: '10px' }}>${d.mostRewatched.film.name}</span></div>`
                }
                                            </div>
                                        </div>
                                        <div style=${{ flex: 1, minWidth: 0 }}>
                                            <div class="graphed-extreme-name">${d.mostRewatched.film.name}</div>
                                            <div class="graphed-extreme-meta" style=${{ color: 'var(--g)' }}>
                                                ${d.mostRewatched.totalYearViews} times watched in ${selectedYear}
                                            </div>
                                        </div>
                                    </div>
                                ` : html`
                                    <div style=${{ color: 'var(--mut)', fontSize: '14px' }}>No rewatches logged this year.</div>
                                `}
                            </div>

                            <!-- Worst Rated -->
                            <div class="card graphed-extreme-card">
                                <div class="graphed-extreme-tag" style=${{ color: 'var(--red)' }}>Your Big Letdown</div>
                                ${d.worstFilm ? html`
                                    <div class="graphed-extreme-body">
                                        <div class="graphed-extreme-poster" onClick=${() => onSelectFilm && onSelectFilm(d.worstFilm)}>
                                            <div class="film-poster-wrap">
                                                ${d.worstFilm.poster
                    ? html`<img src=${d.worstFilm.poster} alt=${d.worstFilm.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span style=${{ fontSize: '10px' }}>${d.worstFilm.name}</span></div>`
                }
                                            </div>
                                        </div>
                                        <div style=${{ flex: 1, minWidth: 0 }}>
                                            <div class="graphed-extreme-name">${d.worstFilm.name}</div>
                                            <div class="graphed-extreme-meta" style=${{ color: 'var(--red)' }}>
                                                ${stars(d.worstFilm.rating)} (${fmt(d.worstFilm.rating, 1)}★)
                                            </div>
                                            <div style=${{ color: 'var(--mut)', fontSize: '12px' }}>Lowest score of the year.</div>
                                        </div>
                                    </div>
                                ` : html`
                                    <div style=${{ color: 'var(--mut)', fontSize: '14px' }}>All your ratings this year were stellar.</div>
                                `}
                            </div>
                        </div>
                    </div>
                `}

                <!-- Slide 7: Viewing Habits -->
                ${slide === 7 && html`
                    <div class="graphed-slide-content">
                        <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '16px', textAlign: 'center' }}>
                            📊 Viewing Rhythm & Habits
                        </div>

                        <div class="graphed-habits-grid">
                            <div class="stat-card graphed-habit-card">
                                <div class="graphed-habit-lbl">Sacred Day</div>
                                <div class="graphed-habit-val" style=${{ color: 'var(--g)' }}>${d.habits.favWeekday.l}</div>
                                <div class="graphed-habit-sub">${d.habits.favWeekday.v} films watched</div>
                            </div>

                            <div class="stat-card graphed-habit-card">
                                <div class="graphed-habit-lbl">Peak Month</div>
                                <div class="graphed-habit-val" style=${{ color: 'var(--g)' }}>${d.habits.favMonth.l}</div>
                                <div class="graphed-habit-sub">${d.habits.favMonth.v} titles enjoyed</div>
                            </div>

                            <div class="stat-card graphed-habit-card">
                                <div class="graphed-habit-lbl">Record Streak</div>
                                <div class="graphed-habit-val">${d.habits.streak} days</div>
                                <div class="graphed-habit-sub">Consecutive cinema</div>
                            </div>

                            <div class="stat-card graphed-habit-card">
                                <div class="graphed-habit-lbl">Record Day</div>
                                <div class="graphed-habit-val">${d.habits.recordDay[1]} films</div>
                                <div class="graphed-habit-sub">On ${d.habits.recordDay[0]}</div>
                            </div>
                        </div>
                    </div>
                `}

                <!-- Slide 8: Gallery & Closing -->
                ${slide === 8 && html`
                    <div class="graphed-slide-content" style=${{ textAlign: 'center' }}>
                        <div style=${{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--g)', fontWeight: 800, marginBottom: '10px' }}>
                            🎬 Your Masterpieces of ${selectedYear}
                        </div>
                        <h2 class="graphed-gallery-title">
                            An unforgettable year in cinema
                        </h2>

                        <div class="graphed-gallery-row">
                            ${(d.topFilms || []).slice(0, 6).map(f => html`
                                <div key=${f.key} class="graphed-gallery-item" onClick=${() => onSelectFilm && onSelectFilm(f)} title=${f.name}>
                                    <div class="film-poster-wrap">
                                        ${f.poster
                    ? html`<img src=${f.poster} alt=${f.name} class="film-poster-img" />`
                    : html`<div class="film-poster-fallback"><span style=${{ fontSize: '10px' }}>${f.name}</span></div>`
                }
                                    </div>
                                    <div class="graphed-gallery-stars">${stars(f.rating)}</div>
                                </div>
                            `)}
                        </div>

                        <div style=${{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <button class="btn btn-primary" onClick=${() => setSlide(0)}>
                                ↺ Replay Story
                            </button>
                        </div>
                    </div>
                `}

                <!-- Bottom Navigation Controls -->
                <div class="graphed-controls-bar">
                    <button
                        class="graphed-nav-btn"
                        disabled=${slide === 0}
                        onClick=${() => setSlide(s => Math.max(0, s - 1))}
                    >
                        ← Previous
                    </button>

                    <div class="graphed-slide-counter">
                        ${slide + 1} / ${TOTAL_SLIDES}
                    </div>

                    <button
                        class="graphed-nav-btn"
                        disabled=${slide === TOTAL_SLIDES - 1}
                        onClick=${() => setSlide(s => Math.min(TOTAL_SLIDES - 1, s + 1))}
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>
    `;
}

function CreditsTab() {
    return html`
        <div class="credits-wrapper">
            <h2 style=${{ fontFamily: 'var(--serif)', fontSize: '32px', textAlign: 'center', marginBottom: '8px' }}>Credits & About LBXD</h2>
            <p style=${{ textAlign: 'center', color: 'var(--mut)', marginBottom: '36px' }}>
                An independent open-source project dedicated to cinema lovers.
            </p>

            <div class="credits-block">
                <div class="credits-block-header">
                    <span class="credits-block-icon">🎬</span>
                    <h3>About LBXD Stats Generator</h3>
                </div>
                <p>
                    <strong>LBXD Stats Generator</strong> is an independent, open-source project created for film lovers
                    who want to explore their Letterboxd history in a more visual and personal way.
                </p>
                <p>
                    Import your Letterboxd data, discover your cinematic habits, explore your favorite films,
                    and create your own yearly movie recap.
                </p>
                <p>
                    LBXD is not affiliated with Letterboxd. It is an independent project built by a film lover, for film lovers.
                </p>
            </div>

            <div class="credits-block">
                <div class="credits-block-header">
                    <span class="credits-block-icon">💚</span>
                    <h3>Made possible by Letterboxd</h3>
                </div>
                <p>
                    Letterboxd is the ultimate social network for film enthusiasts. LBXD exists thanks to
                    Letterboxd's vibrant community and the ability for members to export their personal data openly and transparently.
                </p>
                <a href="https://letterboxd.com" target="_blank" rel="noopener" class="credits-badge-link">
                    <span>🎬</span> letterboxd.com ↗
                </a>
                <div class="disclaimer-note">
                    LBXD is an independent project and is not affiliated with, endorsed by, or officially connected to Letterboxd.
                </div>
            </div>

            <div class="credits-block">
                <div class="credits-block-header">
                    <span class="credits-block-icon">🎞️</span>
                    <h3>Powered by The Movie Database</h3>
                </div>
                <p>
                    Film metadata, official posters, wide backdrop artwork, and director/actor profile photography
                    are provided through The Movie Database (TMDB) API.
                </p>
                <a href="https://www.themoviedb.org" target="_blank" rel="noopener" class="credits-badge-link">
                    <span>🎥</span> themoviedb.org ↗
                </a>
                <div class="disclaimer-note">
                    This product uses the TMDB API but is not endorsed or certified by TMDB.
                </div>
            </div>

            <div class="credits-block">
                <div class="credits-block-header">
                    <span class="credits-block-icon">👨‍💻</span>
                    <h3>Created by David Ferreiro</h3>
                </div>
                <p>
                    LBXD Stats Generator was designed and built by <strong>David Ferreiro</strong> as an open-source personal project
                    crafted with care for the global film community.
                </p>
                <p>
                    LBXD is open source. Its full source code is publicly available on GitHub for anyone to explore, contribute to, or inspect.
                </p>
                <a href="https://github.com/DavidFerreiro-dev" target="_blank" rel="noopener" class="btn btn-primary" style=${{ display: 'inline-flex' }}>
                    View David Ferreiro on GitHub ↗
                </a>
                <a href="https://github.com/DavidFerreiro-dev/LBXD_StatsGenerator" target="_blank" rel="noopener" class="btn btn-ghost" style=${{ display: 'inline-flex', marginLeft: '8px' }}>
                    View LBXD repository ↗
                </a>
            </div>

            <div class="credits-block">
                <div class="credits-block-header">
                    <span class="credits-block-icon">🔒</span>
                    <h3>Privacy & Local Data Processing</h3>
                </div>
                <p>
                    <strong>100% Local in your browser:</strong> Your ZIP and CSV files are decompressed and parsed exclusively inside your browser's local memory. No personal viewing data, dates, reviews or ratings are ever sent to external servers.
                </p>
                <p>
                    <strong>No persistent tracking:</strong> LBXD does not store your film data in external databases. When you close the tab or click "Clear Data", your session is wiped clean.
                </p>
                <p>
                    <strong>TMDB Enrichment:</strong> When fetching posters and metadata, only film titles and release years are queried against TMDB's public API, never your personal user information.
                </p>
            </div>
        </div>
    `;
}

/* ==========================================================================
   Dashboard Root
   ========================================================================== */

function Dashboard({ M0, initialMeta = {}, onClear }) {
    const [tab, setTab] = useState('overview');
    const [q, setQ] = useState({ year: '', decade: '', rating: '', genre: '', director: '', actor: '', liked: false, rewatched: false, mediaType: 'all' });
    const [meta, setMeta] = useState(initialMeta || {});
    const [selectedFilm, setSelectedFilm] = useState(null);
    const [selectedPerson, setSelectedPerson] = useState(null);

    // Dynamic model with metadata
    const M = useMemo(() => {
        return {
            ...M0,
            films: M0.films.map(f => {
                const enriched = meta[f.key] ? { ...f, ...meta[f.key] } : f;
                return enriched;
            })
        };
    }, [M0, meta]);

    const V = useMemo(() => applyFilters(M, q), [M, q]);
    const S = useMemo(() => compute(V), [V]);

    // Silent background enrichment for remaining unwatched or archive films (if any)
    // Updates once when finished rather than on every film, preventing numbers from rising or posters popping in
    useEffect(() => {
        const remaining = M0.films.filter(f => f.watched && !meta[f.key]);
        if (remaining.length) {
            enrichTMDB(remaining, TMDB_KEY).then(res => {
                if (res && Object.keys(res).length) {
                    setMeta(m => ({ ...m, ...res }));
                }
            }).catch(() => { });
        }
    }, [M0]);

    const toggleTvType = useCallback(filmKey => {
        const target = M0.films.find(f => f.key === filmKey);
        if (target) {
            target.isTv = !target.isTv;
            setMeta(m => ({
                ...m,
                [filmKey]: {
                    ...(m[filmKey] || {}),
                    isTv: target.isTv
                }
            }));
            if (selectedFilm && selectedFilm.key === filmKey) {
                setSelectedFilm(sf => ({ ...sf, isTv: target.isTv }));
            }
        }
    }, [M0, selectedFilm]);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        });
    }, [tab]);

    return html`
        <div>
            <${Header}
                tab=${tab}
                setTab=${setTab}
                onClear=${onClear}
                user=${M.profile.user}
            />

            <main class=${tab === 'overview' || tab === 'graphed' ? '' : 'wrap'}>
                ${tab !== 'overview' && tab !== 'graphed' && tab !== 'credits' && html`
                    <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 6px', flexWrap: 'wrap', gap: '10px' }}>
                        <div class="media-filter-pills">
                            <button class=${`media-filter-btn ${q.mediaType === 'all' ? 'active' : ''}`} onClick=${() => setQ({ ...q, mediaType: 'all' })}>All (${M.films.length})</button>
                            <button class=${`media-filter-btn ${q.mediaType === 'movie' ? 'active' : ''}`} onClick=${() => setQ({ ...q, mediaType: 'movie' })}>Films (${M.films.length})</button>
                        </div>

                        ${Object.values(q).some(Boolean) && html`
                            <button class="btn btn-ghost btn-sm" onClick=${() => setQ({ year: '', decade: '', rating: '', genre: '', director: '', actor: '', liked: false, rewatched: false, mediaType: 'all' })}>
                                Clear filters
                            </button>
                        `}
                    </div>
                `}

                <div style=${{ minHeight: '65vh' }}>
                    ${tab === 'overview' && html`<${OverviewTab} M=${M} S=${S} setTab=${setTab} onSelectFilm=${setSelectedFilm} />`}
                    ${tab === 'films' && html`<${FilmsTab} V=${V} S=${S} onSelectFilm=${setSelectedFilm} />`}
                    ${tab === 'diary' && html`<${DiaryTab} V=${V} S=${S} onSelectFilm=${setSelectedFilm} />`}
                    ${tab === 'ratings' && html`<${RatingsTab} S=${S} onSelectFilm=${setSelectedFilm} />`}
                    ${tab === 'stats' && html`<${StatsTab} M=${M} S=${S} onSelectFilm=${setSelectedFilm} onSelectPerson=${setSelectedPerson} />`}
                    ${tab === 'graphed' && html`<${GraphEdTab} M=${M} onSelectFilm=${setSelectedFilm} onSelectPerson=${setSelectedPerson} />`}
                    ${tab === 'credits' && html`<${CreditsTab} />`}
                </div>
            </main>

            <${Footer} setTab=${setTab} />
            <${MobileNav} tab=${tab} setTab=${setTab} />

            ${selectedFilm && html`
                <${FilmModal}
                    film=${selectedFilm}
                    entries=${M.entries}
                    onClose=${() => setSelectedFilm(null)}
                    onToggleTvType=${toggleTvType}
                    onChangeWork=${async (film, result) => {
                const target = M0.films.find(f => f.key === film.key);
                if (!target) return;
                const updated = await enrichTMDB([{ ...target, tmdbSelection: result }], TMDB_KEY);
                if (updated && updated[film.key]) {
                    setMeta(m => ({ ...m, [film.key]: { ...(m[film.key] || {}), ...updated[film.key] } }));
                    setSelectedFilm(sf => ({ ...sf, ...updated[film.key] }));
                }
            }}
                    onSelectPerson=${p => {
                setSelectedFilm(null);
                setSelectedPerson(p);
            }}
                />
            `}

            ${selectedPerson && html`
                <${PersonModal}
                    person=${selectedPerson}
                    films=${M.films}
                    entries=${M.entries}
                    onClose=${() => setSelectedPerson(null)}
                    onSelectFilm=${setSelectedFilm}
                />
            `}
        </div>
    `;
}

/* ==========================================================================
   Landing Screen
   ========================================================================== */

/* ==========================================================================
   Demo Dataset Generator for Instant Showcase
   ========================================================================== */

function createDemoData() {
    const demoFilms = [
        {
            key: 'dune-part-two-2024',
            name: 'Dune: Part Two',
            year: 2024,
            rating: 5,
            watched: true,
            liked: true,
            runtime: 166,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s520b4q.jpg',
            directors: [{ name: 'Denis Villeneuve', role: 'Director', photo: 'https://image.tmdb.org/t/p/w185/cOQCmbbHkZ38VvM4EomqBwM1E44.jpg' }],
            cast: [
                { n: 'Timothée Chalamet', photo: 'https://image.tmdb.org/t/p/w185/BE2sdjpgsa2rNTFa66f7upkaOP.jpg' },
                { n: 'Zendaya', photo: 'https://image.tmdb.org/t/p/w185/tylFh1lhqGvY0R7q8J2D8K6i6q6.jpg' }
            ],
            genres: ['Ciencia ficción', 'Aventura']
        },
        {
            key: 'oppenheimer-2023',
            name: 'Oppenheimer',
            year: 2023,
            rating: 5,
            watched: true,
            liked: true,
            runtime: 180,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
            directors: [{ name: 'Christopher Nolan', role: 'Director', photo: 'https://image.tmdb.org/t/p/w185/xuAIuYSmsUzKlUMBFGVZaWsY3Z5.jpg' }],
            cast: [
                { n: 'Cillian Murphy', photo: 'https://image.tmdb.org/t/p/w185/360RfhU0B4052gnv8jAhcW5sE2l.jpg' },
                { n: 'Robert Downey Jr.', photo: 'https://image.tmdb.org/t/p/w185/5qHNjhtjMD4YWH3fq0l4io597RX.jpg' }
            ],
            genres: ['Drama', 'Historia']
        },
        {
            key: 'poor-things-2023',
            name: 'Poor Things',
            year: 2023,
            rating: 4.5,
            watched: true,
            liked: true,
            runtime: 141,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/kCGlIMHnOm8JPXq3rXM6c5wMxcT.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/bQS43HSLZzMjZkcHJz4fAz7DCfE.jpg',
            directors: [{ name: 'Yorgos Lanthimos', role: 'Director', photo: 'https://image.tmdb.org/t/p/w185/8ZzH4B92KxX22l0pG2yJ3k2u6E2.jpg' }],
            cast: [{ n: 'Emma Stone' }, { n: 'Mark Ruffalo' }],
            genres: ['Comedia', 'Ciencia ficción']
        },
        {
            key: 'past-lives-2023',
            name: 'Past Lives',
            year: 2023,
            rating: 4.5,
            watched: true,
            liked: true,
            runtime: 106,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/k3waqVXSnvCZWfJYNtdamTgTtTA.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/5mzr6An1SQunYe6Y20U82FAqAo5.jpg',
            directors: [{ name: 'Celine Song', role: 'Director' }],
            cast: [{ n: 'Greta Lee' }, { n: 'Teo Yoo' }],
            genres: ['Romance', 'Drama']
        },
        {
            key: 'blade-runner-2049-2017',
            name: 'Blade Runner 2049',
            year: 2017,
            rating: 5,
            watched: true,
            liked: true,
            runtime: 164,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/sAtoMqDVhNDQBc3QJL3RF6hlxGq.jpg',
            directors: [{ name: 'Denis Villeneuve', role: 'Director', photo: 'https://image.tmdb.org/t/p/w185/cOQCmbbHkZ38VvM4EomqBwM1E44.jpg' }],
            cast: [{ n: 'Ryan Gosling' }, { n: 'Harrison Ford' }, { n: 'Ana de Armas' }],
            genres: ['Ciencia ficción', 'Misterio']
        },
        {
            key: 'arrival-2016',
            name: 'Arrival',
            year: 2016,
            rating: 4.5,
            watched: true,
            liked: true,
            runtime: 116,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/y2A5k1t7fWw6tVb7z9h3gZ9gG7h.jpg',
            directors: [{ name: 'Denis Villeneuve', role: 'Director', photo: 'https://image.tmdb.org/t/p/w185/cOQCmbbHkZ38VvM4EomqBwM1E44.jpg' }],
            cast: [{ n: 'Amy Adams' }, { n: 'Jeremy Renner' }],
            genres: ['Ciencia ficción', 'Drama']
        },
        {
            key: 'challengers-2024',
            name: 'Challengers',
            year: 2024,
            rating: 4.5,
            watched: true,
            liked: true,
            runtime: 131,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/H6vke73qFLvgQCuURNMDrVRStG.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/4f6h5lZ283F1f0951y2k1i4f9L3.jpg',
            directors: [{ name: 'Luca Guadagnino', role: 'Director' }],
            cast: [{ n: 'Zendaya' }, { n: 'Mike Faist' }, { n: 'Josh O\'Connor' }],
            genres: ['Drama', 'Romance']
        },
        {
            key: 'chernobyl-2019',
            name: 'Chernobyl',
            year: 2019,
            rating: 5,
            watched: true,
            liked: true,
            runtime: 330,
            isTv: true,
            seasons: 1,
            episodes: 5,
            poster: 'https://image.tmdb.org/t/p/w342/hlLXt2tOPT6RRnjiUmoxyG9LTFi.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/900tHlUYUkp7Ol041F0TG099vNu.jpg',
            directors: [{ name: 'Johan Renck', role: 'Director' }],
            cast: [{ n: 'Jared Harris' }, { n: 'Stellan Skarsgård' }],
            genres: ['Drama', 'Historia']
        },
        {
            key: 'spirited-away-2001',
            name: 'Spirited Away',
            year: 2001,
            rating: 5,
            watched: true,
            liked: true,
            runtime: 125,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg',
            directors: [{ name: 'Hayao Miyazaki', role: 'Director' }],
            cast: [{ n: 'Rumi Hiiragi' }],
            genres: ['Animación', 'Familia', 'Fantasía']
        },
        {
            key: 'parasite-2019',
            name: 'Parasite',
            year: 2019,
            rating: 5,
            watched: true,
            liked: true,
            runtime: 132,
            isTv: false,
            poster: 'https://image.tmdb.org/t/p/w342/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg',
            backdrop: 'https://image.tmdb.org/t/p/w1280/hiKmpZMGZsrkA3cdce8a7Dpos1j.jpg',
            directors: [{ name: 'Bong Joon-ho', role: 'Director' }],
            cast: [{ n: 'Song Kang-ho' }, { n: 'Lee Sun-kyun' }],
            genres: ['Comedia', 'Suspense', 'Drama']
        }
    ];

    const demoEntries = [
        { key: 'spirited-away-2001', date: '2024-01-01', logged: '2024-01-01', rating: 5, isRewatch: false },
        { key: 'arrival-2016', date: '2024-01-14', logged: '2024-01-14', rating: 4.5, isRewatch: false },
        { key: 'blade-runner-2049-2017', date: '2024-02-04', logged: '2024-02-04', rating: 5, isRewatch: false },
        { key: 'dune-part-two-2024', date: '2024-03-01', logged: '2024-03-01', rating: 5, isRewatch: false },
        { key: 'dune-part-two-2024', date: '2024-03-18', logged: '2024-03-18', rating: 5, isRewatch: true },
        { key: 'poor-things-2023', date: '2024-03-24', logged: '2024-03-24', rating: 4.5, isRewatch: false },
        { key: 'past-lives-2023', date: '2024-04-12', logged: '2024-04-12', rating: 4.5, isRewatch: false },
        { key: 'challengers-2024', date: '2024-05-02', logged: '2024-05-02', rating: 4.5, isRewatch: false },
        { key: 'chernobyl-2019', date: '2024-06-15', logged: '2024-06-15', rating: 5, isRewatch: false },
        { key: 'oppenheimer-2023', date: '2024-08-20', logged: '2024-08-20', rating: 5, isRewatch: false },
        { key: 'parasite-2019', date: '2024-10-31', logged: '2024-10-31', rating: 5, isRewatch: false },
        { key: 'dune-part-two-2024', date: '2024-12-30', logged: '2024-12-30', rating: 5, isRewatch: true }
    ];

    return {
        films: demoFilms,
        entries: demoEntries,
        reviews: [
            { key: 'dune-part-two-2024', text: 'An overwhelming sensory experience. Denis Villeneuve delivers a masterclass in modern sci-fi cinema.', date: '2024-03-01' }
        ],
        watchlist: [],
        lists: [],
        profile: {
            user: 'cinemaniac_demo',
            joined: '2022-04-10'
        },
        diag: {
            counts: {
                films: demoFilms.length,
                entries: demoEntries.length,
                rewatches: 2,
                rated: demoFilms.length,
                dated: demoEntries.length,
                watchlist: 0,
                lists: 0
            },
            warnings: []
        }
    };
}

/* ==========================================================================
   Landing Screen & File Readers
   ========================================================================== */

async function readEntries(dt) {
    const out = [];
    if (dt.items && dt.items.length) {
        const walk = async (en, path) => {
            if (en.isFile) {
                await new Promise(r => en.file(f => { out.push(f); f._p = path + f.name; r(); }, r));
            } else if (en.isDirectory) {
                const rd = en.createReader();
                let b;
                do {
                    b = await new Promise(r => rd.readEntries(r, () => r([])));
                    for (const c of b) await walk(c, path + en.name + '/');
                } while (b.length);
            }
        };
        const items = [...dt.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
        if (items.length) {
            for (const e of items) await walk(e, '');
            if (out.length) return out;
        }
    }
    return [...(dt.files || [])];
}

async function toSources(files) {
    const src = [];
    for (const f of files) {
        const isZip = /\.(zip)$/i.test(f.name);
        if (isZip) {
            let z;
            try {
                z = await JSZip.loadAsync(f);
            } catch (e) {
                throw new Error('«' + f.name + '» is not a valid ZIP file or is corrupted.');
            }
            z.forEach((p, zf) => {
                if (!zf.dir) {
                    src.push({
                        path: p.replace(/\\/g, '/'),
                        getText: () => zf.async('string')
                    });
                }
            });
        } else if (/\.(csv)$/i.test(f.name)) {
            const cleanPath = (f._p || f.webkitRelativePath || f.name).replace(/\\/g, '/');
            src.push({
                path: cleanPath,
                getText: f.text ? () => f.text() : () => new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(r.result);
                    r.onerror = rej;
                    r.readAsText(f);
                })
            });
        }
    }
    if (!src.length) {
        throw new Error('No valid CSV or ZIP files found. Please make sure you selected your official Letterboxd export file.');
    }
    return src;
}

function Landing({ onFiles, onLoadDemo, busy, error }) {
    const [dragover, setDragover] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileError, setFileError] = useState(null);
    const fileZipInput = useRef();
    const folderInput = useRef();

    const steps = [
        'Open letterboxd.com, head to your profile, and click on Settings.',
        'Go to the Data tab in the top settings menu.',
        'Click the green "Export your data" button.',
        'Drag & drop or select the downloaded .zip file here (no unzipping needed).'
    ];

    const processFiles = files => {
        setFileError(null);
        if (!files || !files.length) return;
        const valid = files.some(f => /\.(zip|csv)$/i.test(f.name));
        if (!valid) {
            setFileError('The file does not appear to be a valid Letterboxd export (.zip or .csv files).');
            return;
        }
        const zipFile = files.find(f => /\.zip$/i.test(f.name));
        if (zipFile) {
            setSelectedFile({
                name: zipFile.name,
                size: (zipFile.size / (1024 * 1024)).toFixed(2) + ' MB'
            });
        }
        onFiles(files);
    };

    return html`
        <div>
            <div class="landing-hero-backdrop"></div>

            <!-- Top Header -->
            <header class="site-header" style=${{ position: 'relative', zIndex: 10 }}>
                <div class="header-inner">
                    <span class="brand-logo">
                        <img src="media/logo.png" alt="LBXD" class="brand-logo-img" />
                        <span class="brand-badge">CINEMA</span>
                    </span>

                    <nav class="landing-nav-links">
                        <a href="#features" class="landing-nav-link" onClick=${e => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' }); }}>✦ Features</a>
                        <a href="#teasers" class="landing-nav-link" onClick=${e => { e.preventDefault(); document.getElementById('teasers')?.scrollIntoView({ behavior: 'smooth' }); }}>🎬 Preview</a>
                        <a href="#guide" class="landing-nav-link" onClick=${e => { e.preventDefault(); document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' }); }}>❓ Guide</a>
                    </nav>

                    <div class="header-actions">
                        <button class="landing-demo-btn" onClick=${onLoadDemo} title="Explore the application immediately with real sample movie data">
                            🍿 Load Demo
                        </button>
                    </div>
                </div>
            </header>

            <main class="landing-container">
                <!-- Hero Section -->
                <div class="landing-hero">
                    <div style=${{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 224, 84, 0.1)', border: '1px solid rgba(0, 224, 84, 0.3)', color: 'var(--g)', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                        ✦ Letterboxd Stats Generator
                    </div>

                    <div class="landing-logo-container">
                        <img src="media/logo.png" alt="LBXD — Stats Generator" class="landing-hero-logo" />
                    </div>
                    <div class="landing-subtitle"></div>

                    <p class="landing-tagline">
                        Your cinematic life analyzed with the visual atmosphere and precision of Letterboxd.
                        Discover your signature directors, recurring actors, series, and your annual GraphEd story.
                    </p>

                    <!-- Quick Demo Banner Callout -->
                    <div style=${{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', background: 'rgba(27, 34, 40, 0.9)', border: '1px solid var(--bd)', borderRadius: '12px', padding: '12px 18px', maxWidth: '520px', margin: '0 auto 28px' }}>
                        <span style=${{ fontSize: '18px' }}>🍿</span>
                        <div style=${{ textAlign: 'left', flex: 1, fontSize: '13px', color: 'var(--mut)' }}>
                            <strong style=${{ color: 'var(--tx)' }}>Want to see the app in action now?</strong>
                            <div>Explore all cinema statistics and GraphEd in 1 click.</div>
                        </div>
                        <button class="btn btn-primary btn-sm" onClick=${onLoadDemo}>
                            Try Demo →
                        </button>
                    </div>

                    <!-- Main Dropzone -->
                    <div
                        class=${`landing-dropzone ${dragover ? 'dragover' : ''} ${selectedFile ? 'has-file' : ''}`}
                        onClick=${() => fileZipInput.current && fileZipInput.current.click()}
                        onDragOver=${e => { e.preventDefault(); setDragover(true); }}
                        onDragLeave=${() => setDragover(false)}
                        onDrop=${async e => {
            e.preventDefault();
            setDragover(false);
            const files = await readEntries(e.dataTransfer);
            processFiles(files);
        }}
                    >
                        <div class="landing-drop-icon">${dragover ? '📥' : '🎬'}</div>
                        <div class="landing-drop-title">
                            ${busy
            ? busy
            : dragover
                ? 'Drop your Letterboxd export here!'
                : 'Drag & drop your Letterboxd ZIP file'}
                        </div>
                        <div class="landing-drop-desc">
                            ${busy
            ? 'Analyzing your movie data locally in your browser…'
            : 'or click here to select it from your device'}
                        </div>

                        ${selectedFile && !busy && html`
                            <div class="landing-file-badge">
                                <span>✓</span>
                                <span>${selectedFile.name} (${selectedFile.size})</span>
                            </div>
                        `}
                    </div>

                    <input ref=${fileZipInput} type="file" accept=".zip,.csv" multiple hidden onChange=${e => processFiles([...e.target.files])} />
                    <input ref=${folderInput} type="file" webkitdirectory="" multiple hidden onChange=${e => processFiles([...e.target.files])} />

                    <div style=${{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                        <button class="btn btn-primary btn-lg" onClick=${() => fileZipInput.current && fileZipInput.current.click()}>
                            📥 Select Letterboxd ZIP (.zip)
                        </button>
                        <button class="btn btn-ghost btn-lg" onClick=${() => folderInput.current && folderInput.current.click()}>
                            📁 Or select unzipped folder
                        </button>
                    </div>

                    <!-- Privacy Reassurance Banner -->
                    <div class="landing-privacy-banner">
                        <span class="icon">🔒</span>
                        <span><strong>100% Local & Private:</strong> Your files are analyzed exclusively in your browser. No viewing data is ever transmitted to external servers.</span>
                    </div>

                    ${(error || fileError) && html`
                        <div style=${{ background: 'rgba(255, 90, 95, 0.15)', border: '1px solid var(--red)', color: 'var(--red)', padding: '14px 20px', borderRadius: '10px', marginTop: '20px', fontSize: '14px' }}>
                            ⚠ ${fileError || error}
                        </div>
                    `}
                </div>

                <!-- 4 Pillars Section -->
                <section class="landing-features-grid" id="features">
                    <div class="feature-pill-card">
                        <div class="feature-pill-icon">📊</div>
                        <h3 class="feature-pill-title">Stats & Records</h3>
                        <p class="feature-pill-desc">
                            Total unique films, viewings, rewatches, personal rating averages, sacred movie days, and longest viewing streaks.
                        </p>
                    </div>

                    <div class="feature-pill-card">
                        <div class="feature-pill-icon">🎬</div>
                        <h3 class="feature-pill-title">Directors & Cast (TMDB)</h3>
                        <p class="feature-pill-desc">
                            High-resolution portraits of your most-watched directors and actors, complete filmographies, and star averages.
                        </p>
                    </div>

                    <div class="feature-pill-card">
                        <div class="feature-pill-icon">📺</div>
                        <h3 class="feature-pill-title">Series & Miniseries</h3>
                        <p class="feature-pill-desc">
                            Intelligent detection and sorting of TV shows and miniseries (Chernobyl, Twin Peaks, etc.) with seasons and episodes.
                        </p>
                    </div>

                    <div class="feature-pill-card">
                        <div class="feature-pill-icon">✨</div>
                        <h3 class="feature-pill-title">Annual GraphEd</h3>
                        <p class="feature-pill-desc">
                            Cinematic editorial slideshow featuring your Film of the Year, How It Started vs How It Ended, and viewing tempo.
                        </p>
                    </div>
                </section>

                <!-- Teaser Preview Section -->
                <section class="landing-teaser-section" id="teasers">
                    <div class="landing-teaser-header">
                        <span class="landing-teaser-badge">✦ Preview</span>
                        <h2 class="landing-teaser-title">Visual Showcase · What you will discover with your data</h2>
                        <p class="landing-teaser-sub">
                            A glimpse of the rich film cards, actors, and stats generated by LBXD once your data is imported.
                        </p>
                    </div>

                    <div class="landing-teaser-grid">
                        <!-- Card 1: Sample Director Spotlight -->
                        <div class="teaser-card">
                            <span class="teaser-card-tag">🎬 Director of the Year</span>
                            <div class="teaser-director-preview">
                                <div class="teaser-avatar">
                                    <img src="https://image.tmdb.org/t/p/w185/xuAIuYSmsUzKlUMBFGVZaWsY3DZ.jpg" alt="Christopher Nolan" style=${{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                </div>
                                <div>
                                    <div style=${{ fontWeight: 800, fontSize: '18px', color: 'var(--tx)' }}>Christopher Nolan</div>
                                    <div style=${{ color: 'var(--g)', fontSize: '13px', fontWeight: 600 }}>6 films · 4.8★ avg</div>
                                </div>
                            </div>
                            <div style=${{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                                <div style=${{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style=${{ aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--bd)', background: 'var(--surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                                        <img src="https://image.tmdb.org/t/p/w342/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg" alt="Inception" style=${{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                    </div>
                                    <div style=${{ fontSize: '11px', color: 'var(--tx)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Inception</div>
                                    <div style=${{ fontSize: '10px', color: 'var(--g)', textAlign: 'center' }}>★★★★★</div>
                                </div>
                                <div style=${{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style=${{ aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--bd)', background: 'var(--surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                                        <img src="https://image.tmdb.org/t/p/w342/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg" alt="Oppenheimer" style=${{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                    </div>
                                    <div style=${{ fontSize: '11px', color: 'var(--tx)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Oppenheimer</div>
                                    <div style=${{ fontSize: '10px', color: 'var(--g)', textAlign: 'center' }}>★★★★★</div>
                                </div>
                                <div style=${{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style=${{ aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--bd)', background: 'var(--surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                                        <img src="https://image.tmdb.org/t/p/w342/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg" alt="Interstellar (La Odisea)" style=${{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                    </div>
                                    <div style=${{ fontSize: '11px', color: 'var(--tx)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="Interstellar · La Odisea">Interstellar</div>
                                    <div style=${{ fontSize: '10px', color: 'var(--g)', textAlign: 'center' }}>★★★★★</div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 2: Sample Habits & Distribution -->
                        <div class="teaser-card">
                            <span class="teaser-card-tag">📊 Habits & Ratings</span>
                            <div>
                                <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--mut)', marginBottom: '4px' }}>
                                    <span>5 stars ★★★★★</span>
                                    <span style=${{ color: 'var(--g)', fontWeight: 700 }}>24%</span>
                                </div>
                                <div style=${{ background: '#202830', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                                    <div style=${{ background: 'var(--g)', width: '65%', height: '100%' }}></div>
                                </div>
                                <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--mut)', marginBottom: '4px' }}>
                                    <span>4 stars ★★★★☆</span>
                                    <span style=${{ color: 'var(--g)', fontWeight: 700 }}>42%</span>
                                </div>
                                <div style=${{ background: '#202830', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style=${{ background: 'var(--g)', width: '85%', height: '100%' }}></div>
                                </div>
                            </div>
                            <div style=${{ fontSize: '13px', color: 'var(--tx)', borderTop: '1px solid var(--bd)', paddingTop: '10px' }}>
                                <span style=${{ color: 'var(--g)', fontWeight: 700 }}>Favorite day:</span> Sundays · <span style=${{ color: 'var(--g)', fontWeight: 700 }}>Record streak:</span> 8 consecutive days
                            </div>
                        </div>

                        <!-- Card 3: Sample GraphEd Annual -->
                        <div class="teaser-card">
                            <span class="teaser-card-tag">✨ GraphEd Story Mode</span>
                            <div style=${{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 800, color: 'var(--tx)' }}>
                                Your Year in Cinema in Slides
                            </div>
                            <p style=${{ fontSize: '13px', color: 'var(--mut)', lineHeight: 1.5, margin: 0 }}>
                                Interactive cinematic presentation featuring your Film of the Year, most-watched directors with TMDB portraits, how it started vs ended, and tempo analysis.
                            </p>
                            <div style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--g)', fontSize: '12.5px', fontWeight: 700, marginTop: 'auto', cursor: 'pointer' }} onClick=${onLoadDemo}>
                                <span>View interactive demo now →</span>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 4 Steps Guide -->
                <div class="poster-shelf-header" id="guide" style=${{ justifyContent: 'center', textAlign: 'center', margin: '48px 0 20px' }}>
                    <h2 class="poster-shelf-title" style=${{ fontSize: '24px' }}>How to get your Letterboxd export file</h2>
                </div>

                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', maxWidth: '1000px', margin: '0 auto 40px' }}>
                    ${steps.map((st, i) => html`
                        <div class="card" key=${i} style=${{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px' }}>
                            <div style=${{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--g)', color: '#0A170E', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>
                                ${i + 1}
                            </div>
                            <p style=${{ color: 'var(--mut)', fontSize: '13.5px', margin: 0, lineHeight: 1.45 }}>${st}</p>
                        </div>
                    `)}
                </div>
            </main>

            <${Footer} setTab=${() => { }} />
        </div>
    `;
}

function Diagnostic({ M, onGo, onBack }) {
    const c = M.diag.counts;

    return html`
        <div>
            <header class="site-header">
                <div class="header-inner">
                    <span class="brand-logo">
                        <img src="media/logo.png" alt="LBXD" class="brand-logo-img" />
                        <span class="brand-badge">SUMMARY</span>
                    </span>
                </div>
            </header>

            <main class="wrap" style=${{ padding: '40px 24px 64px' }}>
                <div class="poster-shelf-header" style=${{ marginBottom: '20px' }}>
                    <div>
                        <h2 class="poster-shelf-title" style=${{ fontSize: '26px' }}>Data successfully imported</h2>
                        <div style=${{ color: 'var(--mut)', fontSize: '14px', marginTop: '2px' }}>
                            ${M.profile.user ? `@${M.profile.user}'s profile · ` : ''}
                            Official Letterboxd files parsed locally
                        </div>
                    </div>
                </div>

                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', margin: '20px 0' }}>
                    <div class="stat-card">
                        <div class="stat-value">${c.films}</div>
                        <div class="stat-label">Unique Titles</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${c.entries}</div>
                        <div class="stat-label">Logged Viewings</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${c.rewatches}</div>
                        <div class="stat-label">Rewatches</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${c.rated}</div>
                        <div class="stat-label">Rated Titles</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${c.dated}</div>
                        <div class="stat-label">Dated Entries</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${c.watchlist}</div>
                        <div class="stat-label">In Watchlist</div>
                    </div>
                </div>

                ${M.diag.warnings && M.diag.warnings.length > 0 && html`
                    <div style=${{ margin: '20px 0' }}>
                        ${M.diag.warnings.map((w, i) => html`
                            <div key=${i} style=${{ background: 'rgba(255, 128, 0, 0.1)', border: '1px solid var(--o)', color: 'var(--o)', padding: '10px 16px', borderRadius: '8px', marginBottom: '8px', fontSize: '13.5px' }}>
                                ⚠ ${w}
                            </div>
                        `)}
                    </div>
                `}

                <div style=${{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                    <button class="btn btn-primary btn-lg" onClick=${onGo}>
                        Enter Dashboard →
                    </button>
                    <button class="btn btn-ghost btn-lg" onClick=${onBack}>
                        Import another file
                    </button>
                </div>
            </main>

            <${Footer} setTab=${() => { }} />
        </div>
    `;
}

/* ==========================================================================
   Main Application Entry Point
   ========================================================================== */

function App() {
    const [st, setSt] = useState({ phase: 'land', M: null, initialMeta: {}, err: '', busy: '', progress: null });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('lbxd_theme', 'dark');
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, []);

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        });
    }, [st.phase]);

    const handleFiles = async files => {
        if (!files || !files.length) return;
        setSt(s => ({ ...s, err: '', busy: 'Decompressing Letterboxd export…', progress: 15 }));
        try {
            const src = await toSources(files);
            setSt(s => ({ ...s, busy: 'Analyzing diary, ratings, and filmographies…', progress: 35 }));
            const M = await buildModel(src, m => setSt(s => ({ ...s, busy: m, progress: 45 })));

            // Pre-enrich all key films so the dashboard opens 100% READY with zero pop-in and zero number jumps
            const watchedFilms = M.films.filter(f => f.watched);
            const priorityKeys = new Set();

            // Priority order:
            // 1. All diary entries
            M.entries.forEach(e => priorityKeys.add(e.key));
            // 2. High rated films (5.0, 4.5, 4.0, etc.)
            watchedFilms.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).forEach(f => priorityKeys.add(f.key));
            // 3. Any favorites
            watchedFilms.filter(f => f.liked).forEach(f => priorityKeys.add(f.key));
            // 4. Any remaining watched films
            watchedFilms.forEach(f => priorityKeys.add(f.key));
            (M.profile.favoriteFilms || []).forEach(f => priorityKeys.add(f.key));

            const favoriteKeys = new Set((M.profile.favoriteFilms || []).map(f => f.key));
            const filmsToEnrich = watchedFilms
                .slice()
                .sort((a, b) => Number(favoriteKeys.has(b.key)) - Number(favoriteKeys.has(a.key)))
                .filter(f => priorityKeys.has(f.key))
                .slice(0, 120);
            let initialMeta = {};

            if (filmsToEnrich.length) {
                setSt(s => ({ ...s, busy: `Connecting to TMDB to fetch posters and metadata (0/${filmsToEnrich.length})…`, progress: 35 }));

                await new Promise(resolve => {
                    let resolved = false;
                    const timer = setTimeout(() => {
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                    }, 12000);

                    enrichTMDB(filmsToEnrich, TMDB_KEY, (done, metaBatch) => {
                        initialMeta = metaBatch;
                        const pct = Math.min(94, 35 + Math.round((done / filmsToEnrich.length) * 59));
                        setSt(s => ({
                            ...s,
                            progress: pct,
                            busy: `Downloading posters and metadata (${done}/${filmsToEnrich.length})…`
                        }));
                        if (done >= filmsToEnrich.length && !resolved) {
                            resolved = true;
                            clearTimeout(timer);
                            resolve();
                        }
                    }).catch(() => {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timer);
                            resolve();
                        }
                    });
                });

                // Apply initial metadata directly onto M.films so M starts 100% enriched
                M.films.forEach(f => {
                    if (initialMeta[f.key]) {
                        Object.assign(f, initialMeta[f.key]);
                    }
                });

                // Pre-decode only a few posters; the rest load lazily in the dashboard.
                const postersToPreload = Object.values(initialMeta)
                    .map(m => m.poster)
                    .filter(Boolean)
                    .slice(0, 8);
                if (typeof preloadImage === 'function') {
                    Promise.all(postersToPreload.map(p => preloadImage(p, 700))).catch(() => {});
                }
            }

            setSt(s => ({ ...s, busy: 'Generating cinema statistics and your dashboard experience…', progress: 100 }));
            await new Promise(r => setTimeout(r, 400));

            // Direct entrance into the dashboard with initialMeta loaded!
            setSt({ phase: 'dash', M, initialMeta, err: '', busy: '', progress: 100 });
        } catch (e) {
            setSt({ phase: 'land', M: null, initialMeta: {}, err: e.message || String(e), busy: '', progress: null });
        }
    };

    const handleLoadDemo = useCallback(() => {
        setSt(s => ({ ...s, busy: 'Preparing demo movie dataset…', progress: 50 }));
        setTimeout(() => {
            const demoM = createDemoData();
            setSt({ phase: 'dash', M: demoM, initialMeta: {}, err: '', busy: '', progress: 100 });
        }, 300);
    }, []);

    const clear = useCallback(() => {
        setSt({ phase: 'land', M: null, initialMeta: {}, err: '', busy: '', progress: null });
    }, []);

    if (st.busy) {
        return html`<${SplashScreen} busyText=${st.busy} progress=${st.progress} />`;
    }

    if (st.phase === 'diag') {
        return html`<${Diagnostic} M=${st.M} onGo=${() => setSt(s => ({ ...s, phase: 'dash' }))} onBack=${clear} />`;
    }

    if (st.phase === 'dash') {
        return html`<${Dashboard} M0=${st.M} initialMeta=${st.initialMeta} onClear=${clear} />`;
    }

    return html`<${Landing} onFiles=${handleFiles} onLoadDemo=${handleLoadDemo} busy=${st.busy} error=${st.err} />`;
}

if (typeof document !== 'undefined' && document.getElementById('root')) {
    ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
}
