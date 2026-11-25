// Zugang zu deinem Supabase-Projekt. Der "anon"-Schlüssel ist öffentlich gedacht (Schutz übernehmen die Regeln in supabase/schema.sql).
// Leer lassen = Online-Funktionen aus. Alternativ in der App unter Einstellungen › Konto eintragen.
export const CONFIG = {
  url: '',      // z. B. 'https://abcdefgh.supabase.co'
  anonKey: '',  // Project Settings › API › anon public
  providers: ['google', 'github', 'apple'], // in Supabase unter Authentication › Providers aktivieren
};
