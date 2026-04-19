from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from shared.schemas import PersonAttributes, VehicleAttributes

router = APIRouter(prefix="/attributes", tags=["attributes"])


@router.post("/person", response_model=PersonAttributes)
async def extract_person_attributes(
    image: UploadFile = File(...),
) -> PersonAttributes:
    """Extract person attributes (hat, glasses, colors, etc.) from a crop."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    return PersonAttributes(
        hat=False,
        glasses=True,
        mask=False,
        upper_color="blue",
        lower_color="black",
        bag=False,
        backpack=True,
    )


@router.post("/vehicle", response_model=VehicleAttributes)
async def extract_vehicle_attributes(
    image: UploadFile = File(...),
) -> VehicleAttributes:
    """Extract vehicle attributes (color, type, brand) from a crop."""
    _data = await image.read()

    # TODO: Replace with actual model inference
    return VehicleAttributes(
        color="white",
        vehicle_type="sedan",
        brand="Toyota",
    )
