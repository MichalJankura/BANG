import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LangProvider } from './i18n';
import './ds/tokens.css';
import './ds/bundle.css';
import './styles.css';
import './rules.css';
import './rules2.css';
import './home.css';
import './game.css';
import './lang.css';
import './mobile.css';
import './phone.css';
import './table.css';
import './goldrush.css';
import './join.css';
import './ranked.css';

createRoot(document.getElementById('root')!).render(<LangProvider><App /></LangProvider>);
