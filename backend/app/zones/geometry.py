import math
from typing import List, Tuple
from app.detection.schemas import BoundingBox
from app.zones.schemas import ZonePoint, SecurityZone

def compute_bottom_center_anchor(box: BoundingBox) -> Tuple[float, float]:
    """
    Computes the normalized (0-100%) bottom-center ground contact anchor point of a bounding box.
    This approximates the object's ground contact point and is ideal for surveillance zone detection.

    Formula:
        x_anchor = (x1 + x2) / 2  (or box.x + box.width / 2)
        y_anchor = y2             (or box.y + box.height)
    """
    anchor_x = box.x + (box.width / 2.0)
    anchor_y = box.y + box.height

    # Clamp to [0.0, 100.0]
    clamped_x = float(max(0.0, min(100.0, anchor_x)))
    clamped_y = float(max(0.0, min(100.0, anchor_y)))
    return (clamped_x, clamped_y)

def point_in_rectangle(px: float, py: float, points: List[ZonePoint]) -> bool:
    """
    Tests whether normalized point (px, py) is inside a rectangular zone.
    Computes axis-aligned bounds across all vertices.
    """
    if len(points) < 4:
        return False
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return (min_x <= px <= max_x) and (min_y <= py <= max_y)

def point_in_polygon_ray_casting(px: float, py: float, polygon: List[ZonePoint]) -> bool:
    """
    Robust Ray-Casting Point-in-Polygon algorithm.
    Casts a horizontal ray in the positive x direction and counts edge intersections.
    Works for arbitrary convex or concave polygons with normalized coordinates.
    """
    n = len(polygon)
    if n < 3:
        return False

    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i].x, polygon[i].y
        xj, yj = polygon[j].x, polygon[j].y

        # Check if the horizontal ray at y intersects the line segment between (xi, yi) and (xj, yj)
        intersect = ((yi > py) != (yj > py)) and (
            px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi
        )
        if intersect:
            inside = not inside
        j = i

    return inside

def is_point_in_zone(px: float, py: float, zone: SecurityZone) -> bool:
    """Evaluates whether point (px, py) is contained within the zone perimeter."""
    if not zone.enabled:
        return False

    if zone.shape == "rectangle" and len(zone.points) >= 4:
        return point_in_rectangle(px, py, zone.points)
    return point_in_polygon_ray_casting(px, py, zone.points)

def is_object_in_zone(box: BoundingBox, zone: SecurityZone) -> bool:
    """
    Determines whether a tracked object is inside a security zone
    using its real bounding box ground contact anchor point (bottom-center).
    """
    if not zone.enabled:
        return False

    anchor_x, anchor_y = compute_bottom_center_anchor(box)
    return is_point_in_zone(anchor_x, anchor_y, zone)

def compute_polygon_area(points: List[ZonePoint]) -> float:
    """Computes polygon surface area in normalized percentage squared via Shoelace formula."""
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i].x * points[j].y
        area -= points[j].x * points[i].y
    return abs(area) / 2.0

def validate_zone_geometry(points: List[ZonePoint], shape: str) -> Tuple[bool, str]:
    """
    Validates zone geometry per Stage 5 requirements:
    - Minimum vertex count (>= 3 for polygon, >= 4 for rectangle)
    - Normalized coordinate bounds [0.0, 100.0]
    - Non-zero surface area (rejects degenerate flat lines or collapsed points)
    """
    if shape == "rectangle" and len(points) < 4:
        return False, f"Rectangle zone requires at least 4 corner points, got {len(points)}"
    if len(points) < 3:
        return False, f"Polygon zone requires at least 3 vertices, got {len(points)}"

    for idx, p in enumerate(points):
        if not (0.0 <= p.x <= 100.0 and 0.0 <= p.y <= 100.0):
            return False, f"Point #{idx} ({p.x}, {p.y}) outside normalized canvas bounds [0, 100]"

    area = compute_polygon_area(points)
    if area < 0.05:
        return False, f"Zone area too small or degenerate (area: {area:.4f}%^2)"

    return True, "VALID"
