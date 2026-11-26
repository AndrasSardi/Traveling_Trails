import './App.css';
import {MapContainer, Marker, Polyline, TileLayer, Tooltip, useMapEvents} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {useState, memo, useRef, useEffect} from "react";
import {createPortal} from "react-dom";
import {hungary, uk, france, germany, unitedStatesOfAmerica, europe, india} from "./presets.js";
import { FaRegQuestionCircle, FaInfoCircle } from "react-icons/fa";

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import {calculateRoute} from "./api";


let DefaultIcon = L.icon({
    iconSize: [25, 41],
    iconAnchor: [13, 41],
    iconUrl: icon,
    shadowUrl: iconShadow
});

L.Marker.prototype.options.icon = DefaultIcon;

function MapClickHandler({onLocationClick}) {
    useMapEvents({
        click(e) {
            const {lat, lng} = e.latlng;

            onLocationClick({
                latitude: lat,
                longitude: lng,
            });
        },
    });

    return null;
}

function AboutModal({isOpen, onClose}) {
    if (!isOpen) return null;

    return createPortal(
        <div
            className={"modal-background"}
            onClick={onClose}
        >
            <div
                className={"modal"}
                role={"dialog"}
                aria-modal={"true"}
                aria-labelledby={"about-title"}
                onClick={e => e.stopPropagation()}
            >
                <h2>What is Traveling Trails?</h2>
                <p>Traveling Trail is an application used to simulate and solve the Traveling Salesman problem.</p>
                <h2>What is the Traveling Salesman problem?</h2>
                <p>The Traveling Salesman problem (TSP) is a mathematical optimization problem in which hypothetical
                    salesman needs to travel to a given set of cities, and wants to know the shortest possible route
                    that visits every city exactly once and returns to the starting point. This problem becomes increasingly
                    difficult to solve as the number of cities grows, making it a well-known challenge in computer
                    science and optimization.</p>
                <h2>How do I use this website?</h2>
                <p>Start by clicking on the map to select the cities you want to visit. Alternatively, you can choose from
                    one of the predefined lists of cities. Once you have selected your cities, click the "Calculate Best
                    Route" button to start the algorithm. The application will then calculate a route and display the
                    resulting path on the map.</p>
                <h2>How does this website work?</h2>
                <p>First, the application obtains the distances between all selected cities, either by calculating them
                    directly or by retrieving them through an external API. It then uses a memetic algorithm to generate,
                    evaluate, and improve possible routes until it finds a high-quality solution.</p>
                <h2>What is a memetic algorithm?</h2>
                <p>A memetic algorithm is an extension of an evolutionary algorithm. Evolutionary algorithms are inspired by
                    the process of biological evolution: they begin with a population of potential solutions and iteratively
                    improve them through mechanisms such as selection, mutation, and recombination. Memetic algorithms build
                    on this approach by incorporating additional problem-specific heuristics to refine individual solutions.
                    This helps guide the search toward better results and can significantly improve its efficiency.</p>

            </div>
        </div>,
        document.body
    );
}

function InfoModal({isOpen, onClose}) {
    if (!isOpen) return null;

    return createPortal(
        <div
            className={"modal-background"}
            onClick={onClose}
        >
            <div
                className={"modal"}
                role={"dialog"}
                aria-modal={"true"}
                aria-labelledby={"about-title"}
                onClick={e => e.stopPropagation()}
            >
                <h2>User Notices</h2>
                <p>This website uses <strong>Nominatim Reverse Geocoding API</strong> to determine what city you click on.
                    It's rate limit is 1 request per second, as such please try not to exceed this limit. </p>
                <br></br>
                <p>When determining driving distance between cities, this website uses <strong>Geoapify Route Matrix API</strong>.
                    This function may not work if the API's daily request limit is exceeded.
                    In this case, use either the "Straight-line distance" option or a preset, as neither is limited.</p>
                <br></br>
                <p>Please also note that the Geoapify Route Matrix API is limited to 10,000,000 meters total distance when returning a Route Matrix,
                    as such either use cities closer to each other or fewer of them.</p>
            </div>
        </div>,
        document.body
    );
}

const CityList = memo(function CityList({listOfCities, result, cityNumberLimit}) {
    if(!result) {
        return (
            <div className={"cities"}>
                <h2 className={"cities-title"}>
                    Selected cities ({listOfCities.length}/{cityNumberLimit})
                </h2>
                <ol>
                    {listOfCities.map((location, index) => (
                        <li key={`${location.city}-${location.latitude}-${location.longitude}`}>
                            {location.city}
                        </li>
                    ))}
                </ol>
            </div>
        )
    } else {
        return (
            <div className={"cities"}>
                <h2 className={"cities-title"}>
                    Order of travel
                </h2>
                <ol>
                    {result.travel_order.map((cityIndex, index) => (
                        <li key={cityIndex}>
                            {listOfCities[cityIndex].city}
                        </li>
                    ))}
                </ol>
            </div>
        )
    }
});

const PresetList = memo(function PresetList({ distanceMode, selectedPreset, onChange }) {
    const presets = distanceMode === 'line' ?
        ["none", "hungary", "uk", "europe", "usa"] :
        ["none", "hungary", "uk", "france", "germany"]

    return (
        <div className="preset-select">
            {presets.map(preset => (
                <label key={preset}>
                    <input
                        type="radio"
                        name="preset"
                        value={preset}
                        checked={selectedPreset === preset}
                        onChange={onChange}
                    />
                    {preset.charAt(0).toUpperCase() + preset.slice(1)}
                </label>
            ))}
        </div>
    );
});

function App() {
    const [selectedCities, setSelectedCities] = useState([]);
    const [selectedPreset, setSelectedPreset] = useState('none');
    const [selectedDistanceMode, setSelectedDistanceMode] = useState('line');
    const [selectedSpeedMode, setSelectedSpeedMode] = useState('fast');
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null);
    const [aboutModalIsOpen, setAboutModalIsOpen] = useState(false);
    const [infoModalIsOpen, setInfoModalIsOpen] = useState(false);
    const [startTime, setStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const cityNumberLimit = selectedDistanceMode === 'line' ? 50 : 30;
    const controllerRef = useRef(null);

    const handleMapClick = async ({latitude, longitude}) => {
        console.log("Clicked location:", longitude, latitude);
        if (selectedCities.length >= cityNumberLimit || loading) {
            return;
        }

        try {
            const params = new URLSearchParams({
                lat: latitude,
                lon: longitude,
                format: "json",
            });

            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?${params}`
            );

            if (!response.ok) {
                throw new Error("Reverse geocoding failed");
            }

            const data = await response.json();

            const city =
                data.address?.city ??
                data.address?.town ??
                data.address?.village ??
                null;

            if (!city) {
                console.log("Could not determine city");
                return;
            }

            const selectedCity = {
                longitude,
                latitude,
                city,
            };

            setSelectedCities(prev => {
                if (prev.length >= cityNumberLimit) {
                    return prev;
                }
                if(prev.some(e => e.city === city)) {
                    if(selectedCities.some(existing =>
                        Math.abs(existing.latitude - latitude) < 0.1 &&
                        Math.abs(existing.longitude - longitude) < 0.1
                    )) {
                        console.log("City already selected");
                        return prev;
                    }
                }
                return [...prev, selectedCity];
            });

            setResult(null)

            if(selectedPreset !== "none"){
                setSelectedPreset("none")
            }

        } catch (error) {
            console.error("Reverse geocoding error:", error);
        }

        console.log("Clicked cities:", selectedCities);
    };

    const removeCity = (name) => {
        if (loading) {
            return;
        }
        setSelectedCities((state) => state.filter((item) => item.city !== name))
        if (result != null){
            setResult(null)
        }
        if(selectedPreset !== "none"){
            setSelectedPreset("none")
        }
    }

    const handleButtonClick = async (event) => {
        event.preventDefault();
        setLoading(true);
        setStartTime(Date.now());

        try {
            const newResult = await calculateRoute({
                preset: selectedPreset,
                distanceMode: selectedDistanceMode,
                speedMode: selectedSpeedMode,
                items: selectedCities,
                controllerRef: controllerRef,
            });

            setResult(newResult);
        } catch (error) {
            if (error.name === "AbortError") {
                console.log("Request cancelled by user");
            } else {
                console.error("Error:", error);
                alert(error.message);
            }
        } finally {
            setLoading(false);
            controllerRef.current = null;
            setStartTime(null);
            setElapsedTime(0);
        }
    };

    const presets = {
        hungary,
        uk,
        france,
        germany,
        usa: unitedStatesOfAmerica,
        europe,
        india
    };

    const handleRadioChange = (event) => {
        if (loading) return;

        const preset = event.target.value;

        setSelectedPreset(preset);
        setSelectedCities(presets[preset] ?? []);
        setResult(null);
    };

    const handleDistanceModeChange = (event) => {
        if (loading) {
            return;
        }
        if(event.target.value === 'line'){
            setSelectedPreset('none')
            setSelectedCities([])
            setResult(null)
        } else {
            setSelectedPreset('none')
            setSelectedCities([])
            setResult(null)
        }
        setSelectedDistanceMode(event.target.value);
    }

    const handleSpeedModeChange = (event) => {
        if (loading) {
            return;
        }
        setSelectedSpeedMode(event.target.value);
    }

    const routePositions = result
        ? [
            ...result.travel_order.map(index => [
                selectedCities[index].latitude,
                selectedCities[index].longitude
            ]),
            [
                selectedCities[result.travel_order[0]].latitude,
                selectedCities[result.travel_order[0]].longitude
            ]
        ]
        : [];

    function cancelCalculation() {
        controllerRef.current?.abort();
    }

    useEffect(() => {
        if (!startTime) return;

        const interval = setInterval(() => {
            const elapsed = Math.floor(
                (Date.now() - startTime) / 1000
            );
            setElapsedTime(elapsed);
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    };

    return (
        <div className={"container"}>
            <div className={"header"}>
                <button
                    type="button"
                    className={"about-button"}
                    onClick={() => setAboutModalIsOpen(true)}
                    aria-label="About Traveling Trail"
                >
                    About
                </button>
                <h1>Traveling Trail</h1>
                <button
                    type="button"
                    className={"information-button"}
                    onClick={() => setInfoModalIsOpen(true)}
                    aria-label="Information and user notices"
                >
                    <FaInfoCircle className={"information-icon"}/>
                </button>
            </div>
            <MapContainer className={"map"} center={[48.3077, 10.3986]} zoom={5}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {selectedCities.map((city) => (
                    <Marker
                        key={city.index}
                        position={[city.latitude, city.longitude]}
                        eventHandlers={{
                            click: () => removeCity(city.city)
                        }}
                    >
                        <Tooltip>
                            {city.city}
                        </Tooltip>
                    </Marker>
                ))}
                {result && (
                    <Polyline positions = {routePositions}/>
                )}
                <MapClickHandler onLocationClick={handleMapClick}/>
            </MapContainer>
            <div className={"sidebar"}>
                <form className={"form"}>
                    <h3 className={"mode-header"}>Select algorithm options:</h3>
                    <div className={"mode-select"}>
                        <select value={selectedDistanceMode} onChange={handleDistanceModeChange}>
                            <option value="line">Straight-line distance</option>
                            <option value="drive">Driving distance</option>
                        </select>
                        <div className="tooltip-container">
                            <FaRegQuestionCircle className={"help"}/>

                            <span className="tooltip-text">
                            <h1>Choose metric used to calculate distance between cities</h1>
                            <u>Straight-line distance:</u> direct distance in a straight line<br/>
                            <u>Driving distance:</u> distance when driving by car

                        </span>
                        </div>
                    </div>
                    {/*
                Contains dropdown menu to select performance mode.
                With hosting CPU allowance, anything but fast is too slow, so it has been removed. Uncomment to put back.
                <div className={"mode-select"}>
                    <select value={selectedSpeedMode} onChange={handleSpeedModeChange}>
                        <option value="fast">Fast</option>
                        <option value="quality">Quality</option>
                    </select>
                    <div className="tooltip-container">
                        <FaRegQuestionCircle className={"help"}/>

                        <span className="tooltip-text">
                            <h1>Choose algorithm performance mode</h1>
                            <u>Fast:</u> Fastest performance. Takes a few seconds at 30 cities, and a dozen seconds at 50 cities.<br/>
                            <u>Quality:</u> Maximum performance. Takes half a minute at 30 cities, and 3+ minutes at 50 cities.<br/>
                        </span>
                    </div>
                </div>
                */}
                    <div className={"preset-header"}>
                        <h3>Select a preset:</h3>
                        <div className="tooltip-container">
                            <FaRegQuestionCircle className={"help"}/>

                            <span className="tooltip-text">
                            <h1>Picks group of pre-selected cities</h1>
                            Use "None" to pick your own cities
                        </span>
                        </div>
                    </div>
                    <PresetList distanceMode={selectedDistanceMode} onChange={handleRadioChange} selectedPreset={selectedPreset}></PresetList>
                    <button
                        type={"submit"}
                        className={"button"}
                        onClick={handleButtonClick}
                        disabled={(selectedCities.length === 0 && selectedPreset === 'none') || loading}
                    >
                        {loading ? "Processing..." : "Calculate Best Route"}
                    </button>
                    {loading && (
                        <div className={"loading-container"}>
                            <button
                                className={"cancel-button"}
                                onClick={cancelCalculation}
                            >
                                Cancel
                            </button>
                            <p>{formatTime(elapsedTime)}</p>
                        </div>
                    )}
                </form>
                <CityList listOfCities={selectedCities} result={result} cityNumberLimit={cityNumberLimit}></CityList>
            </div>
            <AboutModal isOpen={aboutModalIsOpen} onClose={() => setAboutModalIsOpen(false)}></AboutModal>
            <InfoModal isOpen={infoModalIsOpen} onClose={() => setInfoModalIsOpen(false)}></InfoModal>
        </div>
    );
}

export default App;
