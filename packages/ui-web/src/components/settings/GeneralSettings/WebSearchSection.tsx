import type { ChangeEvent } from "react";
import { useAppStore } from "@kotys/core";

const DEFAULT_SEARXNG_URL = "http://127.0.0.1:9888";

const PROVIDERS = [
  { value: "ollama", label: "Ollama Cloud" },
  { value: "searxng", label: "SearXNG (self-hosted)" },
] as const;

export function WebSearchSection() {
  const { webSearchProvider, searxngUrl, setWebSearchProvider, setSearxngUrl } =
    useAppStore();

  const handleProviderChange = (e: ChangeEvent<HTMLSelectElement>) =>
    void setWebSearchProvider(
      e.target.value === "searxng" ? "searxng" : "ollama",
    );

  const handleSearxngUrlChange = (e: ChangeEvent<HTMLInputElement>) =>
    void setSearxngUrl(e.target.value);

  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold mb-1">Web search</h2>
      <p className="text-xs text-text-muted mb-4">
        Provider for the model&apos;s web_search and web_fetch tools.
      </p>

      <label
        htmlFor="web-search-provider"
        className="block text-xs text-text-muted mb-1.5"
      >
        Provider
      </label>
      <select
        id="web-search-provider"
        value={webSearchProvider}
        onChange={handleProviderChange}
        aria-label="Web search provider"
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
      >
        {PROVIDERS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <div
        className={
          webSearchProvider === "searxng" ? "" : "opacity-50 pointer-events-none"
        }
      >
        <label
          htmlFor="searxng-url-input"
          className="block text-xs text-text-muted mb-1.5 mt-4"
        >
          SearXNG URL
        </label>
        <input
          id="searxng-url-input"
          type="text"
          value={searxngUrl}
          onChange={handleSearxngUrlChange}
          placeholder={DEFAULT_SEARXNG_URL}
          aria-label="SearXNG instance URL"
          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent font-mono"
        />
        <p className="text-xs text-text-muted mt-1.5">
          Your SearXNG instance needs{" "}
          <span className="font-mono">search.formats: [html, json]</span> and{" "}
          <span className="font-mono">server.limiter: false</span> in its
          settings to serve the API.
        </p>
      </div>
    </section>
  );
}