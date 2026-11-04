export const ACCENT_STORAGE_KEY = "pypr-accent"

/** Inline <head> script: applies the saved accent before first paint (no flash). Server-safe. */
export const accentScript = `try{var a=localStorage.getItem("${ACCENT_STORAGE_KEY}");if(a)document.documentElement.dataset.accent=a}catch(e){}`
