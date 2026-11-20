import os, math, presets, algorithm, httpx, asyncio, threading

from fastapi import FastAPI, HTTPException, Request, Response
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal
from starlette.concurrency import run_in_threadpool
from algorithm import CalculationCancelled

load_dotenv()
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class City(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    city: str


class RequestData(BaseModel):
    preset: Literal["hungary", "uk", "france", "germany", "usa", "europe", "india", "none"]
    distanceMode: Literal["drive", "line"]
    speedMode: Literal["fast", "quality"]
    items: list[City]


@app.post("/")
async def root(data: RequestData, request: Request):
    location_distance_matrix = None

    if data.distanceMode == "drive":

        if data.preset == "hungary":
            location_distance_matrix = presets.hungary

        elif data.preset == "uk":
            location_distance_matrix = presets.uk

        elif data.preset == "france":
            location_distance_matrix = presets.france

        elif data.preset == "germany":
            location_distance_matrix = presets.germany

        elif data.preset == "none":
            location_distance_matrix = await get_driving_matrix(data.items)

    elif data.distanceMode == "line":

        location_distance_matrix = [
            [
                get_absolute_distance(city, secondCity)
                for secondCity in data.items
            ]
            for city in data.items
        ]

    cancel_event = threading.Event()

    calculation = asyncio.create_task(
        run_in_threadpool(
            algorithm.run_algorithm,
            location_distance_matrix,
            data.speedMode,
            cancel_event
        )
    )

    while not calculation.done():
        if await request.is_disconnected():
            cancel_event.set()

            try:
                await calculation
            except CalculationCancelled:
                pass

            return Response(status_code=499)
        await asyncio.sleep(0.1)

    return await calculation

    """
    output = await run_in_threadpool(
        algorithm.run_algorithm,
        location_distance_matrix,
        data.speedMode
    )

    return output
    """

async def get_driving_matrix(cities: list[City]):
    if not GEOAPIFY_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Geoapify API key is not configured"
        )

    url = "https://api.geoapify.com/v1/routematrix"

    params = {
        "apiKey": GEOAPIFY_API_KEY
    }

    locations = [
        {"location": [city.longitude, city.latitude]}
        for city in cities
    ]

    matrix_data = {
        "mode": "drive",
        "sources": locations,
        "targets": locations
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                params=params,
                json=matrix_data
            )

        response.raise_for_status()
        response_data = response.json()

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Geoapify request timed out"
        )

    except httpx.HTTPStatusError:
        raise HTTPException(
            status_code=502,
            detail="Geoapify returned an error: \n" + response.json().get("message")
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Geoapify"
        )

    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Geoapify returned invalid JSON"
        )

    try:
        matrix = [
            [item["distance"] for item in row]
            for row in response_data["sources_to_targets"]
        ]

        if len(matrix) != len(cities) or any(
                len(row) != len(cities) for row in matrix
        ):
            raise ValueError("Unexpected matrix dimensions")

    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Geoapify returned an unexpected matrix format"
        )

    for i, row in enumerate(matrix):
        for j, distance in enumerate(row):
            if distance is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"No driving route between city {i + 1} and city {j + 1}"
                )

    return matrix

def get_absolute_distance(first: City, second: City):
    EARTH_RADIUS = 6371.0
    LA1 = math.radians(first.latitude)
    LO1 = math.radians(first.longitude)
    LA2 = math.radians(second.latitude)
    LO2 = math.radians(second.longitude)

    output = 2 * EARTH_RADIUS * math.asin(math.sqrt((math.sin((LA2 - LA1) / 2) ** 2) + math.cos(LA1) * math.cos(LA2) * (math.sin((LO2 - LO1) / 2) ** 2)))

    return round(output * 1000)