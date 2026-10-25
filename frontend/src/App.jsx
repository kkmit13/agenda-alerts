import { useEffect, useMemo, useState } from "react";

const API = "";

const KIND_LABEL = {
  city: "City / town council",
  school: "School board",
  county: "County government",
};

const CATEGORIES = [
  "all",
  "tax_rate",
  "budget",
  "zoning",
  "contract",
  "school_policy",
  "personnel",
  "other",
];

const EXAMPLES = [
  "16327 Lakeview Dr, Jersey Village, TX 77040",
  "600 4th Ave, Seattle, WA 98104",
  "121 N LaSalle St, Chicago, IL 60602",
];

function prettyCategory(cat) {
  return cat === "all" ? "All" : cat.replaceAll("_", " ");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isUpcoming(iso) {
  if (!iso) return false;
  return new Date(iso + "T23:59:59") >= new Date();
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    throw new Error(data?.detail || "Something went wrong. Please try again.");
  }
  return data;
}

/* ───────────────────────── Search ───────────────────────── */

function SearchForm({ initial = "", onSearch, onLocate, busy, compact }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  return (
    <form
      className={`search-form ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
    >
      <label className="sr-only" htmlFor="address">
        Street address
      </label>
      <input
        id="address"
        className="search-input"
        type="text"
        autoComplete="street-address"
        placeholder="Street address, city, state"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
      />
      <button className="search-btn" type="submit" disabled={busy || !value.trim()}>
        {busy ? "Looking up…" : "Search"}
      </button>
      {!compact && "geolocation" in navigator && (
        <button
          type="button"
          className="locate-btn"
          onClick={onLocate}
          disabled={busy}
        >
          <span aria-hidden="true">◎</span> Use my location
        </button>
      )}
    </form>
  );
}

/* ───────────────────────── Items ───────────────────────── */

function ItemCard({ item }) {
  return (
    <article className="item">
      <div className="item-meta">
        <span className={`item-cat cat-${item.category}`}>
          {prettyCategory(item.category)}
        </span>
        {item.action_required && <span className="item-vote">Vote</span>}
        {item.item_number && (
          <span className="item-num">Item {item.item_number}</span>
        )}
      </div>
      {item.title_original && (
        <p className="item-title">{item.title_original}</p>
      )}
      <p className="item-summary">{item.plain_summary}</p>
      {item.amounts?.length > 0 && (
        <div className="item-amounts">
          {item.amounts.map((amt, i) => (
            <span key={i} className="amount-tag">
              {amt}
            </span>
          ))}
        </div>
      )}
      <div className="item-foot">
        {item.verified ? (
          <span className="item-verified">✓ Numbers checked against the agenda</span>
        ) : (
          <span className="item-unverified">
            Not yet checked against the original. Confirm in the agenda.
          </span>
        )}
        {item.source_url && (
          <a className="source-link" href={item.source_url} target="_blank" rel="noreferrer">
            Original agenda ↗
          </a>
        )}
      </div>
    </article>
  );
}

function Searching({ name }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="searching" role="status">
      <div className="spinner" aria-hidden="true" />
      <div>
        <div className="searching-head">Finding the latest {name} agenda…</div>
        <div className="searching-body">
          We are searching official sources and translating it into plain English.
          This usually takes 20 to 60 seconds{seconds > 5 ? ` (${seconds}s)` : ""}.
        </div>
      </div>
    </div>
  );
}

function BodyCard({ body, state, filter, onRetry }) {
  const items = (state.items ?? body.items ?? []).filter(
    (i) => filter === "all" || i.category === filter,
  );
  const allItems = state.items ?? body.items ?? [];
  const dates = [...new Set(allItems.map((i) => i.meeting_date).filter(Boolean))];
  const sourceUrl = state.agenda_url || state.portal_url || body.source_url;

  return (
    <section className={`body-card kind-${body.kind}`}>
      <header className="body-head">
        <div>
          <div className="body-kind">{KIND_LABEL[body.kind]}</div>
          <h3 className="body-name">{state.governing_body || body.display_name}</h3>
        </div>
        {dates[0] && (
          <div className={`meeting-pill ${isUpcoming(dates[0]) ? "upcoming" : ""}`}>
            {isUpcoming(dates[0]) ? "Upcoming" : "Met"} {formatDate(dates[0])}
          </div>
        )}
      </header>

      {state.status === "loading" && <Searching name={body.display_name} />}

      {state.status === "error" && (
        <div className="body-empty">
          <p>{state.message || "We couldn't load this agenda right now."}</p>
          <button className="link-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {state.status !== "loading" && allItems.length === 0 && state.status !== "error" && (
        <div className="body-empty">
          <p>
            We couldn't find a recent agenda for {body.display_name}.
            {sourceUrl ? " You can check their agenda page directly." : ""}
          </p>
          {sourceUrl && (
            <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
              Agenda page ↗
            </a>
          )}
        </div>
      )}

      {allItems.length > 0 && items.length === 0 && (
        <p className="body-empty">Nothing in this category.</p>
      )}

      {items.length > 0 && (
        <div className="feed">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── Tax ───────────────────────── */

function TaxCalculator({ hasCfisd }) {
  const [mode, setMode] = useState(hasCfisd ? "cfisd" : "custom");
  const [homeValue, setHomeValue] = useState("");
  const [over65, setOver65] = useState(false);
  const [exemption, setExemption] = useState("");
  const [currentRate, setCurrentRate] = useState("");
  const [proposedRate, setProposedRate] = useState("");
  const [unit, setUnit] = useState("per100");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMode(hasCfisd ? "cfisd" : "custom"), [hasCfisd]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = { home_value: parseFloat(homeValue), over_65: over65 };
    if (mode === "custom") {
      payload.current_rate = parseFloat(currentRate);
      payload.proposed_rate = parseFloat(proposedRate);
      payload.exemption = exemption ? parseFloat(exemption) : 0;
      payload.rate_unit = unit;
    }
    try {
      setResult(
        await getJson(`${API}/api/tax-impact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const money = (n) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const canSubmit =
    homeValue && (mode === "cfisd" || (currentRate !== "" && proposedRate !== ""));

  return (
    <section className="tax-section">
      <h2 className="section-title">What does a tax vote cost you?</h2>
      <p className="tax-intro">
        When a board votes on a tax rate, plug the old and new rates in from the
        agenda to see the change in your yearly bill.
      </p>

      {hasCfisd && (
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "cfisd"}
            className={mode === "cfisd" ? "active" : ""}
            onClick={() => setMode("cfisd")}
          >
            CFISD 2024 → 2025
          </button>
          <button
            role="tab"
            aria-selected={mode === "custom"}
            className={mode === "custom" ? "active" : ""}
            onClick={() => setMode("custom")}
          >
            Enter my own rates
          </button>
        </div>
      )}

      <form className="tax-form" onSubmit={submit}>
        <div className="tax-grid-inputs">
          <label className="tax-label">
            Home appraised value ($)
            <input
              className="tax-input"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="300000"
              value={homeValue}
              onChange={(e) => setHomeValue(e.target.value)}
            />
          </label>

          {mode === "custom" ? (
            <>
              <label className="tax-label">
                Exemptions ($)
                <input
                  className="tax-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={exemption}
                  onChange={(e) => setExemption(e.target.value)}
                />
              </label>
              <label className="tax-label">
                Current rate
                <input
                  className="tax-input"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="1.0869"
                  value={currentRate}
                  onChange={(e) => setCurrentRate(e.target.value)}
                />
              </label>
              <label className="tax-label">
                Proposed rate
                <input
                  className="tax-input"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="1.0669"
                  value={proposedRate}
                  onChange={(e) => setProposedRate(e.target.value)}
                />
              </label>
              <label className="tax-label">
                Rate is written as
                <select className="tax-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="per100">$ per $100 of value (Texas)</option>
                  <option value="mills">Mills ($ per $1,000)</option>
                  <option value="percent">Percent of value</option>
                </select>
              </label>
            </>
          ) : (
            <label className="tax-check-label">
              <input
                type="checkbox"
                checked={over65}
                onChange={(e) => setOver65(e.target.checked)}
              />
              Over 65 or disabled
            </label>
          )}
        </div>
        <button className="tax-btn" type="submit" disabled={busy || !canSubmit}>
          {busy ? "Calculating…" : "Calculate my bill"}
        </button>
      </form>

      {error && <p className="error-msg">{error}</p>}

      {result && (
        <div className="tax-result">
          <div className="tax-grid">
            <div className="tax-cell">
              <div className="tax-cell-label">Taxable value</div>
              <div className="tax-cell-value">{money(result.taxable_value)}</div>
            </div>
            <div className="tax-cell">
              <div className="tax-cell-label">{result.label_current} bill</div>
              <div className="tax-cell-value">{money(result.current_bill)}</div>
            </div>
            <div className="tax-cell">
              <div className="tax-cell-label">{result.label_proposed} bill</div>
              <div className="tax-cell-value">{money(result.proposed_bill)}</div>
            </div>
            <div className="tax-cell">
              <div className="tax-cell-label">Change per year</div>
              <div
                className={`tax-cell-value ${result.difference <= 0 ? "positive" : "negative"}`}
              >
                {result.difference <= 0 ? "−" : "+"}
                {money(Math.abs(result.difference))}
              </div>
            </div>
          </div>
          <p className="tax-note">{result.note}</p>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── App ───────────────────────── */

export default function App() {
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") || "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState(null);
  const [agendas, setAgendas] = useState({});
  const [filter, setFilter] = useState("all");

  function discover(body) {
    setAgendas((a) => ({ ...a, [body.key]: { status: "loading" } }));
    getJson(`${API}/api/agenda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: body.kind,
        name: body.name,
        display_name: body.display_name,
        state: body.state,
        state_name: body.state_name,
        token: body.token,
      }),
    })
      .then((data) => {
        // Keep older stored items if the new search came back empty
        if (!data.items.length && body.items?.length) {
          setAgendas((a) => ({ ...a, [body.key]: { status: "ok" } }));
        } else {
          setAgendas((a) => ({ ...a, [body.key]: data }));
        }
      })
      .catch((err) =>
        setAgendas((a) => ({
          ...a,
          [body.key]: body.items?.length ? { status: "ok" } : { status: "error", message: err.message },
        })),
      );
  }

  async function runLookup(params, label) {
    setBusy(true);
    setError("");
    setFilter("all");
    try {
      const data = await getJson(`${API}/api/lookup?${new URLSearchParams(params)}`);
      if (!data.found) {
        setError(data.reason);
        setLookup(null);
        return;
      }
      setLookup({ ...data, label: data.matched_address || label });
      setAgendas({});
      data.bodies.filter((b) => b.needs_discovery).forEach(discover);
      if (params.address) {
        const url = new URL(window.location);
        if (url.searchParams.get("q") !== params.address) {
          url.searchParams.set("q", params.address);
          window.history.pushState({}, "", url);
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function search(address) {
    setQuery(address);
    runLookup({ address }, address);
  }

  function locate() {
    setError("");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        runLookup(
          { lat: pos.coords.latitude.toFixed(5), lon: pos.coords.longitude.toFixed(5) },
          "your current location",
        ),
      () => {
        setBusy(false);
        setError("We couldn't get your location. Type your address instead.");
      },
      { timeout: 10000 },
    );
  }

  function reset() {
    setLookup(null);
    setAgendas({});
    setError("");
    const url = new URL(window.location);
    url.searchParams.delete("q");
    window.history.pushState({}, "", url);
  }

  // Load a shared link like ?q=600 4th Ave Seattle WA
  useEffect(() => {
    if (query) runLookup({ address: query }, query);
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) search(q);
      else {
        setLookup(null);
        setAgendas({});
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodies = lookup?.bodies ?? [];
  const allItems = useMemo(
    () => bodies.flatMap((b) => agendas[b.key]?.items ?? b.items ?? []),
    [bodies, agendas],
  );
  const counts = useMemo(() => {
    const c = { all: allItems.length };
    allItems.forEach((i) => (c[i.category] = (c[i.category] || 0) + 1));
    return c;
  }, [allItems]);
  const hasCfisd = bodies.some((b) => b.body_name === "Cypress-Fairbanks ISD");

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <button className="logo" onClick={reset}>
            Agenda Alerts
          </button>
          <div className="tagline">Local government, in plain English.</div>
        </div>
      </header>

      {!lookup && (
        <main className="main">
          <section className="hero">
            <div className="hero-badge">Now covering every US address</div>
            <h1 className="hero-title">
              What is your local government about to decide?
            </h1>
            <p className="hero-sub">
              Enter your address. We find your city council, school board and
              county, pull their latest agendas, and explain each decision in
              plain English with a link to the original.
            </p>
            <SearchForm initial={query} onSearch={search} onLocate={locate} busy={busy} />
            {error && <p className="error-msg">{error}</p>}
            <div className="examples">
              <span>Try:</span>
              {EXAMPLES.map((addr) => (
                <button key={addr} className="example-btn" onClick={() => search(addr)} disabled={busy}>
                  {addr.split(",").slice(1, 3).join(",").trim()}
                </button>
              ))}
            </div>
          </section>

          <section className="how-it-works">
            <h2 className="section-title">How it works</h2>
            <ol className="steps">
              <li className="step">
                <div className="step-num">1</div>
                <div>
                  <div className="step-head">Enter your address</div>
                  <div className="step-body">
                    We use the US Census to find exactly which city, school
                    district and county serve you.
                  </div>
                </div>
              </li>
              <li className="step">
                <div className="step-num">2</div>
                <div>
                  <div className="step-head">See what is on the agenda</div>
                  <div className="step-body">
                    We find each board's latest official agenda and explain the
                    items that matter, in plain English.
                  </div>
                </div>
              </li>
              <li className="step">
                <div className="step-num">3</div>
                <div>
                  <div className="step-head">Check it yourself</div>
                  <div className="step-body">
                    Every dollar figure is checked against the real document,
                    and every item links to the original agenda.
                  </div>
                </div>
              </li>
            </ol>
          </section>
        </main>
      )}

      {lookup && (
        <main className="main">
          <div className="results-bar">
            <div className="results-address">
              <div className="results-label">Showing decisions for</div>
              <div className="address-text">{lookup.label}</div>
            </div>
            <SearchForm compact initial="" onSearch={search} busy={busy} />
          </div>
          {error && <p className="error-msg">{error}</p>}

          {allItems.length > 0 && (
            <div className="filter-row" aria-label="Filter by topic">
              {CATEGORIES.filter((c) => c === "all" || counts[c]).map((cat) => (
                <button
                  key={cat}
                  className={`filter-btn ${filter === cat ? "active" : ""}`}
                  aria-pressed={filter === cat}
                  onClick={() => setFilter(cat)}
                >
                  {prettyCategory(cat)} <span className="count">{counts[cat] || 0}</span>
                </button>
              ))}
            </div>
          )}

          <div className="bodies">
            {bodies.map((body) => (
              <BodyCard
                key={body.key}
                body={body}
                state={agendas[body.key] ?? {}}
                filter={filter}
                onRetry={() => discover(body)}
              />
            ))}
          </div>

          <TaxCalculator hasCfisd={hasCfisd} />
        </main>
      )}

      <footer className="footer">
        <div className="footer-inner">
          <p>
            Summaries are written with AI and checked against the source
            documents. They are for information only. Always confirm details in
            the original agenda.
          </p>
          <p className="footer-built">Built for the 2026 Congressional App Challenge.</p>
        </div>
      </footer>
    </div>
  );
}
