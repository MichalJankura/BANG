// Vstupny bod pre Plesk Node.js (Passenger). Passenger si sam podsunie port, preto server nesmie byt spusteny cez `npm start`.
// Server je v TypeScripte, tsx ho za behu preklada. Pred prvym spustenim treba `npm install` a `npm run build`.
const { register } = require('tsx/esm/api');

register();
import('./apps/server/src/index.ts').catch((err) => {
  console.error(err);
  process.exit(1);
});
