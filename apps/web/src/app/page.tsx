import { FLAG_REGISTRY, FLAG_KEYS, type FlagValues } from '@linestepper/shared';

async function loadFlags(): Promise<FlagValues | null> {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (!api) return null;
  try {
    const res = await fetch(`${api}/flags`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { flags: FlagValues }).flags : null;
  } catch {
    return null;
  }
}

/** Placeholder home for the creator dashboard and admin back office. Shows live flag state from the API. */
export default async function Home() {
  const flags = await loadFlags();
  return (
    <main>
      <h1>LineUp2Step Dashboard</h1>
      <p>Creator tools and the admin back office will live here.</p>
      <h2>Feature flags {flags ? '(live from API)' : '(API unreachable — showing defaults)'}</h2>
      <table cellPadding={6}>
        <tbody>
          {FLAG_KEYS.map((key) => (
            <tr key={key}>
              <td><code>{key}</code></td>
              <td>{(flags?.[key] ?? FLAG_REGISTRY[key].default) ? 'On' : 'Off'}</td>
              <td>{FLAG_REGISTRY[key].description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
