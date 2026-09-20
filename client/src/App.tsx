import React from "react";

/**
 * Source entry for a future Vite build. The dependency-free `client/app.js`
 * is served by the prototype server so the project runs without downloading
 * packages; this component keeps the React/TypeScript surface explicit.
 */
export default function App() {
  return (
    <main className="react-shell">
      <h1>Spatial collaborative canvas</h1>
      <p>Use the served prototype to join a shared room.</p>
    </main>
  );
}
