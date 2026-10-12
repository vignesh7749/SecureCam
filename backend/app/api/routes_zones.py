import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.zones.schemas import (
    SecurityZone,
    ZoneCreateRequest,
    ZoneUpdateRequest,
    ZoneViolationRecord,
    SecurityEventRecord
)
from app.zones.zone_manager import zone_manager

logger = logging.getLogger("securecam.routes_zones")

router = APIRouter(tags=["Emergency Zones & Dwell Intelligence"])

@router.get("/zones", response_model=List[SecurityZone])
async def list_zones():
    """Returns all configured security zones."""
    return zone_manager.get_zones()

@router.post("/zones", response_model=SecurityZone, status_code=status.HTTP_201_CREATED)
async def create_zone(request: ZoneCreateRequest):
    """Creates and persists a new security zone with geometry validation."""
    try:
        zone = zone_manager.add_zone(request)
        return zone
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error creating zone: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create zone: {str(e)}"
        )

@router.get("/zones/{zone_id}", response_model=SecurityZone)
async def get_zone(zone_id: str):
    """Retrieves a single security zone by ID."""
    zone = zone_manager.get_zone(zone_id)
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found."
        )
    return zone

@router.put("/zones/{zone_id}", response_model=SecurityZone)
async def update_zone(zone_id: str, request: ZoneUpdateRequest):
    """Updates an existing security zone configuration."""
    try:
        updated = zone_manager.update_zone(zone_id, request)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Zone '{zone_id}' not found."
            )
        return updated
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str):
    """Deletes a security zone."""
    success = zone_manager.delete_zone(zone_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found."
        )
    return {"deleted": True, "zoneId": zone_id}

@router.post("/zones/{zone_id}/enable", response_model=SecurityZone)
async def enable_zone(zone_id: str):
    """Arms / enables a security zone."""
    zone = zone_manager.toggle_zone(zone_id, enabled=True)
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found."
        )
    return zone

@router.post("/zones/{zone_id}/disable", response_model=SecurityZone)
async def disable_zone(zone_id: str):
    """Disarms / disables a security zone."""
    zone = zone_manager.toggle_zone(zone_id, enabled=False)
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Zone '{zone_id}' not found."
        )
    return zone

@router.get("/zones/{zone_id}/violations", response_model=List[ZoneViolationRecord])
async def get_zone_violations(zone_id: str):
    """Retrieves all violation records for a specific zone."""
    return zone_manager.get_violations(zone_id)

@router.get("/violations", response_model=List[ZoneViolationRecord])
async def get_all_violations():
    """Retrieves all active and historical zone violation records."""
    return zone_manager.get_violations()

@router.post("/violations/{violation_id}/acknowledge")
async def acknowledge_violation(violation_id: str):
    """Acknowledges an active zone violation."""
    success = zone_manager.acknowledge_violation(violation_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Violation '{violation_id}' not found."
        )
    return {"acknowledged": True, "violationId": violation_id}

@router.get("/events", response_model=List[SecurityEventRecord])
async def get_security_events(limit: int = Query(default=100, ge=1, le=500)):
    """Retrieves the security event audit log."""
    return zone_manager.get_events(limit=limit)

@router.post("/events/{event_id}/acknowledge")
async def acknowledge_security_event(event_id: str):
    """Acknowledges a security event."""
    success = zone_manager.acknowledge_event(event_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Security event '{event_id}' not found."
        )
    return {"acknowledged": True, "eventId": event_id}
