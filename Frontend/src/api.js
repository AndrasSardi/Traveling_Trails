const API_URL = process.env.REACT_APP_API_URL;

export async function calculateRoute({preset, distanceMode, speedMode, items, controllerRef}) {
    const controller = new AbortController();
    controllerRef.current = controller;

    const response = await fetch(`${API_URL}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            preset,
            distanceMode,
            speedMode,
            items
        }),
        signal: controller.signal
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error: ${response.status}`);
    }

    return response.json();
}