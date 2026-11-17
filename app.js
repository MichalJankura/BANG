// Vstupny bod pre Plesk Node.js (Passenger). Passenger si sam podsunie port, preto server nesmie byt spusteny cez `npm start`.
// Server sa pri builde (`npm run build`) zbali do apps/server/dist/index.mjs, takze tsx za behu netreba.
import('./apps/server/dist/index.mjs').catch((err) => {
  console.error(err);
  process.exit(1);
});
