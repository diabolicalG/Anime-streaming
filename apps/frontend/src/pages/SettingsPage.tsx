import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

type Preferences = { theme: string; autoPlayNext: boolean; skipIntro: boolean; subtitleLang: string; videoQuality: string };

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [section, setSection] = useState('Playback');
  const [prefs, setPrefs] = useState<Preferences>({
    theme: 'dark', autoPlayNext: true, skipIntro: false, subtitleLang: 'en', videoQuality: 'auto',
  });
  const [username, setUsername] = useState(user?.username ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/api/user/preferences').then(({ data }) => setPrefs(data.data)).catch(() => undefined);
  }, []);

  const savePreferences = async () => {
    const response = await api.patch('/api/user/preferences', prefs);
    setPrefs(response.data.data);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const saveProfile = async () => {
    const response = await api.patch('/api/user/profile', { username });
    setUser(response.data.data);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const sections = ['Account & security', 'Playback', 'Subtitles & audio', 'Notifications', 'Privacy', 'Devices'];

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">OBSIDIAN / 10</div>
      <h1 className="kuro-page-title">Settings & Preferences</h1>
      <p className="kuro-page-copy">Account risk stays separate from viewing choices, with explicit controls and confirmation-safe actions.</p>

      <section className="kuro-section kuro-data-panel">
        <div className="kuro-settings-list">
          {sections.map((name) => (
            <button type="button" key={name} className="kuro-setting-row" onClick={() => setSection(name)} style={{ width: '100%', textAlign: 'left', background: section === name ? 'rgba(155,108,255,.07)' : 'transparent', color: 'inherit' }}>
              <span>{name}</span><span className="kuro-history-meta">{section === name ? 'Open' : ''}</span><span>›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="kuro-section kuro-data-panel">
        <div className="kuro-toolbar">
          <div><div className="kuro-eyebrow">{section.toUpperCase()}</div><h2>{section}</h2></div>
          {saved ? <span className="kuro-history-meta">Saved</span> : null}
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 16, maxWidth: 620 }}>
          {section === 'Account & security' && (
            <label className="kuro-field"><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          )}
          {section === 'Playback' && (
            <>
              <label className="kuro-field"><span>Video quality</span><select value={prefs.videoQuality} onChange={(e) => setPrefs({ ...prefs, videoQuality: e.target.value })}><option value="auto">Auto</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option></select></label>
              <label className="kuro-field"><span><input type="checkbox" checked={prefs.autoPlayNext} onChange={(e) => setPrefs({ ...prefs, autoPlayNext: e.target.checked })} /> Auto-play next episode</span></label>
              <label className="kuro-field"><span><input type="checkbox" checked={prefs.skipIntro} onChange={(e) => setPrefs({ ...prefs, skipIntro: e.target.checked })} /> Skip intro when timing data exists</span></label>
            </>
          )}
          {section === 'Subtitles & audio' && (
            <label className="kuro-field"><span>Preferred subtitle language</span><select value={prefs.subtitleLang} onChange={(e) => setPrefs({ ...prefs, subtitleLang: e.target.value })}><option value="en">English</option><option value="ja">Japanese</option><option value="es">Spanish</option><option value="fr">French</option></select></label>
          )}
          {['Notifications', 'Privacy', 'Devices'].includes(section) && <div className="kuro-page-note">This section is represented in the current Kuro design system. Existing backend support is intentionally left unchanged until the corresponding feature contract is defined.</div>}
          <div><button type="button" className="kuro-button kuro-button-primary" onClick={() => void (section === 'Account & security' ? saveProfile() : savePreferences())}>Save changes</button></div>
        </div>
      </section>
    </div>
  );
}
