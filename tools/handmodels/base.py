"""Shared geometry for every hand model: the game's own curl and the
thumb-index aperture, both on the model's WORLD landmarks (metres,
hand-centred) so a hand turned towards the lens does not foreshorten.
MediaPipe's 21-point order is the lingua franca; WiLoR's MANO joints are
re-ordered into it in wilor_model.py."""
import math

TIPS = (8, 12, 16, 20)            # index, middle, ring, pinky fingertips
WRIST, MIDDLE_MCP, THUMB_TIP, INDEX_TIP = 0, 9, 4, 8
# one bone per finger segment, MediaPipe order, for drawing
BONES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8),
         (5, 9), (9, 10), (10, 11), (11, 12), (9, 13), (13, 14), (14, 15), (15, 16),
         (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]


def palm_len(world):
    return math.dist(world[MIDDLE_MCP], world[WRIST])


def curl(world):
    """Mean fingertip-to-wrist distance over palm length: about 2 open, 1 fist.
    Identical to tracker.js handCurl and zed_bridge.mp_curl."""
    if not world:
        return None
    p = palm_len(world)
    if p < 0.02:
        return None
    return sum(math.dist(world[i], world[WRIST]) for i in TIPS) / 4 / p


def aperture(world):
    """Thumb tip to index tip over palm length (the clinical grasp aperture,
    normalised so camera distance drops out). About 1.0-1.3 wide open."""
    if not world:
        return None
    p = palm_len(world)
    if p < 0.02:
        return None
    return math.dist(world[THUMB_TIP], world[INDEX_TIP]) / p


class HandModel:
    """detect(rgb, side, t_ms) -> None or
       {"pts": [[x, y] * 21] in crop pixels, "world": [[x, y, z] * 21] m or None,
        "conf": 0..1}"""
    name = "base"

    def detect(self, rgb, side, t_ms):
        raise NotImplementedError

    def info(self):
        return {"name": self.name}


class BodyModel:
    """detect(bgr) -> list of {"lm": {mp_index: [x, y, conf]} in frame pixels,
    "box": [x0, y0, x1, y1]} - the subset of the game's 33-landmark layout the
    model can fill (nose, shoulders, elbows, wrists, hips)."""
    name = "base"

    def detect(self, bgr):
        raise NotImplementedError

    def info(self):
        return {"name": self.name}
