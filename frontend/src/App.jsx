import { useState } from "react";

const API = "";

// Turns "_09152026-416.pdf" or "2026-09-15" into "09/15/2026"
function formatDate(raw) {
  if (!raw) return "";
  const s = String(raw);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  m = s.match(/^_(\d{2})(\d{2})(\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return "";
}

// Sortable key like "20260915" so newest items can come first
function dateKey(raw) {
  const s = formatDate(raw);
  if (!s) return "";
  const [mm, dd, yyyy] = s.split("/");
  return yyyy + mm + dd;
}

function parseAmounts(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [view, setView] = useState("home");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const [homeValue, setHomeValue] = useState("");
  const [over65, setOver65] = useState(false);
  const [taxResult, setTaxResult] = useState(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  async function handleSearch(e) {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API}/api/lookup?address=${encodeURIComponent(address)}`,
      );
      const data = await res.json();
      setResults(data);
      setView(data.covered ? "results" : "notcovered");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTax(e) {
    e.preventDefault();
    if (!homeValue) return;
    setTaxLoading(true);
    try {
      const res = await fetch(`${API}/api/tax-impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_value: parseFloat(homeValue),
          over_65: over65,
        }),
      });
      const data = await res.json();
      setTaxResult(data);
    } catch {
      setTaxResult(null);
    } finally {
      setTaxLoading(false);
    }
  }

  const categories = [
    "all",
    "budget",
    "contract",
    "zoning",
    "school_policy",
    "tax_rate",
    "personnel",
    "other",
  ];

  const allItems = (results?.items ?? []).filter((item) => item.plain_summary);

  const filteredItems = allItems
    .filter((item) => filter === "all" || item.category === filter)
    .sort((a, b) =>
      dateKey(b.meeting_date).localeCompare(dateKey(a.meeting_date)),
    );

  const exampleAddresses = ["16327 Lakeview Dr, Jersey Village TX 77040"];

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">LocalLens</div>
          <div className="tagline">Local government, made simple.</div>
        </div>
      </header>

      {view === "home" && (
        <main className="main">
          <section className="hero">
            <h1 className="hero-title">
              What's being decided
              <br />
              in your community?
            </h1>
            <p className="hero-sub">
              Enter your address to see what your city council is deciding and
              what your school taxes cost, explained in plain English.
            </p>
            <form className="search-form" onSubmit={handleSearch}>
              <input
                className="search-input"
                type="text"
                placeholder="e.g. 16327 Lakeview Dr, Jersey Village TX"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loading}
              />
              <button className="search-btn" type="submit" disabled={loading}>
                {loading ? "Searching..." : "Search"}
              </button>
            </form>
            {error && <p className="error-msg">{error}</p>}
            <p className="coverage-note">
              Currently covers <strong>Jersey Village City Council</strong>{" "}
              agendas and <strong>Cypress-Fairbanks ISD</strong> school tax
              estimates.
            </p>
          </section>

          <section className="how-it-works">
            <h2 className="section-title">How it works</h2>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <div>
                  <div className="step-head">Enter your address</div>
                  <div className="step-body">
                    We find which city and school district you live in.
                  </div>
                </div>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <div>
                  <div className="step-head">See what is on the agenda</div>
                  <div className="step-body">
                    City council decisions, explained in plain English and
                    checked against the original documents.
                  </div>
                </div>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <div>
                  <div className="step-head">Know what it costs you</div>
                  <div className="step-body">
                    See how the latest school tax rate change affects your
                    household.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {view === "notcovered" && (
        <main className="main">
          <div className="not-covered">
            <h2 className="nc-title">We do not cover that area yet</h2>
            <p className="nc-body">
              LocalLens currently covers{" "}
              <strong>Jersey Village City Council</strong> agendas and{" "}
              <strong>Cypress-Fairbanks ISD</strong> school tax estimates. We
              are working on expanding to more communities.
            </p>
            <p className="nc-body">Try this address to see a demo:</p>
            <div className="example-addresses">
              {exampleAddresses.map((addr) => (
                <button
                  key={addr}
                  className="example-btn"
                  onClick={() => {
                    setAddress(addr);
                    setView("home");
                  }}
                >
                  {addr}
                </button>
              ))}
            </div>
            <button
              className="back-btn"
              onClick={() => {
                setView("home");
                setAddress("");
              }}
            >
              Search a different address
            </button>
          </div>
        </main>
      )}

      {view === "results" && results && (
        <main className="main">
          <div className="results-header">
            <div className="results-address">
              Results for <span className="address-text">{address}</span>
            </div>
            <button
              className="change-btn"
              onClick={() => {
                setView("home");
                setResults(null);
                setTaxResult(null);
              }}
            >
              Change address
            </button>
          </div>

          <div className="coverage-tags">
            {results.city && (
              <span className="tag tag-city">{results.city}</span>
            )}
            {results.isd && <span className="tag tag-isd">{results.isd}</span>}
          </div>

          <section className="feed-section">
            <div className="feed-header">
              <h2 className="section-title">Agenda items</h2>
              {allItems.length > 0 && (
                <div className="filter-row">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`filter-btn ${filter === cat ? "active" : ""}`}
                      onClick={() => setFilter(cat)}
                    >
                      {cat === "all" ? "All" : cat.replace("_", " ")}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {allItems.length === 0 ? (
              <p className="empty-msg">
                No city council agenda items for this address yet. School board
                agendas are coming soon. The school tax estimate below works for
                Cypress-Fairbanks ISD addresses.
              </p>
            ) : filteredItems.length === 0 ? (
              <p className="empty-msg">No items found for this filter.</p>
            ) : (
              <div className="feed">
                {filteredItems.map((item) => (
                  <div className="item" key={item.id}>
                    <div className="item-meta">
                      <span className={`item-cat cat-${item.category}`}>
                        {item.category?.replace("_", " ")}
                      </span>
                      {item.action_required && (
                        <span className="item-vote">Vote</span>
                      )}
                      <span className="item-date">
                        {formatDate(item.meeting_date)}
                      </span>
                    </div>
                    <p className="item-summary">{item.plain_summary}</p>
                    {parseAmounts(item.amounts).length > 0 && (
                      <div className="item-amounts">
                        {parseAmounts(item.amounts).map((amt, i) => (
                          <span key={i} className="amount-tag">
                            {amt}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.verified && (
                      <div className="item-verified">
                        Verified against source
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="tax-section">
            <h2 className="section-title">What does this cost you?</h2>
            <p className="tax-intro">
              Estimate the impact of CFISD's latest tax rate change on your
              household. School tax only, does not include city, county, or
              other taxing units.
            </p>
            <form className="tax-form" onSubmit={handleTax}>
              <div className="tax-row">
                <label className="tax-label">
                  Home appraised value
                  <input
                    className="tax-input"
                    type="number"
                    placeholder="e.g. 300000"
                    value={homeValue}
                    onChange={(e) => setHomeValue(e.target.value)}
                  />
                </label>
                <label className="tax-check-label">
                  <input
                    type="checkbox"
                    checked={over65}
                    onChange={(e) => setOver65(e.target.checked)}
                  />
                  Over 65 or disabled
                </label>
              </div>
              <button className="tax-btn" type="submit" disabled={taxLoading}>
                {taxLoading ? "Calculating..." : "Calculate my bill"}
              </button>
            </form>

            {taxResult && (
              <div className="tax-result">
                <div className="tax-grid">
                  <div className="tax-cell">
                    <div className="tax-cell-label">Taxable value</div>
                    <div className="tax-cell-value">
                      ${taxResult.taxable_value.toLocaleString()}
                    </div>
                  </div>
                  <div className="tax-cell">
                    <div className="tax-cell-label">2024 bill</div>
                    <div className="tax-cell-value">
                      ${taxResult.current_bill.toLocaleString()}
                    </div>
                  </div>
                  <div className="tax-cell">
                    <div className="tax-cell-label">2025 bill</div>
                    <div className="tax-cell-value">
                      ${taxResult.proposed_bill.toLocaleString()}
                    </div>
                  </div>
                  <div className="tax-cell">
                    <div className="tax-cell-label">Difference</div>
                    <div
                      className={`tax-cell-value ${taxResult.difference < 0 ? "positive" : "negative"}`}
                    >
                      {taxResult.difference < 0 ? "-" : "+"}$
                      {Math.abs(taxResult.difference).toLocaleString()} / year
                    </div>
                  </div>
                </div>
                <p className="tax-note">{taxResult.note}</p>
              </div>
            )}
          </section>
        </main>
      )}

      <footer className="footer">
        <div className="footer-inner">
          <p>
            LocalLens covers Jersey Village City Council agendas and
            Cypress-Fairbanks ISD school tax estimates. Summaries are checked
            against the source documents and are for informational purposes
            only.
          </p>
          <p className="footer-built">
            Built for the 2026 Congressional App Challenge.
          </p>
        </div>
      </footer>
    </div>
  );
}
