// If something goes wrong while the page draws, say what, rather than leaving a blank page; and offer a way out.
import { Component, type ReactNode } from 'react';

export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div style={{ maxWidth: 560, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', color: '#2a2622' }}>
        <h2 style={{ margin: '0 0 8px' }}>Something went wrong drawing the page.</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'rgba(0,0,0,0.06)', padding: 12, borderRadius: 8 }}>{`${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 5).join('\n')}`}</pre>
        <button
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px solid #aaa', cursor: 'pointer' }}
          onClick={() => {
            try {
              Object.keys(localStorage)
                .filter((k) => k.startsWith('cd'))
                .forEach((k) => localStorage.removeItem(k));
            } catch {
              /* nothing saved */
            }
            location.href = location.pathname;
          }}
        >
          Clear saved settings and reload
        </button>
      </div>
    );
  }
}
