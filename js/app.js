// ===== APP WRAPPER & MOUNT =====
// Depends on: React (global), Game component (game.js), all globals

// Global data containers (populated by fetch in App)
let TACTICS = {};
let SQUAD_SLOTS = [];
let INITIAL_ROSTER = [];
let MISSIONS = [];
let TRAITS = {};
let ECONOMY = {};
let REPUTATION = {};
let RECRUIT_NAMES = [];
let RECRUIT_CALLSIGNS = [];

const App = () => {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch('data.json')
            .then(r => {
                if (!r.ok) throw new Error("Failed to load core data.");
                return r.json();
            })
            .then(data => {
                TACTICS = data.TACTICS;
                SQUAD_SLOTS = data.SQUAD_SLOTS;
                INITIAL_ROSTER = data.INITIAL_ROSTER;
                MISSIONS = data.MISSIONS;
                TRAITS = data.TRAITS || {};
                ECONOMY = data.ECONOMY || {};
                REPUTATION = data.REPUTATION || {};
                RECRUIT_NAMES = data.RECRUIT_NAMES || [];
                RECRUIT_CALLSIGNS = data.RECRUIT_CALLSIGNS || [];
                setLoaded(true);
            })
            .catch(e => setError(e.message));
    }, []);

    if (error) return (
        <div className="fatal-error">
            FATAL ERROR: {error} <br />
            (Please ensure you are serving this file via a web server to support JSON fetching)
        </div>
    );

    if (!loaded) return (
        <div className="loading-screen">
            Pinging HQ... (Loading Assets)
        </div>
    );

    return <Game />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
